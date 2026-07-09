/**
 * SLO monitoring and alerting for EBC Legal AI Assistant.
 * Can be run as a cron job or health check probe.
 *
 * Usage:
 *   node tests/load/slos.js                    # run all SLO checks
 *   node tests/load/slos.js --watch            # continuous monitoring (every 30s)
 *   node tests/load/slos.js --alert-webhook    # POST failures to webhook URL
 *
 * SLOs defined:
 *   LATENCY_P95_MS    < 5000ms   (95th percentile response time)
 *   REFUSAL_RATE      < 5%       (queries that return insufficient_evidence)
 *   ERROR_RATE        < 1%       (HTTP 5xx, crashes, timeouts)
 *   CITATION_VERIFIED  > 90%     (citations with complete metadata)
 *   ANSWER_RELEASE     > 90%     (queries that produce an answer vs refusal)
 *   UPTIME             > 99.5%   (API health endpoint)
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:5174";
const WATCH_INTERVAL = parseInt(process.env.WATCH_INTERVAL || "30000", 10);
const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK || null;

const SLO_THRESHOLDS = {
  LATENCY_P95_MS: parseInt(process.env.SLO_LATENCY_P95 || "5000", 10),
  REFUSAL_RATE: parseFloat(process.env.SLO_REFUSAL_RATE || "0.05"),
  ERROR_RATE: parseFloat(process.env.SLO_ERROR_RATE || "0.01"),
  CITATION_VERIFIED: parseFloat(process.env.SLO_CITATION_VERIFIED || "0.90"),
  ANSWER_RELEASE: parseFloat(process.env.SLO_ANSWER_RELEASE || "0.90"),
  UPTIME: parseFloat(process.env.SLO_UPTIME || "0.995")
};

const TEST_QUERIES = [
  "Latest Supreme Court judgments on Section 420 IPC",
  "What is GST input tax credit under Section 16?",
  "Privacy under Article 21",
  "Vodafone India Ltd v. Union of India",
  "Rohit Sharma vs State of Maharashtra",
  "xyzzy quantum zzzzz figs",
  "",
  "Bail under Section 439 CrPC",
  "Resolution plan IBC Section 30",
  "CGST Act input tax credit"
];

async function checkHealth() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    const body = await res.json();
    return { ok: res.ok && body.ok, data: body };
  } catch {
    return { ok: false, data: null };
  }
}

async function runProbes(sampleSize = 10) {
  const probes = [];
  const queries = [...TEST_QUERIES];
  while (queries.length < sampleSize) {
    queries.push(TEST_QUERIES[Math.floor(Math.random() * TEST_QUERIES.length)]);
  }

  for (const query of queries.slice(0, sampleSize)) {
    const start = Date.now();
    let status, cited, verified, error;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const body = await res.json();
      status = body.status;
      cited = (body.citations || []).length;
      const ver = body.citation_verification || [];
      verified = ver.length ? ver.filter(v => v.verified).length / ver.length : 0;
      if (!res.ok || body.error) error = body.error || `HTTP ${res.status}`;
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        error = "timeout";
      } else {
        error = err.message;
      }
    }
    probes.push({
      query: query.slice(0, 50),
      duration: Date.now() - start,
      status,
      cited,
      verified,
      error
    });
  }

  return probes;
}

function evaluateSLOs(probes, healthResult) {
  const latencies = probes.filter(p => !p.error && p.duration).map(p => p.duration).sort((a, b) => a - b);
  const total = probes.length;
  const errors = probes.filter(p => p.error).length;
  const refusals = probes.filter(p => p.status === "insufficient_evidence").length;
  const answered = probes.filter(p => p.status === "answered").length;
  const verifiedRates = probes.filter(p => p.verified != null).map(p => p.verified);
  const avgVerified = verifiedRates.length
    ? verifiedRates.reduce((a, b) => a + b, 0) / verifiedRates.length
    : 0;

  const p95 = latencies.length
    ? latencies[Math.floor(latencies.length * 0.95)]
    : Infinity;
  const errorRate = total ? errors / total : 1;
  const refusalRate = total ? refusals / total : 1;
  const answerRate = total ? answered / total : 0;
  const uptime = healthResult.ok ? 1 : 0;

  const results = [
    {
      name: "p95 latency",
      threshold: `${SLO_THRESHOLDS.LATENCY_P95_MS}ms`,
      actual: `${p95}ms`,
      passed: p95 <= SLO_THRESHOLDS.LATENCY_P95_MS
    },
    {
      name: "refusal rate",
      threshold: `${(SLO_THRESHOLDS.REFUSAL_RATE * 100)}%`,
      actual: `${(refusalRate * 100).toFixed(1)}%`,
      passed: refusalRate <= SLO_THRESHOLDS.REFUSAL_RATE
    },
    {
      name: "error rate",
      threshold: `${(SLO_THRESHOLDS.ERROR_RATE * 100)}%`,
      actual: `${(errorRate * 100).toFixed(1)}%`,
      passed: errorRate <= SLO_THRESHOLDS.ERROR_RATE
    },
    {
      name: "citation verified rate",
      threshold: `${(SLO_THRESHOLDS.CITATION_VERIFIED * 100)}%`,
      actual: `${(avgVerified * 100).toFixed(1)}%`,
      passed: avgVerified >= SLO_THRESHOLDS.CITATION_VERIFIED
    },
    {
      name: "answer release rate",
      threshold: `${(SLO_THRESHOLDS.ANSWER_RELEASE * 100)}%`,
      actual: `${(answerRate * 100).toFixed(1)}%`,
      passed: answerRate >= SLO_THRESHOLDS.ANSWER_RELEASE
    },
    {
      name: "uptime",
      threshold: `${(SLO_THRESHOLDS.UPTIME * 100)}%`,
      actual: `${(uptime * 100).toFixed(1)}%`,
      passed: uptime >= SLO_THRESHOLDS.UPTIME
    }
  ];

  return results;
}

async function sendAlert(results) {
  if (!ALERT_WEBHOOK) return;
  const violations = results.filter(r => !r.passed);
  if (!violations.length) return;

  try {
    await fetch(ALERT_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service: "ebc-legal-ai",
        type: "slo_violation",
        timestamp: new Date().toISOString(),
        violations: violations.map(v => ({
          slo: v.name,
          threshold: v.threshold,
          actual: v.actual
        }))
      }),
      signal: AbortSignal.timeout(5000)
    });
  } catch {}
}

function printResults(results) {
  const allPassed = results.every(r => r.passed);
  console.log();
  console.log("=".repeat(60));
  console.log(`SLO CHECK — ${allPassed ? "ALL PASSING" : "VIOLATIONS DETECTED"}`);
  console.log("=".repeat(60));
  for (const r of results) {
    const icon = r.passed ? "PASS" : "FAIL";
    console.log(`  ${icon}  ${r.name}: ${r.actual} (threshold: ${r.threshold})`);
  }
  console.log();
  return allPassed;
}

async function runOnce() {
  const healthResult = await checkHealth();
  const probes = await runProbes(10);
  const results = evaluateSLOs(probes, healthResult);
  const allPassed = printResults(results);
  await sendAlert(results);
  return allPassed;
}

async function runWatch() {
  console.log(`EBC SLO Monitor — watching every ${WATCH_INTERVAL / 1000}s`);
  console.log(`  Stale failure alert for failures > ${parseInt(process.env.STALE_ALERT_AFTER || "300000", 10) / 60000}min`);
  let lastFailure = 0;
  const staleAfter = parseInt(process.env.STALE_ALERT_AFTER || "300000", 10);

  while (true) {
    const now = Date.now();
    try {
      const allPassed = await runOnce();
      if (!allPassed) {
        if (lastFailure === 0) lastFailure = now;
        if (now - lastFailure > staleAfter) {
          console.log(`  [ALERT] Stale failure for ${(now - lastFailure) / 1000}s`);
          lastFailure = now;
        }
      } else {
        lastFailure = 0;
      }
    } catch (err) {
      console.error(`  Monitor error: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, WATCH_INTERVAL));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes("--watch");

  if (watchMode) {
    await runWatch();
  } else {
    const allPassed = await runOnce();
    process.exit(allPassed ? 0 : 1);
  }
}

main().catch(err => { console.error("SLO monitor error:", err); process.exit(1); });
