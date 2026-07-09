import { cosineSimilarity, tokenCounts, tokenize, expandTokens } from "./tokenize.js";

const EMBEDDING_DIM = 256;

function hashToken(token) {
  let h1 = 0, h2 = 0;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    h1 = ((h1 << 7) - h1) + c;
    h2 = ((h2 << 13) - h2) + c;
    h1 |= 0; h2 |= 0;
  }
  return [Math.abs(h1) % EMBEDDING_DIM, Math.abs(h2) % EMBEDDING_DIM];
}

export function sparseEmbed(text) {
  const tokens = expandTokens(tokenize(text));
  const vec = new Float64Array(EMBEDDING_DIM);
  for (const token of tokens) {
    const [i1, i2] = hashToken(token);
    vec[i1] += 1.0;
    vec[i2] += 0.5;
  }
  /* TF-IDF-like weighting: rare tokens get higher weight */
  for (const token of tokens) {
    const [i1, i2] = hashToken(token);
    vec[i1] *= (1.0 + 0.1 / (1 + token.length));
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
