import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorpusStore } from "../src/corpusStore.js";
import { answerLegalQuery } from "../src/ragPipeline.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

async function testStore() {
  return buildCorpusStore({
    seedCorpusPath: path.join(root, "data", "legal_corpus.json"),
    localCorpusPath: path.join(root, "data", "__missing_conf_corpus.json")
  });
}

test("confidence: answered queries have moderate-high confidence", async () => {
  const store = await testStore();
  const result = await answerLegalQuery({
    query: "Section 420 IPC latest Supreme Court judgment",
    store
  });
  if (result.status === "answered") {
    assert.ok(result.confidence >= 30, `confidence should be >= 30 for answered query, got ${result.confidence}`);
    assert.ok(result.confidence <= 100, "confidence should never exceed 100");
  }
});

test("confidence: insufficient evidence queries get low confidence", async () => {
  const store = await testStore();
  const queries = [
    "xyzzy quantum zzzzz figs",
    "What is the best pizza recipe?",
    "When was the IPC established in 1800?"
  ];
  for (const query of queries) {
    const result = await answerLegalQuery({ query, store });
    if (result.status === "insufficient_evidence") {
      assert.equal(result.confidence, 0, `refused query should have 0 confidence: ${query}`);
    }
  }
});

test("confidence: confidence breakdown has all required fields", async () => {
  const store = await testStore();
  const result = await answerLegalQuery({
    query: "Section 420 IPC criminal law",
    store
  });
  if (result.status === "answered") {
    const cb = result.confidence_breakdown;
    assert.ok(cb !== undefined, "confidence_breakdown should exist");
    assert.ok(typeof cb.topScore === "number", "topScore should be numeric");
    assert.ok(typeof cb.citationCompleteness === "number", "citationCompleteness should be numeric");
    assert.ok(typeof cb.corroboration === "number", "corroboration should be numeric");
    assert.ok(typeof cb.sourceCoverage === "number", "sourceCoverage should be numeric");
    assert.ok(typeof cb.groundedness === "number", "groundedness should be numeric");
  }
});

test("confidence: groundedness score correlates with confidence", async () => {
  const store = await testStore();
  const results = await Promise.all([
    answerLegalQuery({ query: "Section 420 IPC Supreme Court", store }),
    answerLegalQuery({ query: "GST input tax credit Section 16 CGST", store }),
    answerLegalQuery({ query: "Right to privacy Article 21", store })
  ]);
  for (const result of results) {
    if (result.status === "answered") {
      const g = result.confidence_breakdown?.groundedness || 0;
      const c = result.confidence;
      if (g >= 80) {
        assert.ok(c >= 60, `high groundedness (${g}) should correlate with high confidence (${c})`);
      }
    }
  }
});

test("confidence: citation_verification fields are consistent", async () => {
  const store = await testStore();
  const result = await answerLegalQuery({
    query: "Bail under Section 439 CrPC",
    store
  });
  if (result.status === "answered") {
    const ver = result.citation_verification || [];
    for (const v of ver) {
      assert.ok("verified" in v, "each check should have verified field");
      assert.ok("missing" in v, "each check should have missing field");
      assert.ok(Array.isArray(v.missing), "missing should be an array");
    }
  }
});

test("confidence: repeated queries have consistent confidence ranges", async () => {
  const store = await testStore();
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const result = await answerLegalQuery({
      query: "Section 420 IPC latest Supreme Court judgment",
      store
    });
    if (result.status === "answered") runs.push(result.confidence);
  }
  if (runs.length >= 2) {
    const maxDiff = Math.max(...runs) - Math.min(...runs);
    assert.ok(maxDiff <= 25, `confidence should be reasonably consistent across runs (max diff: ${maxDiff})`);
  }
});

test("confidence: cross-domain penalty reduces confidence for wrong-act matches", async () => {
  const store = await testStore();
  const result = await answerLegalQuery({
    query: "GST input tax credit Section 16 like IPC Section 420",
    store
  });
  if (result.status === "answered") {
    const signals = result.reranker_signals || [];
    for (const s of signals) {
      if (s.signals?.cross_domain_penalty > 0) {
        assert.ok(s.score < 0.9, "cross-domain penalty should reduce reranker score");
      }
    }
  }
});
