/**
 * Load testing script for EBC Legal AI Assistant.
 * Simulates concurrent users making legal research queries.
 *
 * Usage:
 *   node tests/load/loadtest.js              # runs against localhost:5174
 *   BASE_URL=http://localhost:5174 CONCURRENCY=5 node tests/load/loadtest.js
 *
 * Exits with code 0 if all SLOs met, 1 otherwise.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:5174";
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "10", 10);
const REQUESTS_PER_USER = parseInt(process.env.REQUESTS_PER_USER || "10", 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "30000", 10);
const P95_LATENCY_SLO = parseInt(process.env.P95_LATENCY_SLO || "5000", 10); /* ms */
const REFUSAL_RATE_SLO = parseFloat(process.env.REFUSAL_RATE_SLO || "0.05"); /* 5% */
const ERROR_RATE_SLO = parseFloat(process.env.ERROR_RATE_SLO || "0.01"); /* 1% */

const TEST_QUERIES = [
  "Latest Supreme Court judgments on Section 420 IPC",
  "What is GST input tax credit under Section 16?",
  "Privacy under Article 21 of the Constitution",
  "Vodafone India Ltd v. Union of India GST dispute analysis",
  "Rohit Sharma vs State of Maharashtra Section 420",
  "Bail under Section 439 CrPC",
  "Resolution plan under IBC Section 30",
  "Right to privacy under Constitution of India",
  "Corporate insolvency resolution process",
  "Cheating and fraud under IPC Section 420",
  "Input tax credit conditions and restrictions",
  "Article 21 personal liberty",
  "Committee of creditors commercial wisdom",
  "Bail jurisprudence Supreme Court",
  "CGST Act Section 16 eligibility"
];

function randomQuery() {
  return TEST_QUERIES[Math.floor(Math.random() * TEST_QUERIES.length)];
}

function randomUserId() {
  return `loadtest-${Math.random().toString(36).slice(2, 8)}`;
}

const tiers = ["free", "basic", "premium", "enterprise"];

function randomTier() {
  return tiers[Math.floor(Math.random() * tiers.length)];
}

async function query(params) {
  const { query, userId, tier, signal } = params;
  const start = Date.now();
  let status, cited, error;
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": userId,
        "x-user-tier": tier
      },
      body: JSON.stringify({ query, filters: {}, role: "lawyer", tier }),
      signal
    });
    const body = await res.json();
    status = body.status;
    cited = (body.citations || []).length;
    if (!res.ok) error = body.error || `HTTP ${res.status}`;
  } catch (err) {
    if (err.name === "AbortError") {
      error = "timeout";
    } else {
      error = err.message;
    }
  }
  return {
    duration: Date.now() - start,
    status,
    cited,
    error,
    query: query.slice(0, 60)
  };
}

async function simulateUser(userId) {
  const results = [];
  for (let i = 0; i < REQUESTS_PER_USER; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const result = await query({
        query: randomQuery(),
        userId,
        tier: randomTier(),
        signal: controller.signal
      });
      results.push(result);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return results;
}

function printResults(allResults) {
  const latencies = allResults.map(r => r.duration).sort((a, b) => a - b);
  const total = latencies.length;
  const p50 = latencies[Math.floor(total * 0.50)];
  const p95 = latencies[Math.floor(total * 0.95)];
  const p99 = latencies[Math.floor(total * 0.99)];
  const avg = latencies.reduce((a, b) => a + b, 0) / total;

  const errors = allResults.filter(r => r.error).length;
  const refusals = allResults.filter(r => r.status === "insufficient_evidence").length;
  const success = allResults.filter(r => r.status === "answered").length;
  const timeouts = allResults.filter(r => r.error === "timeout").length;

  console.log();
  console.log("=".repeat(60));
  console.log("LOAD TEST RESULTS");
  console.log("=".repeat(60));
  console.log(`  Concurrency:       ${CONCURRENCY} users`);
  console.log(`  Requests/User:     ${REQUESTS_PER_USER}`);
  console.log(`  Total Requests:    ${total}`);
  console.log();
  console.log(`  Successful:        ${success} (${(success/total*100).toFixed(1)}%)`);
  console.log(`  Refused:           ${refusals} (${(refusals/total*100).toFixed(1)}%)`);
  console.log(`  Errors:            ${errors} (${(errors/total*100).toFixed(1)}%)`);
  console.log(`  Timeouts:          ${timeouts} (${(timeouts/total*100).toFixed(1)}%)`);
  console.log();
  console.log("  LATENCY");
  console.log(`    Average:         ${Math.round(avg)}ms`);
  console.log(`    p50:             ${p50}ms`);
  console.log(`    p95:             ${p95}ms`);
  console.log(`    p99:             ${p99}ms`);
  console.log();

  /* SLO checks */
  const sloResults = [];
  const p95Ok = p95 <= P95_LATENCY_SLO;
  sloResults.push({ name: `p95 latency <= ${P95_LATENCY_SLO}ms`, passed: p95Ok, actual: `${p95}ms` });

  const refusalRate = refusals / total;
  const refusalOk = refusalRate <= REFUSAL_RATE_SLO;
  sloResults.push({ name: `Refusal rate <= ${(REFUSAL_RATE_SLO*100)}%`, passed: refusalOk, actual: `${(refusalRate*100).toFixed(1)}%` });

  const errorRate = errors / total;
  const errorOk = errorRate <= ERROR_RATE_SLO;
  sloResults.push({ name: `Error rate <= ${(ERROR_RATE_SLO*100)}%`, passed: errorOk, actual: `${(errorRate*100).toFixed(1)}%` });

  console.log("  SLOs");
  for (const slo of sloResults) {
    console.log(`    ${slo.passed ? "PASS" : "FAIL"} ${slo.name} (actual: ${slo.actual})`);
  }
  console.log();

  const allPassed = sloResults.every(s => s.passed);
  if (!allPassed) {
    console.log("  SLO VIOLATIONS DETECTED");
  }

  return allPassed;
}

async function main() {
  console.log("EBC Legal AI — Load Test");
  console.log(`  Target:    ${BASE_URL}`);
  console.log(`  Users:     ${CONCURRENCY}`);
  console.log(`  Iter/U:    ${REQUESTS_PER_USER}`);
  console.log(`  Timeout:   ${TIMEOUT_MS}ms`);

  console.log();
  const allResults = [];
  const startTime = Date.now();
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(simulateUser(randomUserId()));
  }
  const workerResults = await Promise.all(workers);
  for (const results of workerResults) {
    allResults.push(...results);
  }
  const elapsed = Date.now() - startTime;
  console.log(`  Duration:  ${(elapsed / 1000).toFixed(1)}s`);

  const passed = printResults(allResults);
  process.exit(passed ? 0 : 1);
}

main().catch(err => { console.error("Load test error:", err); process.exit(1); });
