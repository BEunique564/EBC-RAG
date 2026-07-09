/**
 * Evaluation suite for EBC Legal AI Assistant.
 * Measures accuracy, citation fidelity, hallucination rate, and latency.
 *
 * Usage:  node tests/eval/evaluate.js
 */

import { buildCorpusStore } from "../../src/corpusStore.js";
import { answerLegalQuery } from "../../src/ragPipeline.js";
import { splitSentences } from "../../src/tokenize.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..", "..");

const TEST_QUERIES = [
  {
    query: "Rohit Sharma vs State of Maharashtra Section 420 IPC",
    expect: { status: "answered", hasSection: "420", minCitations: 1 }
  },
  {
    query: "What is GST input tax credit under Section 16?",
    expect: { status: "answered", hasSection: "16", minCitations: 1 }
  },
  {
    query: "Latest Supreme Court judgments on Section 420 IPC",
    expect: { status: "answered", hasSection: "420", minCitations: 1 }
  },
  {
    query: "Privacy under Article 21 of the Constitution",
    expect: { status: "answered", minCitations: 1 }
  },
  {
    query: "xyzzy quantum zzzzz figs",
    expect: { status: "insufficient_evidence", minCitations: 0 }
  },
  {
    query: "Vodafone India Ltd v. Union of India GST dispute analysis",
    expect: { status: "answered", minCitations: 1 }
  }
];

const METRICS = {
  total: 0,
  passed: 0,
  failed: [],
  citationFidelity: { total: 0, withMarkers: 0 },
  hallucination: { totalSentences: 0, unsupportedSentences: 0 },
  latency: []
};

for (const { query: rawQuery } of TEST_QUERIES) {
  METRICS.hallucination.totalSentences += splitSentences(rawQuery).length || 1;
}

async function evaluate() {
  console.log("EBC Legal AI — Evaluation Suite");
  console.log("=".repeat(60));
  console.log();

  const store = await buildCorpusStore({
    seedCorpusPath: path.join(root, "data", "legal_corpus.json"),
    localCorpusPath: path.join(root, "data", "__missing_eval_corpus.json")
  });

  for (const t of TEST_QUERIES) {
    METRICS.total++;
    const start = Date.now();
    let result;
    try {
      result = await answerLegalQuery({ query: t.query, store, userTier: "enterprise" });
    } catch (err) {
      METRICS.failed.push({ query: t.query, error: err.message });
      console.log(`  FAIL  ${t.query.slice(0, 60)}`);
      console.log(`        Error: ${err.message}`);
      continue;
    }
    const duration = Date.now() - start;
    METRICS.latency.push(duration);

    const statusOk = result.status === t.expect.status;
    const citesOk = result.citations.length >= t.expect.minCitations;
    const sectionOk = !t.expect.hasSection || result.citations.some(c =>
      (c.section || "").includes(t.expect.hasSection)
    );

    /* Citation fidelity: every answer block should have [S#] markers */
    const sentences = splitSentences(result.answer || "");
    for (const s of sentences) {
      METRICS.citationFidelity.total++;
      if (/\[\w+\]/.test(s) || s.trim().startsWith("Based only") || s.trim().startsWith("Case:")) {
        METRICS.citationFidelity.withMarkers++;
      }
    }

    /* Hallucination: count unsupported sentences */
    if (result.unsupported_sentences) {
      METRICS.hallucination.unsupportedSentences += result.unsupported_sentences.length;
    }

    if (statusOk && citesOk && sectionOk) {
      METRICS.passed++;
      console.log(`  PASS  ${t.query.slice(0, 60)}`);
      console.log(`        status=${result.status} cites=${result.citations.length} conf=${result.confidence}% dur=${duration}ms`);
    } else {
      METRICS.failed.push({ query: t.query, status: result.status, cites: result.citations.length, expected: t.expect });
      console.log(`  FAIL  ${t.query.slice(0, 60)}`);
      console.log(`        expected status=${t.expect.status} got=${result.status}`);
      console.log(`        expected minCites=${t.expect.minCitations} got=${result.citations.length}`);
    }
  }

  console.log();
  console.log("=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));

  const avgLatency = METRICS.latency.length
    ? Math.round(METRICS.latency.reduce((a, b) => a + b, 0) / METRICS.latency.length)
    : 0;
  const sortedLatency = [...METRICS.latency].sort((a, b) => a - b);
  const p95 = sortedLatency.length
    ? sortedLatency[Math.floor(sortedLatency.length * 0.95)]
    : 0;
  const citFidelity = METRICS.citationFidelity.total
    ? (METRICS.citationFidelity.withMarkers / METRICS.citationFidelity.total * 100).toFixed(1)
    : "N/A";
  const hallRate = METRICS.hallucination.totalSentences
    ? (METRICS.hallucination.unsupportedSentences / METRICS.hallucination.totalSentences * 100).toFixed(1)
    : "N/A";

  console.log(`  Pass Rate:     ${METRICS.passed}/${METRICS.total} (${(METRICS.passed / METRICS.total * 100).toFixed(0)}%)`);
  console.log(`  Avg Latency:   ${avgLatency}ms`);
  console.log(`  p95 Latency:   ${p95}ms`);
  console.log(`  Citation Fidelity:  ${citFidelity}%`);
  console.log(`  Hallucination Rate: ${hallRate}%`);

  if (METRICS.failed.length) {
    console.log();
    console.log("FAILURES:");
    for (const f of METRICS.failed) {
      console.log(`  - ${(f.query || "").slice(0, 60)}: ${f.error || `${f.status} (expected ${f.expected?.status})`}`);
    }
  }

  process.exit(METRICS.failed.length > 0 ? 1 : 0);
}

evaluate().catch(err => { console.error("Evaluation error:", err); process.exit(1); });
