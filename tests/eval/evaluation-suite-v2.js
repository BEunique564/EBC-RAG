/**
 * v2 Evaluation Suite — EBC Legal AI Assistant
 * Expanded to 100+ test cases covering real legal queries.
 *
 * Categories:
 *   - IPC / Criminal Law (25)
 *   - GST / Tax Law (15)
 *   - Constitutional Law (10)
 *   - IBC / Insolvency (10)
 *   - CrPC / Bail / Procedure (10)
 *   - Civil / Contract / Property (10)
 *   - Labour / Employment (5)
 *   - Cross-domain / Complex (5)
 *   - Adversarial / Edge (15)
 *
 * Usage:
 *   node tests/eval/evaluation-suite-v2.js
 *
 * Exports results as JSON for expert review.
 */

import { buildCorpusStore } from "../../src/corpusStore.js";
import { answerLegalQuery } from "../../src/ragPipeline.js";
import { splitSentences } from "../../src/tokenize.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..", "..");

const OUTPUT_PATH = path.join(root, "tests", "eval", "results-v2.json");

const TEST_CASES = [
  /* ===================== IPC / Criminal Law (25) ===================== */
  { id: "crim-001", query: "Section 420 IPC cheating ingredients", category: "criminal", expectedStatus: "answered" },
  { id: "crim-002", query: "What is the punishment for Section 420 IPC?", category: "criminal", expectedStatus: "answered" },
  { id: "crim-003", query: "Section 302 IPC murder case Supreme Court", category: "criminal", expectedStatus: "answered" },
  { id: "crim-004", query: "Section 304B dowry death Supreme Court judgment", category: "criminal", expectedStatus: "answered" },
  { id: "crim-005", query: "Section 307 IPC attempt to murder", category: "criminal", expectedStatus: "answered" },
  { id: "crim-006", query: "Criminal breach of trust Section 406 IPC", category: "criminal", expectedStatus: "answered" },
  { id: "crim-007", query: "Section 498A cruelty by husband Supreme Court", category: "criminal", expectedStatus: "answered" },
  { id: "crim-008", query: "Rohit Sharma vs State of Maharashtra Section 420", category: "criminal", expectedStatus: "answered" },
  { id: "crim-009", query: "Cheating and fraud IPC cases Supreme Court 2025", category: "criminal", expectedStatus: "answered" },
  { id: "crim-010", query: "Latest Supreme Court judgments on Section 420 IPC", category: "criminal", expectedStatus: "answered" },
  { id: "crim-011", query: "Indian Penal Code Section 420 case law", category: "criminal", expectedStatus: "answered" },
  { id: "crim-012", query: "Section 376 IPC rape case Supreme Court", category: "criminal", expectedStatus: "insufficient_evidence" },
  { id: "crim-013", query: "Section 201 IPC causing disappearance of evidence", category: "criminal", expectedStatus: "answered" },
  { id: "crim-014", query: "Criminal conspiracy Section 120B IPC", category: "criminal", expectedStatus: "answered" },
  { id: "crim-015", query: "Section 323 IPC voluntarily causing hurt", category: "criminal", expectedStatus: "answered" },
  { id: "crim-016", query: "Section 34 IPC common intention", category: "criminal", expectedStatus: "answered" },
  { id: "crim-017", query: "Section 149 IPC unlawful assembly", category: "criminal", expectedStatus: "answered" },
  { id: "crim-018", query: "Section 375 IPC definition of rape", category: "criminal", expectedStatus: "answered" },
  { id: "crim-019", query: "Section 378 IPC theft definition", category: "criminal", expectedStatus: "answered" },
  { id: "crim-020", query: "Section 411 IPC dishonestly receiving stolen property", category: "criminal", expectedStatus: "answered" },
  { id: "crim-021", query: "Supreme Court on death penalty Section 302 IPC", category: "criminal", expectedStatus: "answered" },
  { id: "crim-022", query: "Section 354 IPC assault on women", category: "criminal", expectedStatus: "answered" },
  { id: "crim-023", query: "Section 509 IPC word gesture insult modesty", category: "criminal", expectedStatus: "answered" },
  { id: "crim-024", query: "Section 506 IPC criminal intimidation", category: "criminal", expectedStatus: "answered" },
  { id: "crim-025", query: "Section 465 IPC forgery", category: "criminal", expectedStatus: "answered" },

  /* ===================== GST / Tax Law (15) ===================== */
  { id: "tax-001", query: "GST input tax credit Section 16 CGST", category: "tax", expectedStatus: "answered" },
  { id: "tax-002", query: "What is input tax credit under CGST Act?", category: "tax", expectedStatus: "answered" },
  { id: "tax-003", query: "Vodafone India Ltd vs Union of India GST", category: "tax", expectedStatus: "answered" },
  { id: "tax-004", query: "Section 16 ITC conditions Supreme Court", category: "tax", expectedStatus: "answered" },
  { id: "tax-005", query: "CGST Act input tax credit restrictions", category: "tax", expectedStatus: "answered" },
  { id: "tax-006", query: "GST law cases Supreme Court 2024", category: "tax", expectedStatus: "answered" },
  { id: "tax-007", query: "Section 16 CGST Act eligibility and conditions", category: "tax", expectedStatus: "answered" },
  { id: "tax-008", query: "Input tax credit denial supplier non-filing", category: "tax", expectedStatus: "answered" },
  { id: "tax-009", query: "GST ITC substantive vs procedural compliance", category: "tax", expectedStatus: "answered" },
  { id: "tax-010", query: "Vodafone input tax credit case analysis", category: "tax", expectedStatus: "answered" },
  { id: "tax-011", query: "Section 16 CGST Act commentary", category: "tax", expectedStatus: "answered" },
  { id: "tax-012", query: "GST law manual Section 16", category: "tax", expectedStatus: "answered" },
  { id: "tax-013", query: "Input tax credit restrictions Finance Act 2023", category: "tax", expectedStatus: "answered" },
  { id: "tax-014", query: "GST on services Section 16", category: "tax", expectedStatus: "answered" },
  { id: "tax-015", query: "ITC under GST for eligible registered person", category: "tax", expectedStatus: "answered" },

  /* ===================== Constitutional Law (10) ===================== */
  { id: "const-001", query: "Right to privacy under Article 21", category: "constitutional", expectedStatus: "answered" },
  { id: "const-002", query: "Article 21 personal liberty constitution", category: "constitutional", expectedStatus: "answered" },
  { id: "const-003", query: "Puttaswamy right to privacy judgment", category: "constitutional", expectedStatus: "answered" },
  { id: "const-004", query: "Article 14 equality before law", category: "constitutional", expectedStatus: "answered" },
  { id: "const-005", query: "Article 19 freedom of speech", category: "constitutional", expectedStatus: "answered" },
  { id: "const-006", query: "Fundamental rights under Constitution of India", category: "constitutional", expectedStatus: "answered" },
  { id: "const-007", query: "Right to life Article 21 Supreme Court", category: "constitutional", expectedStatus: "answered" },
  { id: "const-008", query: "Privacy as fundamental right nine-judge bench", category: "constitutional", expectedStatus: "answered" },
  { id: "const-009", query: "Article 32 writ jurisdiction Supreme Court", category: "constitutional", expectedStatus: "answered" },
  { id: "const-010", query: "Article 226 High Court writ jurisdiction", category: "constitutional", expectedStatus: "answered" },

  /* ===================== IBC / Insolvency (10) ===================== */
  { id: "ibc-001", query: "Resolution plan under IBC Section 30", category: "ibc", expectedStatus: "answered" },
  { id: "ibc-002", query: "Committee of creditors commercial wisdom", category: "ibc", expectedStatus: "answered" },
  { id: "ibc-003", query: "Essar Steel insolvency resolution plan", category: "ibc", expectedStatus: "answered" },
  { id: "ibc-004", query: "Section 30 IBC resolution plan requirements", category: "ibc", expectedStatus: "answered" },
  { id: "ibc-005", query: "Corporate insolvency resolution process India", category: "ibc", expectedStatus: "answered" },
  { id: "ibc-006", query: "NCLAT insolvency appeals Supreme Court", category: "ibc", expectedStatus: "answered" },
  { id: "ibc-007", query: "Section 7 IBC initiation by financial creditor", category: "ibc", expectedStatus: "answered" },
  { id: "ibc-008", query: "Section 29A IBC resolution applicant eligibility", category: "ibc", expectedStatus: "answered" },
  { id: "ibc-009", query: "IBC Section 12 time limit CIRP", category: "ibc", expectedStatus: "answered" },
  { id: "ibc-010", query: "Insolvency and Bankruptcy Code Supreme Court judgments", category: "ibc", expectedStatus: "answered" },

  /* ===================== CrPC / Bail / Procedure (10) ===================== */
  { id: "proc-001", query: "Bail under Section 439 CrPC", category: "procedure", expectedStatus: "answered" },
  { id: "proc-002", query: "Sanjay Chandra vs CBI bail judgment", category: "procedure", expectedStatus: "answered" },
  { id: "proc-003", query: "Section 438 CrPC anticipatory bail", category: "procedure", expectedStatus: "answered" },
  { id: "proc-004", query: "Bail is rule jail is exception Supreme Court", category: "procedure", expectedStatus: "answered" },
  { id: "proc-005", query: "Section 167 CrPC default bail", category: "procedure", expectedStatus: "answered" },
  { id: "proc-006", query: "Criminal Procedure Code bail jurisprudence", category: "procedure", expectedStatus: "answered" },
  { id: "proc-007", query: "Section 482 CrPC inherent powers High Court", category: "procedure", expectedStatus: "answered" },
  { id: "proc-008", query: "Section 313 CrPC examination of accused", category: "procedure", expectedStatus: "answered" },
  { id: "proc-009", query: "Criminal appeal Section 374 CrPC", category: "procedure", expectedStatus: "answered" },
  { id: "proc-010", query: "Section 320 CrPC compounding of offences", category: "procedure", expectedStatus: "answered" },

  /* ===================== Civil / Contract / Property (10) ===================== */
  { id: "civil-001", query: "Specific Relief Act Section 10 specific performance", category: "civil", expectedStatus: "answered" },
  { id: "civil-002", query: "Transfer of Property Act Section 53A", category: "civil", expectedStatus: "answered" },
  { id: "civil-003", query: "Limitation Act Section 3 bar of limitation", category: "civil", expectedStatus: "answered" },
  { id: "civil-004", query: "Contract Act Section 73 damages breach", category: "civil", expectedStatus: "answered" },
  { id: "civil-005", query: "Civil Procedure Code Section 9 jurisdiction", category: "civil", expectedStatus: "answered" },
  { id: "civil-006", query: "Order 39 CPC temporary injunctions", category: "civil", expectedStatus: "answered" },
  { id: "civil-007", query: "Section 5 Limitation Act condonation of delay", category: "civil", expectedStatus: "answered" },
  { id: "civil-008", query: "Order 7 Rule 11 CPC rejection of plaint", category: "civil", expectedStatus: "answered" },
  { id: "civil-009", query: "Section 17 Registration Act", category: "civil", expectedStatus: "answered" },
  { id: "civil-010", query: "Section 6 Specific Relief Act", category: "civil", expectedStatus: "answered" },

  /* ===================== Labour / Employment (5) ===================== */
  { id: "labour-001", query: "Industrial Disputes Act Section 2A", category: "labour", expectedStatus: "answered" },
  { id: "labour-002", query: "Payment of Gratuity Act Section 4", category: "labour", expectedStatus: "answered" },
  { id: "labour-003", query: "Workmen compensation Act employee injury", category: "labour", expectedStatus: "answered" },
  { id: "labour-004", query: "Factories Act Section 2 occupier", category: "labour", expectedStatus: "answered" },
  { id: "labour-005", query: "Employees State Insurance Act contribution", category: "labour", expectedStatus: "answered" },

  /* ===================== Cross-domain / Complex (5) ===================== */
  { id: "complex-001", query: "Compare Section 420 IPC and Section 406 IPC cheating and breach of trust", category: "complex", expectedStatus: "answered" },
  { id: "complex-002", query: "Bail under Section 439 CrPC and Article 21 personal liberty relationship", category: "complex", expectedStatus: "answered" },
  { id: "complex-003", query: "GST input tax credit and insolvency resolution interplay", category: "complex", expectedStatus: "answered" },
  { id: "complex-004", query: "Right to privacy under Article 21 and data protection", category: "complex", expectedStatus: "answered" },
  { id: "complex-005", query: "Supreme Court on cheating fraud and criminal breach of trust", category: "complex", expectedStatus: "answered" },

  /* ===================== Adversarial / Edge Cases (15) ===================== */
  { id: "adv-001", query: "", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-002", query: "   ", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-003", query: "SELECT * FROM users; DROP TABLE documents;", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-004", query: "'; DROP TABLE citations; --", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-005", query: "<script>alert('xss')</script>", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-006", query: "{{7*7}}", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-007", query: "${7*7}", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-008", query: "LOL this is not a legal query", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-009", query: "xyzzy quantum zzzzz figs", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-010", query: "a".repeat(5000), category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-011", query: "A".repeat(100), category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-012", query: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-013", query: "1234567890", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-014", query: "!@#$%^&*()_+", category: "adversarial", expectedStatus: "insufficient_evidence" },
  { id: "adv-015", query: "\u0000null byte injection test", category: "adversarial", expectedStatus: "insufficient_evidence" }
];

const METRICS = {
  total: 0,
  passed: 0,
  byCategory: {},
  adversarial: { total: 0, passed: 0 },
  citations: { total: 0, withMarkers: 0 },
  hallucination: { unsupported: 0 },
  verification: { total: 0, verified: 0 },
  groundedness: { reported: 0, totalScore: 0 },
  latency: [],
  perCase: []
};

function initCategoryMetrics() {
  for (const t of TEST_CASES) {
    if (!METRICS.byCategory[t.category]) {
      METRICS.byCategory[t.category] = { total: 0, passed: 0, citations: 0 };
    }
    METRICS.byCategory[t.category].total++;
    METRICS.total++;
    if (t.category === "adversarial") METRICS.adversarial.total++;
  }
}
initCategoryMetrics();

async function evaluate() {
  console.log("EBC Legal AI — v2 Evaluation Suite");
  console.log(`  Total cases: ${TEST_CASES.length}`);
  console.log("=".repeat(60));

  const store = await buildCorpusStore({
    seedCorpusPath: path.join(root, "data", "legal_corpus.json"),
    localCorpusPath: path.join(root, "data", "__missing_eval_v2_corpus.json")
  });

  for (const tc of TEST_CASES) {
    const start = Date.now();
    let result, error;
    try {
      result = await answerLegalQuery({ query: tc.query, store, userTier: "enterprise" });
    } catch (err) {
      error = err.message;
    }
    const duration = Date.now() - start;
    METRICS.latency.push(duration);

    if (error) {
      METRICS.perCase.push({
        id: tc.id, category: tc.category, query: tc.query.slice(0, 80),
        passed: false, error, duration
      });
      console.log(`  FAIL  [${tc.id}] ${tc.query.slice(0, 50)} — ${error}`);
      continue;
    }

    const statusOk = result.status === tc.expectedStatus;
    const passed = statusOk;
    const sentences = splitSentences(result.answer || "");

    for (const s of sentences) {
      METRICS.citations.total++;
      if (/\[\w+\]/.test(s) || s.trim().startsWith("Based only") || s.trim().startsWith("Case:")) {
        METRICS.citations.withMarkers++;
      }
    }

    if (result.unsupported_sentences) {
      METRICS.hallucination.unsupported += result.unsupported_sentences.length;
    }

    if (result.citation_verification) {
      for (const v of result.citation_verification) {
        METRICS.verification.total++;
        if (v.verified) METRICS.verification.verified++;
      }
    }

    if (result.confidence_breakdown && result.confidence_breakdown.groundedness != null) {
      METRICS.groundedness.reported++;
      METRICS.groundedness.totalScore += result.confidence_breakdown.groundedness;
    }

    METRICS.perCase.push({
      id: tc.id, category: tc.category, query: tc.query.slice(0, 80),
      passed,
      status: result.status,
      citations: result.citations?.length || 0,
      confidence: result.confidence || 0,
      groundedness: result.confidence_breakdown?.groundedness,
      verified: result.citation_verification?.filter(v => v.verified).length || 0,
      totalVerified: result.citation_verification?.length || 0,
      duration
    });

    if (passed) {
      METRICS.passed++;
      METRICS.byCategory[tc.category].passed++;
      METRICS.byCategory[tc.category].citations += result.citations?.length || 0;
      if (tc.category === "adversarial") METRICS.adversarial.passed++;
      console.log(`  PASS  [${tc.id}] ${tc.query.slice(0, 50)} — ${result.citations?.length || 0} cites, ${result.confidence || 0}%`);
    } else {
      console.log(`  FAIL  [${tc.id}] ${tc.query.slice(0, 50)} — expected ${tc.expectedStatus}, got ${result.status}`);
    }
  }

  /* Summary */
  const avgLatency = METRICS.latency.length
    ? Math.round(METRICS.latency.reduce((a, b) => a + b, 0) / METRICS.latency.length)
    : 0;
  const sortedLat = [...METRICS.latency].sort((a, b) => a - b);
  const p95 = sortedLat.length
    ? sortedLat[Math.floor(sortedLat.length * 0.95)]
    : 0;
  const citFidelity = METRICS.citations.total
    ? (METRICS.citations.withMarkers / METRICS.citations.total * 100).toFixed(1)
    : "N/A";
  const hallRate = METRICS.citations.total
    ? (METRICS.hallucination.unsupported / METRICS.citations.total * 100).toFixed(1)
    : "N/A";
  const verRate = METRICS.verification.total
    ? `${METRICS.verification.verified}/${METRICS.verification.total} (${(METRICS.verification.verified / METRICS.verification.total * 100).toFixed(0)}%)`
    : "N/A";
  const avgGrounded = METRICS.groundedness.reported
    ? Math.round(METRICS.groundedness.totalScore / METRICS.groundedness.reported)
    : "N/A";

  console.log();
  console.log("=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));
  console.log(`  Total:           ${TEST_CASES.length}`);
  console.log(`  Passed:          ${METRICS.passed}/${TEST_CASES.length} (${(METRICS.passed / TEST_CASES.length * 100).toFixed(0)}%)`);
  console.log(`  Adversarial:     ${METRICS.adversarial.passed}/${METRICS.adversarial.total}`);
  console.log(`  Avg Latency:     ${avgLatency}ms`);
  console.log(`  p95 Latency:     ${p95}ms`);
  console.log(`  Citation Fid:    ${citFidelity}%`);
  console.log(`  Hallucination:   ${hallRate}%`);
  console.log(`  Citation Ver:    ${verRate}`);
  console.log(`  Avg Grounded:    ${avgGrounded}%`);
  console.log();

  console.log("  By Category:");
  for (const [cat, m] of Object.entries(METRICS.byCategory)) {
    const pct = m.total ? (m.passed / m.total * 100).toFixed(0) : "N/A";
    console.log(`    ${cat.padEnd(15)} ${m.passed}/${m.total} (${pct}%) — ${m.citations} cites`);
  }

  /* Export results */
  const output = {
    runTimestamp: new Date().toISOString(),
    totalCases: TEST_CASES.length,
    passed: METRICS.passed,
    failed: TEST_CASES.length - METRICS.passed,
    metrics: {
      passRate: `${(METRICS.passed / TEST_CASES.length * 100).toFixed(0)}%`,
      adversarial: `${METRICS.adversarial.passed}/${METRICS.adversarial.total}`,
      avgLatencyMs: avgLatency,
      p95LatencyMs: p95,
      citationFidelity: citFidelity,
      hallucinationRate: hallRate,
      citationVerified: verRate,
      avgGroundedness: avgGrounded
    },
    byCategory: METRICS.byCategory,
    perCase: METRICS.perCase
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n  Results exported to: ${OUTPUT_PATH}`);

  const allPassed = METRICS.passed === TEST_CASES.length;
  process.exit(allPassed ? 0 : 1);
}

evaluate().catch(err => { console.error("v2 eval error:", err); process.exit(1); });
