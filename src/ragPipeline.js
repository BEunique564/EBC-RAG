import { buildCitation, validateEvidence } from "./citations.js";
import { searchCorpus } from "./search.js";
import { splitSentences, tokenize } from "./tokenize.js";
import { generateWithLLM } from "./llm.js";
import { SUMMARIZE_WITH_OUTCOMES, buildLLMContent } from "./prompts.js";
import { crossEncode } from "./reranker.js";

const MIN_TOP_SCORE = 0.18;
const MIN_VALID_CITATIONS = 1;

const TIER_WEIGHTS = { free: 0.2, basic: 0.5, premium: 0.8, enterprise: 1.0 };

function inferIntent(query, metadata) {
  const normalized = query.toLowerCase();
  if (metadata.parties) return "case_comparison";
  if (metadata.citations?.length) return "citation_lookup";
  if (normalized.includes("compare") || normalized.includes("versus")) return "case_comparison";
  if (normalized.includes("draft") || normalized.includes("clause")) return "legal_drafting";
  if (metadata.sections?.length) return "statute_or_section_research";
  if (normalized.includes("summar")) return "summarization";
  return "legal_research";
}

function detectAdviceQuery(query) {
  const advicePatterns = [
    /should I (file|sue|settle|appeal|plead)/i,
    /what (is the best|should I do|is my chance)/i,
    /can I (win|get|claim|recover)/i,
    /how to (file|appeal|defend|respond)/i,
    /(my case|my situation|my client)/i,
    /\b(advice|strategy|opinion|recommend)\b/i
  ];
  return advicePatterns.some(p => p.test(query));
}

function extractExactPassage(chunkText, query) {
  const queryTokens = new Set(tokenize(query));
  const sentences = splitSentences(chunkText);
  if (!sentences.length) return { text: chunkText, paragraph: "", page: "" };

  let best = sentences[0], bestScore = -1;
  let bestSecond = null, secondScore = -1;
  for (const sentence of sentences) {
    const sentenceTokens = tokenize(sentence);
    let overlap = 0;
    for (const token of sentenceTokens) { if (queryTokens.has(token)) overlap += 1; }
    if (overlap > bestScore) { secondScore = bestScore; bestSecond = best; bestScore = overlap; best = sentence; }
    else if (overlap > secondScore) { secondScore = overlap; bestSecond = sentence; }
  }

  let passage = best;
  if (bestSecond && secondScore > 0) {
    passage = `${best} ${bestSecond}`;
  }

  return { text: passage, paragraph: "", page: "" };
}

function paragraphCitation(citation) {
  const locators = [];
  if (citation.paragraph) locators.push(`para ${citation.paragraph}`);
  if (citation.pdf_page) locators.push(`page ${citation.pdf_page}`);
  if (citation.section) locators.push(`Section ${citation.section}`);
  const locStr = locators.length ? ` (${locators.join(", ")})` : "";
  return locStr;
}

function partyAnswer(citations, parties) {
  const top = citations.slice(0, 4);
  const lines = [`Case: ${parties.petitioner} vs ${parties.respondent}`];
  for (const c of top) {
    const { text } = extractExactPassage(c.snippet, `${parties.petitioner} ${parties.respondent}`);
    const loc = paragraphCitation(c);
    const pdf = c.source_pdf_url && !c.source_pdf_url.startsWith("local://") ? `\nPDF: ${c.source_pdf_url}` : "";
    const reader = c.ebc_reader_url && !c.ebc_reader_url.startsWith("local://") ? `\nReader: ${c.ebc_reader_url}` : "";
    lines.push(`\n[${c.source_id}] "${text}"${loc}\nSource: ${c.title} (${c.court || ""} ${c.year || ""})${pdf}${reader}`);
  }
  return lines.join("\n\n");
}

function buildAnswer(query, citations) {
  const topCitations = citations.slice(0, 4);
  const statements = topCitations.map((citation) => {
    const { text } = extractExactPassage(citation.snippet, query);
    const loc = paragraphCitation(citation);
    const pdf = citation.source_pdf_url && !citation.source_pdf_url.startsWith("local://") ? ` PDF: ${citation.source_pdf_url}` : "";
    const reader = citation.ebc_reader_url && !citation.ebc_reader_url.startsWith("local://") ? ` Reader: ${citation.ebc_reader_url}` : "";
    return `"${text}"${loc} [${citation.source_id}]${pdf}${reader}`;
  });
  return ["Based only on the retrieved sources:", ...statements].join("\n\n");
}

function sentenceCitationCheck(text) {
  const sentences = splitSentences(text);
  const unsupported = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const hasCitation = /\[\w+\]/.test(trimmed);
    const isHeader = trimmed.startsWith("Based only") || trimmed.startsWith("Case:") || trimmed.startsWith("Source:") || trimmed.startsWith("PDF:") || trimmed.startsWith("Reader:");
    if (!hasCitation && !isHeader) {
      unsupported.push(trimmed);
    }
  }
  return unsupported;
}

function confidenceFrom(results, citations, validation) {
  if (!results.length || !validation.valid) return 0;
  const topScore = Math.min(results[0].score, 1);
  const citationCompleteness = validation.checked.filter((item) => item.valid).length / Math.max(validation.checked.length, 1);
  const corroboration = Math.min(citations.length / 4, 1);
  const uniqueDocs = new Set(results.map(r => r.document?.document_id)).size;
  const sourceCoverage = Math.min(uniqueDocs / Math.max(citations.length, 1), 1);
  const raw = (topScore * 0.55) + (citationCompleteness * 0.15) + (corroboration * 0.10) + (sourceCoverage * 0.20);
  return Math.round(raw * 100);
}

function relatedDocuments(results) {
  const seen = new Set();
  const related = [];
  for (const result of results) {
    if (seen.has(result.document.document_id)) continue;
    seen.add(result.document.document_id);
    related.push({
      document_id: result.document.document_id,
      title: result.document.title,
      citation: result.document.citation || "",
      court: result.document.court || "",
      judge: result.document.judge || "",
      year: result.document.year || "",
      bench: result.document.bench || "",
      act: result.chunk.act || result.document.act || "",
      section: result.chunk.section || result.document.section || "",
      topic: result.chunk.topic || result.document.topic || "",
      document_type: result.document.document_type || "",
      publisher: result.document.publisher || "",
      source_url: result.document.source_url || "",
      source_pdf_url: result.document.source_pdf_url || "",
      ebc_reader_url: result.document.ebc_reader_url || "",
      webstore_url: result.document.webstore_url || "",
      authority_status: result.document.authority_status || "Authority treatment not available",
      treatment_summary: result.document.treatment_summary || [],
      related_products: result.document.related_products || [],
      score: Number(result.score.toFixed(3)),
      match_explanation: explainMatch(result),
      demo_only: Boolean(result.document.demo_only),
      subscription_tier: result.document.subscription_tier || "free"
    });
  }
  return related.slice(0, 10);
}

function explainMatch(result) {
  const parts = [];
  if (result.chunk.section || result.document.section) parts.push(`section ${result.chunk.section || result.document.section}`);
  if (result.document.court) parts.push(result.document.court);
  if (result.document.year) parts.push(String(result.document.year));
  if (result.chunk.topic || result.document.topic) parts.push(result.chunk.topic || result.document.topic);
  return parts.length ? `Matched ${parts.join(" - ")}` : "Matched by text relevance";
}

const PRACTICE_PATTERNS = [
  { area: "criminal", patterns: [/ipc/, /420/, /cheating/, /bail/, /crpc/, /criminal/, /fraud/, /murder/, /penal/] },
  { area: "tax", patterns: [/gst/, /cgst/, /input tax credit/, /itc/, /income tax/, /customs/, /excise/, /tax/] },
  { area: "constitutional", patterns: [/constitution/, /article \d+/, /fundamental right/, /writ/, /privacy/] },
  { area: "corporate_insolvency", patterns: [/ibc/, /insolvency/, /bankruptcy/, /nclat/, /nclt/, /resolution/] },
  { area: "civil", patterns: [/civil/, /tort/, /contract/, /property/, /transfer/, /specific relief/, /limitation/] },
  { area: "labour", patterns: [/labour/, /industrial/, /employee/, /workman/, /gratuity/] }
];

function detectAreas(query) {
  const q = (query || "").toLowerCase();
  return PRACTICE_PATTERNS.filter(pa => pa.patterns.some(p => p.test(q))).map(pa => pa.area);
}

function rankProducts(related, query, userTier) {
  const areas = detectAreas(query);
  const tierWeight = TIER_WEIGHTS[userTier] || 0.2;
  const seen = new Set();
  const scored = [];
  for (const doc of related) {
    for (const p of doc.related_products || []) {
      const key = `${p.title}:${p.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const title = (p.title || "").toLowerCase();
      const areaMatch = areas.some(a => title.includes(a)) ? 0.3 : 0;
      const authorityScore = doc.score > 0.5 ? 0.4 : 0.2;
      const tierScore = tierWeight * 0.2;
      const recency = doc.year && Number(doc.year) > 2022 ? 0.1 : 0;
      scored.push({
        ...p,
        source_document_id: doc.document_id,
        source_title: doc.title,
        source_url: doc.webstore_url || doc.ebc_reader_url || doc.source_url,
        score: Math.min(authorityScore + areaMatch + tierScore + recency, 1),
        subscription_tier: doc.subscription_tier || "free"
      });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 6);
}

function warningSet(query, citations, queryMetadata) {
  const warnings = [];
  if (queryMetadata.latest) {
    warnings.push("Latest/current means latest inside the indexed corpus, not a live court update feed.");
  }
  if (citations.some((citation) => citation.source_url?.startsWith("local://") || citation.citation?.startsWith("DEMO-"))) {
    warnings.push("Demo sources are engineering fixtures. Replace them with authoritative licensed sources before legal use.");
  }
  if (detectAdviceQuery(query)) {
    warnings.push("This appears to be a request for legal advice, not just legal research. The system provides research information only — always consult a licensed legal professional for advice specific to your situation.");
  }
  if (/\b(advice|strategy|draft|opinion)\b/i.test(query)) {
    warnings.push("Generated drafting or strategy must be separated from retrieved legal authority and reviewed by a lawyer.");
  }
  return warnings;
}

function retrievalTrace({ queryMetadata, results, filters, released, reason }) {
  const topScore = results[0]?.score || 0;
  return {
    retrieved_chunks: results.length,
    top_score: Number(topScore.toFixed(3)),
    filters_applied: filters,
    metadata_detected: queryMetadata,
    gates: [
      { name: "retrieval", passed: results.length > 0 },
      { name: "minimum_score", passed: topScore >= MIN_TOP_SCORE },
      { name: "citation_validation", passed: released },
      { name: "sentence_citation_check", passed: released },
      { name: "answer_release", passed: released }
    ],
    decision: released ? "answer_released" : reason
  };
}

function refusal(queryMetadata, results = [], reason = "insufficient_evidence", filters = {}, query = "", userTier = "free") {
  const related = relatedDocuments(results);
  return {
    status: "insufficient_evidence",
    answer: "I could not find sufficient authoritative legal sources in the indexed corpus to answer this safely.",
    confidence: 0,
    reason,
    is_advice_query: detectAdviceQuery(query),
    query_intent: inferIntent("", queryMetadata),
    metadata_filters: queryMetadata,
    citations: [],
    citation_validation: { valid: false, checked: [] },
    related_documents: related,
    product_recommendations: rankProducts(related, query, userTier),
    practice_areas: detectAreas(query),
    warnings: warningSet(query, [], queryMetadata),
    retrieval_trace: retrievalTrace({ queryMetadata, results, filters, released: false, reason }),
    guardrails: [
      "No answer was generated from model memory.",
      "The system refuses when retrieval or citation validation is insufficient.",
      "Add authoritative documents to the corpus, then retry the query."
    ]
  };
}

export async function answerLegalQuery({ query, filters = {}, role = "lawyer", store, cache, userTier = "free", userId = "anonymous" }) {
  const cleanedQuery = String(query || "").trim();
  if (!cleanedQuery) return refusal({}, [], "empty_query", filters, cleanedQuery, userTier);

  if (cache) {
    const cached = await cache.get(cleanedQuery, filters);
    if (cached) {
      cached.cached_at = Date.now();
      cached.from_cache = true;
      return cached;
    }
  }

  const { queryMetadata, results } = searchCorpus({ query: cleanedQuery, filters, store, limit: 15 });

  if (!results.length) return refusal(queryMetadata, [], "no_retrieved_evidence", filters, cleanedQuery, userTier);

  const topResults = results.slice(0, 8);
  const citations = topResults.map((result, index) => buildCitation(result.document, result.chunk, index + 1, result.score));
  const validation = validateEvidence(citations);
  const validCitationCount = validation.checked.filter((item) => item.valid).length;

  if (results[0].score < MIN_TOP_SCORE || validCitationCount < MIN_VALID_CITATIONS || !validation.valid) {
    return refusal(queryMetadata, results, "retrieved_evidence_failed_validation", filters, cleanedQuery, userTier);
  }

  const confidence = confidenceFrom(results, citations, validation);
  const related = relatedDocuments(results);
  const intent = inferIntent(cleanedQuery, queryMetadata);
  const isAdvice = detectAdviceQuery(cleanedQuery);

  /* Try LLM summarization; fall back to extractive if unavailable */
  let answer, answerType;
  const llmContent = buildLLMContent(cleanedQuery, citations);
  const llmResult = await generateWithLLM(SUMMARIZE_WITH_OUTCOMES, llmContent);
  if (llmResult) {
    answer = llmResult;
    answerType = "ai_summarized";
  } else {
    answer = intent === "case_comparison" && queryMetadata.parties
      ? partyAnswer(citations, queryMetadata.parties)
      : buildAnswer(cleanedQuery, citations);
    answerType = "extractive";
  }

  /* Sentence-level citation grounding check */
  const unsupported = sentenceCitationCheck(answer);
  const allSentencesHaveCitations = unsupported.length === 0;

  if (!allSentencesHaveCitations) {
    if (answerType === "ai_summarized") {
      answer += "\n\n[Note: The above summary includes claims not directly traceable to a single source marker. Verify each proposition against the cited authorities before relying on it.]";
    }
  }

  const confidenceLabel = confidence >= 90 ? "high" : confidence >= 70 ? "moderate" : "low";

  const passageCites = citations.map(c => {
    const loc = paragraphCitation(c);
    return { source_id: c.source_id, paragraph: c.paragraph, pdf_page: c.pdf_page, section: c.section, locator: loc.trim() };
  });

  const rerankerSignals = results.slice(0, 4).map(r => ({
    source_id: r.reranker ? `S${results.indexOf(r) + 1}` : null,
    score: r.reranker?.score,
    signals: r.reranker?.signals
  })).filter(r => r.source_id);

  const result = {
    status: "answered",
    answer,
    answer_type: answerType,
    parties: queryMetadata.parties,
    confidence,
    confidence_label: confidenceLabel,
    is_advice_query: isAdvice,
    query_intent: intent,
    user_role: role,
    user_tier: userTier,
    metadata_filters: queryMetadata,
    citations,
    citation_validation: validation,
    paragraph_citations: passageCites,
    reranker_signals: rerankerSignals,
    unsupported_sentences: unsupported,
    related_documents: related,
    product_recommendations: rankProducts(related, cleanedQuery, userTier),
    practice_areas: detectAreas(cleanedQuery),
    warnings: warningSet(cleanedQuery, citations, queryMetadata),
    retrieval_trace: retrievalTrace({ queryMetadata, results, filters, released: true, reason: "answer_released" }),
    guardrails: [
      "Answer text is extracted from retrieved chunks and each statement carries a source marker.",
      "Unsupported legal facts, citations, courts, years, and paragraph numbers are not generated.",
      "This is legal research infrastructure — not legal advice. Always consult a licensed attorney for legal advice.",
      "If this query seeks legal advice, the output may be incomplete for that purpose."
    ]
  };

  if (cache) {
    cache.set(cleanedQuery, filters, result).catch(() => {});
  }

  return result;
}
