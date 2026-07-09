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
    "input tax credit",
    "section 16",
    "supreme court",
    "personal data",
    "interim resolution professional"
  ];

  for (const phrase of importantPhrases) {
    if (normalizedQuery.includes(phrase) && haystack.includes(phrase)) score += 0.12;
  }

  return Math.min(score, 0.4);
}

export function searchCorpus({ query, filters = {}, store, limit = 15 }) {
  const rawTokens = tokenize(query);
  const queryTokens = expandTokens(rawTokens);
  const queryCounts = tokenCounts(queryTokens);
  const queryMetadata = extractQueryMetadata(query);
  const index = store.getIndex();

  const candidates = [];

  for (const chunk of index.chunks) {
    const document = chunk.document;
    if (!documentMatchesFilters(document, filters, queryMetadata)) continue;

    const bm25 = bm25Score(queryTokens, chunk, index);
    const dense = cosineSimilarity(queryCounts, chunk.counts);
    const meta = metadataBoost(document, chunk, queryMetadata);
    const phrase = phraseScore(query, chunk, document);

    if (bm25 === 0 && dense === 0 && meta === 0 && phrase === 0) continue;

    candidates.push({
      chunk,
      document,
      bm25,
      dense,
      meta,
      phrase,
      queryMetadata
    });
  }

  if (!candidates.length) {
    return {
      queryMetadata,
      results: []
    };
  }

  normalizeScores(candidates, "bm25");
  normalizeScores(candidates, "dense");

  const ranked = candidates
    .map((candidate) => {
      const rawScore = (candidate.bm25_normalized * 0.48) +
        (candidate.dense_normalized * 0.26) +
        candidate.meta +
        candidate.phrase;

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

  return {
    queryMetadata,
    results: deduped
  };
}
