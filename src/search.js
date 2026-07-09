import { cosineSimilarity, expandTokens, tokenCounts, tokenize } from "./tokenize.js";
import { documentMatchesFilters, extractQueryMetadata, metadataBoost } from "./metadata.js";

function bm25Score(queryTokens, chunk, index) {
  const k1 = 1.4;
  const b = 0.72;
  let score = 0;

  for (const token of queryTokens) {
    const frequency = chunk.counts.get(token) || 0;
    if (!frequency) continue;

    const containingDocuments = index.documentFrequency.get(token) || 0;
    const idf = Math.log(1 + (index.chunks.length - containingDocuments + 0.5) / (containingDocuments + 0.5));
    const numerator = frequency * (k1 + 1);
    const denominator = frequency + k1 * (1 - b + b * (chunk.length / index.averageLength));
    score += idf * (numerator / denominator);
  }

  return score;
}

function normalizeScores(results, field) {
  const max = Math.max(...results.map((result) => result[field]), 0.0001);
  for (const result of results) {
    result[`${field}_normalized`] = result[field] / max;
  }
}

function phraseScore(query, chunk, document) {
  const normalizedQuery = query.toLowerCase();
  const haystack = `${document.title} ${document.citation} ${chunk.text}`.toLowerCase();
  const quotedTerms = [...query.matchAll(/"([^"]+)"/g)].map((match) => match[1].toLowerCase());

  let score = 0;
  for (const phrase of quotedTerms) {
    if (haystack.includes(phrase)) score += 0.2;
  }

  const importantPhrases = [
    "input tax credit", "section 16", "supreme court",
    "personal data", "interim resolution professional"
  ];

  for (const phrase of importantPhrases) {
    if (normalizedQuery.includes(phrase) && haystack.includes(phrase)) score += 0.12;
  }

  return Math.min(score, 0.4);
}

function keywordExactScore(query, chunk, document) {
  const q = query.toLowerCase();
  const haystack = `${document.title} ${document.citation} ${chunk.text}`.toLowerCase();
  let score = 0;

  const sectionMatch = q.match(/section\s*(\d+[a-zA-Z]?)/i);
  if (sectionMatch) {
    const sec = sectionMatch[1].toLowerCase();
    const docSec = (chunk.section || document.section || "").toLowerCase();
    if (docSec.includes(sec)) score += 0.3;
  }

  const actMatch = q.match(/(ipc|gst|crpc|constitution|ibc|income.?tax|customs)/i);
  if (actMatch) {
    const act = actMatch[1].toLowerCase();
    const docAct = (chunk.act || document.act || "").toLowerCase();
    if (docAct.includes(act)) score += 0.25;
  }

  const courtMatch = q.match(/(supreme\s*court|high\s*court|tribunal)/i);
  if (courtMatch) {
    const court = courtMatch[1].toLowerCase();
    const docCourt = (document.court || "").toLowerCase();
    if (docCourt.includes(court)) score += 0.2;
  }

  return Math.min(score, 0.5);
}

function rerank(candidates, query) {
  const q = query.toLowerCase();
  const qTokens = new Set(tokenize(q));

  return candidates.map(c => {
    const text = `${c.document.title} ${c.chunk.text}`.toLowerCase();
    const textTokens = tokenize(text);

    const exactOverlap = [...qTokens].filter(t => textTokens.includes(t)).length;
    const recall = qTokens.size ? exactOverlap / qTokens.size : 0;

    const doc = c.document;
    const metadataHits = [
      doc.citation && q.includes(doc.citation.toLowerCase()),
      doc.court && q.includes(doc.court.toLowerCase()),
      doc.judge && q.includes(doc.judge.toLowerCase()),
      doc.act && q.includes(doc.act.toLowerCase()),
      doc.section && q.includes(`section ${doc.section}`.toLowerCase())
    ].filter(Boolean).length * 0.06;

    const rerankBonus = (recall * 0.15) + metadataHits;

    return { ...c, rerank_bonus: rerankBonus };
  });
}

function expandQuery(query, results) {
  if (results.length > 0) return query;
  const tokens = tokenize(query);
  const stopWords = new Set(["kya", "hai", "the", "a", "an", "is", "are", "was", "were", "ka", "ki", "ke", "mein", "me", "se", "par", "per", "by", "for", "of", "in", "to", "on", "at", "with", "from"]);
  const filtered = tokens.filter(t => !stopWords.has(t) && t.length > 1);
  return filtered.join(" ") || query;
}

export function searchCorpus({ query, filters = {}, store, limit = 15 }) {
  let cleanedQuery = String(query || "").trim();
  const rawTokens = tokenize(cleanedQuery);
  const queryTokens = expandTokens(rawTokens);
  const queryCounts = tokenCounts(queryTokens);
  const queryMetadata = extractQueryMetadata(cleanedQuery);
  const index = store.getIndex();

  const candidates = [];

  for (const chunk of index.chunks) {
    const document = chunk.document;
    if (!documentMatchesFilters(document, filters, queryMetadata)) continue;

    const bm25 = bm25Score(queryTokens, chunk, index);
    const dense = cosineSimilarity(queryCounts, chunk.counts);
    const meta = metadataBoost(document, chunk, queryMetadata);
    const phrase = phraseScore(cleanedQuery, chunk, document);
    const keyword = keywordExactScore(cleanedQuery, chunk, document);

    if (bm25 === 0 && dense === 0 && meta === 0 && phrase === 0 && keyword === 0) continue;

    candidates.push({
      chunk, document, bm25, dense, meta, phrase, keyword, queryMetadata
    });
  }

  if (!candidates.length) {
    const expanded = expandQuery(cleanedQuery, []);
    if (expanded !== cleanedQuery) {
      return searchCorpus({ query: expanded, filters, store, limit });
    }
    return { queryMetadata, results: [] };
  }

  normalizeScores(candidates, "bm25");
  normalizeScores(candidates, "dense");

  const withRerank = rerank(candidates, cleanedQuery);

  const ranked = withRerank
    .map((candidate) => {
      const rawScore = (candidate.bm25_normalized * 0.35) +
        (candidate.dense_normalized * 0.20) +
        candidate.meta +
        candidate.phrase +
        (candidate.keyword * 0.20) +
        candidate.rerank_bonus;

      return {
        ...candidate,
        raw_score: rawScore,
        score: Math.min(rawScore, 1)
      };
    })
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const deduped = [];
  for (const result of ranked) {
    const key = `${result.document.document_id}:${result.chunk.paragraph || result.chunk.pdf_page || result.chunk.chunk_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
    if (deduped.length >= limit) break;
  }

  if (!deduped.length) {
    const expanded = expandQuery(cleanedQuery, deduped);
    if (expanded !== cleanedQuery) {
      return searchCorpus({ query: expanded, filters, store, limit });
    }
  }

  return { queryMetadata, results: deduped };
}
