import { tokenize, splitSentences } from "./tokenize.js";

const CROSS_ENCODER_WEIGHTS = {
  token_exact: 0.30,
  phrase_exact: 0.25,
  position_early: 0.10,
  coverage: 0.10,
  metadata: 0.15,
  legal_terms: 0.10
};

export function crossEncode(query, chunk, document) {
  const qTokens = tokenize(query);
  const qSet = new Set(qTokens);
  const chunkTokens = tokenize(chunk.text || "");
  const titleText = `${document.title || ""} ${document.citation || ""}`.toLowerCase();
  const chunkText = chunk.text?.toLowerCase() || "";

  const qPhrases = extractPhrases(query);

  let tokenExactHits = 0;
  let tokenExactTotal = qSet.size;
  for (const token of qSet) {
    if (chunkTokens.includes(token)) tokenExactHits++;
  }
  const tokenExactScore = tokenExactTotal ? tokenExactHits / tokenExactTotal : 0;

  let phraseHits = 0;
  for (const phrase of qPhrases) {
    if (chunkText.includes(phrase) || titleText.includes(phrase)) phraseHits++;
  }
  const phraseScore = qPhrases.length ? phraseHits / qPhrases.length : 0;

  const sentences = splitSentences(chunk.text || "");
  let positionScore = 0;
  for (let i = 0; i < Math.min(sentences.length, 5); i++) {
    const sentenceTokens = tokenize(sentences[i]);
    const overlap = sentenceTokens.filter(t => qSet.has(t)).length;
    if (overlap > 0) {
      positionScore += (5 - i) / 5;
    }
  }
  positionScore = Math.min(positionScore / Math.max(sentences.length, 1) * 2, 1);

  const totalChunkTokens = chunkTokens.length || 1;
  const coverageScore = Math.min(tokenExactHits / totalChunkTokens * 10, 1);

  const metaText = `${document.section || ""} ${document.act || ""} ${document.court || ""}`.toLowerCase();
  let metaScore = 0;
  for (const token of qSet) {
    if (metaText.includes(token)) metaScore += 0.1;
  }
  metaScore = Math.min(metaScore, 1);

  /* Legal term signal: boost for exact legal references (section/act/article numbers) */
  const legalPattern = /(section|sec|article|rule|order)\s*\d+/i;
  let legalScore = 0;
  if (legalPattern.test(query) && legalPattern.test(chunkText)) legalScore += 0.5;
  const caseCitationPattern = /\d{4}\s+(?:\d+\s+)?[A-Z]{2,}\s+\d+/;
  if (caseCitationPattern.test(query) && caseCitationPattern.test(chunkText)) legalScore += 0.3;
  const actNamePattern = query.match(/(ipc|gst|crpc|constitution|ibc)/i);
  if (actNamePattern && chunkText.includes(actNamePattern[1].toLowerCase())) legalScore += 0.2;
  legalScore = Math.min(legalScore, 1);

  /* Cross-domain penalty: when query names a specific act but chunk belongs to a different act */
  let crossPenalty = 0;
  const ACT_PATTERNS = [
    { regex: /\bgst\b|\bgoods\s+and\s+services\s*tax\b/i, aliases: ["gst", "cgst", "goods and services tax"] },
    { regex: /\bcgst\b|\bcentral\s+goods\s+and\s+services\b/i, aliases: ["cgst", "gst", "central goods and services tax"] },
    { regex: /\bipc\b|\bindian\s+penal\s+code\b/i, aliases: ["ipc", "indian penal code"] },
    { regex: /\bcrpc\b|\bcriminal\s+procedure\s+code\b/i, aliases: ["crpc", "code of criminal procedure"] },
    { regex: /\bibc\b|\binsolvency\b|\bbankruptcy\s+code\b/i, aliases: ["ibc", "insolvency and bankruptcy code"] },
    { regex: /\bconstitution\b/i, aliases: ["constitution of india"] },
    { regex: /\bincome\s+tax\b|\bit\s+act\b/i, aliases: ["income tax act"] },
    { regex: /\bcustoms\s+act\b/i, aliases: ["customs act"] }
  ];
  for (const { regex, aliases } of ACT_PATTERNS) {
    if (regex.test(query)) {
      const docAct = (document.act || chunk.act || "").toLowerCase();
      if (docAct && !aliases.some(a => docAct.includes(a))) {
        crossPenalty = 0.35;
      }
      break;
    }
  }
  /* Court-topic mismatch: query has case name with known topic but chunk is from unrelated area */
  const knownTopicIndicators = [
    { words: ["gst", "vat", "tax", "input tax credit", "supply"], topic: "tax" },
    { words: ["bail", "custody", "criminal", "cheating", "fraud", "420"], topic: "criminal" },
    { words: ["privacy", "article 21", "personal liberty", "fundamental right"], topic: "constitutional" },
    { words: ["insolvency", "ibc", "bankruptcy", "resolution", "liquidation"], topic: "insolvency" }
  ];
  for (const ti of knownTopicIndicators) {
    const matchWord = ti.words.find(w => query.toLowerCase().includes(w));
    if (matchWord) {
      /* Check document-level topic first (more reliable), then chunk-level */
      const docTopic = (document.topic || "").toLowerCase();
      const chunkTopic = (chunk.topic || "").toLowerCase();
      const bothTopics = `${docTopic} ${chunkTopic}`.trim();
      if (bothTopics && !bothTopics.includes(ti.topic) && !bothTopics.includes(matchWord)) {
        crossPenalty = Math.max(crossPenalty, 0.25);
      }
      break;
    }
  }

  let score = (
    tokenExactScore * CROSS_ENCODER_WEIGHTS.token_exact +
    phraseScore * CROSS_ENCODER_WEIGHTS.phrase_exact +
    positionScore * CROSS_ENCODER_WEIGHTS.position_early +
    coverageScore * CROSS_ENCODER_WEIGHTS.coverage +
    metaScore * CROSS_ENCODER_WEIGHTS.metadata +
    legalScore * CROSS_ENCODER_WEIGHTS.legal_terms
  );
  score = Math.max(0, score - crossPenalty);

  return {
    score: Math.min(score, 1),
    signals: {
      token_exact: tokenExactScore,
      phrase_exact: phraseScore,
      position_early: positionScore,
      coverage: coverageScore,
      metadata: metaScore,
      legal_terms: legalScore,
      cross_domain_penalty: crossPenalty
    }
  };
}

export function rerankResults(query, results) {
  return results.map(r => {
    const encoded = crossEncode(query, r.chunk, r.document);
    const combined = (r.score * 0.6) + (encoded.score * 0.4);
    return { ...r, score: Math.min(combined, 1), reranker: encoded };
  }).sort((a, b) => b.score - a.score);
}

function extractPhrases(query) {
  const phrases = [];
  const quoted = [...query.matchAll(/"([^"]+)"/g)].map(m => m[1].toLowerCase());
  phrases.push(...quoted);
  const ngrams = tokenize(query);
  for (let i = 0; i < ngrams.length - 1; i++) {
    phrases.push(`${ngrams[i]} ${ngrams[i + 1]}`);
  }
  return [...new Set(phrases)];
}
