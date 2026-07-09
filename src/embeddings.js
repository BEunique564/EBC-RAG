import { cosineSimilarity, tokenCounts, tokenize, expandTokens } from "./tokenize.js";

const EMBEDDING_DIM = 128;

function hashToken(token) {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) - hash) + token.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % EMBEDDING_DIM;
}

export function sparseEmbed(text) {
  const tokens = expandTokens(tokenize(text));
  const vec = new Float64Array(EMBEDDING_DIM);
  for (const token of tokens) {
    vec[hashToken(token)] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= norm;
  return vec;
}

export function embedQuery(query) {
  return sparseEmbed(query);
}

export function embedChunk(chunk) {
  if (chunk._embedding) return chunk._embedding;
  chunk._embedding = sparseEmbed(chunk.text);
  return chunk._embedding;
}

export function embeddingSimilarity(queryVec, chunkVec) {
  let dot = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) dot += queryVec[i] * chunkVec[i];
  return dot;
}

export { cosineSimilarity, EMBEDDING_DIM };
