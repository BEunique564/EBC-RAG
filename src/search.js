import { expandTokens, tokenCounts, tokenize } from "./tokenize.js";
import { documentMatchesFilters, extractQueryMetadata, metadataBoost } from "./metadata.js";
import { embedChunk, embedQuery, embeddingSimilarity } from "./embeddings.js";
import { rerankResults } from "./reranker.js";

const RRF_K = 50;
const MIN_BM25 = 0.005;

function bm25Score(queryTokens, chunk, index) {
  const k1 = 1.6;
  const b = 0.68;
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

function rrfScore(rank, k = RRF_K) {
  return 1 / (k + rank);
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
  const queryVec = embedQuery(cleanedQuery);

  const bm25Ranks = [];
  const denseRanks = [];
  const keywordRanks = [];
  const allCandidates = [];

  for (let i = 0; i < index.chunks.length; i++) {
    const chunk = index.chunks[i];
    const document = chunk.document;
    if (!documentMatchesFilters(document, filters, queryMetadata)) continue;

    const bm25 = bm25Score(queryTokens, chunk, index);
    const chunkVec = embedChunk(chunk);
    const dense = embeddingSimilarity(queryVec, chunkVec);
    const keyword = keywordExactScore(cleanedQuery, chunk, document);

    if (bm25 === 0 && dense === 0 && keyword === 0) continue;

    allCandidates.push({
      chunk, document, bm25, dense, keyword, queryMetadata, index: i
    });
  }

  if (!allCandidates.length) {
    const expanded = expandQuery(cleanedQuery, []);
    if (expanded !== cleanedQuery) {
      return searchCorpus({ query: expanded, filters, store, limit });
    }
    return { queryMetadata, results: [] };
  }

  const bm25Sorted = [...allCandidates].sort((a, b) => b.bm25 - a.bm25);
  const denseSorted = [...allCandidates].sort((a, b) => b.dense - a.dense);
  const keywordSorted = [...allCandidates].sort((a, b) => b.keyword - a.keyword);

  const bm25RankMap = new Map();
  const denseRankMap = new Map();
  const keywordRankMap = new Map();

  for (const [rank, c] of bm25Sorted.entries()) {
    if (c.bm25 >= MIN_BM25) bm25RankMap.set(c.index, rank);
  }
  for (const [rank, c] of denseSorted.entries()) {
    denseRankMap.set(c.index, rank);
  }
  for (const [rank, c] of keywordSorted.entries()) {
    if (c.keyword > 0) keywordRankMap.set(c.index, rank);
  }

  const withRrf = allCandidates.map(c => {
    let rrf = 0;
    let systems = 0;
    if (bm25RankMap.has(c.index)) { rrf += rrfScore(bm25RankMap.get(c.index)); systems++; }
    if (denseRankMap.has(c.index)) { rrf += rrfScore(denseRankMap.get(c.index)); systems++; }
    if (keywordRankMap.has(c.index)) { rrf += rrfScore(keywordRankMap.get(c.index)); systems++; }
    const meta = metadataBoost(c.document, c.chunk, queryMetadata);
    return { ...c, rrf: systems ? rrf / systems : 0, meta };
  });

  const rrfSorted = withRrf.sort((a, b) => {
    const diff = b.rrf - a.rrf;
    if (Math.abs(diff) > 0.001) return diff;
    return b.bm25 - a.bm25;
  });

  for (const c of rrfSorted) {
    c.score = Math.min(c.rrf + c.meta, 1);
  }

  const seen = new Set();
  const deduped = [];
  for (const result of rrfSorted) {
    const key = `${result.document.document_id}:${result.chunk.paragraph || result.chunk.pdf_page || result.chunk.chunk_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
    if (deduped.length >= limit) break;
  }

  const reranked = rerankResults(cleanedQuery, deduped);

  if (!reranked.length) {
    const expanded = expandQuery(cleanedQuery, []);
    if (expanded !== cleanedQuery) {
      return searchCorpus({ query: expanded, filters, store, limit });
    }
  }

  return { queryMetadata, results: reranked };
}
