const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "cite",
  "citing",
  "for",
  "from",
  "give",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "regarding",
  "show",
  "that",
  "the",
  "their",
  "to",
  "under",
  "was",
  "were",
  "what",
  "when",
  "with"
]);

const SYNONYMS = new Map([
  ["gst", ["cgst", "goods", "services", "tax"]],
  ["ipc", ["indian", "penal", "code"]],
  ["420", ["cheating", "dishonest", "inducement"]],
  ["itc", ["input", "tax", "credit"]],
  ["latest", ["recent", "newest", "current"]],
  ["recent", ["latest", "newest", "current"]],
  ["credit", ["itc"]],
  ["judgment", ["case", "decision", "authority"]],
  ["judgments", ["cases", "decisions", "authorities"]],
  ["supreme", ["apex"]],
  ["court", ["bench", "tribunal"]],
  ["section", ["sec"]],
  ["bail", ["release", "custody"]],
  ["privacy", ["personal", "data", "informational"]]
]);

export function tokenize(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s./-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function expandTokens(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const synonyms = SYNONYMS.get(token);
    if (!synonyms) continue;
    for (const synonym of synonyms) {
      if (!STOPWORDS.has(synonym)) expanded.add(synonym);
    }
  }
  return [...expanded];
}

export function tokenCounts(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

export function cosineSimilarity(aCounts, bCounts) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (const value of aCounts.values()) aNorm += value * value;
  for (const value of bCounts.values()) bNorm += value * value;

  for (const [token, aValue] of aCounts.entries()) {
    dot += aValue * (bCounts.get(token) || 0);
  }

  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function splitSentences(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
