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
    localCorpusPath: path.join(root, "data", "__missing_test_corpus.json")
  });
}

test("answers only with validated citations when evidence exists", async () => {
  const store = await testStore();
  const result = await answerLegalQuery({
    query: "Give me material on GST input tax credit citing Section 16",
    store
  });

  assert.equal(result.status, "answered");
  assert.ok(result.answer.includes("[S1]"));
  assert.ok(result.citations.length >= 1);
  assert.equal(result.citation_validation.valid, true);
  assert.ok(result.related_documents[0].title.includes("CGST"));
});

test("refuses unsupported legal questions", async () => {
  const store = await testStore();
  const result = await answerLegalQuery({
    query: "Give me Supreme Court judgments after 2025 on maritime salvage liens and drone evidence",
    store
  });

  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.citations.length, 0);
  assert.match(result.answer, /could not find sufficient/i);
});

test("metadata filters restrict evidence", async () => {
  const store = await testStore();
  const result = await answerLegalQuery({
    query: "privacy Article 21",
    filters: {
      court: "NCLAT"
    },
    store
  });

  assert.equal(result.status, "insufficient_evidence");
});

test("latest Section 420 IPC query returns a validated Supreme Court demo authority", async () => {
  const store = await testStore();
  const result = await answerLegalQuery({
    query: "What are the latest Supreme Court judgments on Section 420 IPC?",
    store
  });

  assert.equal(result.status, "answered");
  assert.equal(result.query_intent, "statute_or_section_research");
  assert.equal(result.citation_validation.valid, true);
  assert.equal(result.citations[0].court, "Supreme Court");
  assert.equal(result.citations[0].section, "420");
  assert.ok(result.related_documents[0].score <= 1);
  assert.ok(result.warnings.some((warning) => warning.includes("latest inside the indexed corpus")));
  assert.equal(result.retrieval_trace.gates.at(-1).passed, true);
});

test("answered results expose EBC product and authority intelligence", async () => {
  const store = await testStore();
  const result = await answerLegalQuery({
    query: "What are the latest Supreme Court judgments on Section 420 IPC?",
    store
  });

  assert.equal(result.status, "answered");
  assert.ok(result.related_documents[0].authority_status);
  assert.ok(result.related_documents[0].treatment_summary.length >= 1);
  assert.ok(result.related_documents[0].ebc_reader_url);
  assert.ok(result.product_recommendations.length >= 1);
  assert.equal(result.product_recommendations[0].source_document_id, result.related_documents[0].document_id);
});
