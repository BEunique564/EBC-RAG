const events = [];
const MAX_EVENTS = 10000;

export function track(event, payload = {}) {
  const entry = {
    event,
    ts: new Date().toISOString(),
    payload
  };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.shift();
  if (typeof fetch !== "undefined") {
    fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry)
    }).catch(() => {});
  }
  return entry;
}

export function getEvents(limit = 200) {
  return events.slice(-limit);
}

export function getEventSummary() {
  const counts = {};
  for (const e of events) {
    counts[e.event] = (counts[e.event] || 0) + 1;
  }
  return {
    total: events.length,
    by_event: counts
  };
}

/* Hallucination audit */
const queryAuditLog = [];

export function recordQueryAudit({ query, intent, confidence, status, citationCount, unsupportedSentences, answerType, answeredAt }) {
  queryAuditLog.push({
    query: query.slice(0, 200),
    intent,
    confidence,
    status,
    citationCount,
    unsupportedSentences,
    answerType,
    answeredAt: answeredAt || Date.now(),
    ts: new Date().toISOString()
  });
  if (queryAuditLog.length > 5000) queryAuditLog.shift();
}

export function getQueryAudit(limit = 100) {
  return queryAuditLog.slice(-limit);
}

export function getHallucinationSummary() {
  const total = queryAuditLog.length;
  if (!total) return { total: 0, hallucination_rate: 0, avg_confidence: 0, answered_rate: 0 };
  const answered = queryAuditLog.filter(q => q.status === "answered");
  const answeredCount = answered.length;
  const avgConfidence = answeredCount ? Math.round(answered.reduce((s, q) => s + q.confidence, 0) / answeredCount) : 0;
  const withUnsupported = answered.filter(q => q.unsupportedSentences && q.unsupportedSentences.length > 0).length;
  return {
    total_queries: total,
    answered_rate: total ? Number((answeredCount / total).toFixed(3)) : 0,
    avg_confidence: avgConfidence,
    unsupported_sentence_rate: answeredCount ? Number((withUnsupported / answeredCount).toFixed(3)) : 0,
    hallucination_risk: withUnsupported > 0 ? "monitor" : "low"
  };
}

/* Latency tracking */
const latencySamples = [];

export function recordLatency(operation, durationMs) {
  latencySamples.push({ operation, durationMs, ts: Date.now() });
  if (latencySamples.length > 10000) latencySamples.shift();
}

export function getLatencySummary(operation) {
  const samples = operation
    ? latencySamples.filter(s => s.operation === operation)
    : latencySamples;
  if (!samples.length) return { p50: 0, p95: 0, p99: 0, avg: 0, count: 0 };
  const sorted = [...samples].map(s => s.durationMs).sort((a, b) => a - b);
  const n = sorted.length;
  return {
    count: n,
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / n),
    p50: sorted[Math.floor(n * 0.50)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)]
  };
}

/* User feedback */
const feedbackLog = [];

export function recordFeedback({ userId, query, rating, comments, metadata }) {
  feedbackLog.push({
    userId, query: (query || "").slice(0, 200), rating, comments, metadata,
    ts: new Date().toISOString()
  });
  if (feedbackLog.length > 5000) feedbackLog.shift();
}

export function getFeedbackSummary() {
  const total = feedbackLog.length;
  if (!total) return { total: 0, avg_rating: 0, distribution: {} };
  const ratings = feedbackLog.filter(f => f.rating != null);
  const avgRating = ratings.length ? ratings.reduce((s, f) => s + f.rating, 0) / ratings.length : 0;
  const dist = {};
  for (const f of ratings) {
    const r = f.rating.toString();
    dist[r] = (dist[r] || 0) + 1;
  }
  return { total, avg_rating: Number(avgRating.toFixed(2)), distribution: dist };
}

/* SLO tracking */
const sloViolations = [];
const SLO_DEFINITIONS = [
  { name: "p95_latency_ms", threshold: parseInt(process.env.SLO_LATENCY_P95 || "5000", 10), type: "max" },
  { name: "error_rate", threshold: parseFloat(process.env.SLO_ERROR_RATE || "0.01"), type: "max" },
  { name: "citation_verified_rate", threshold: parseFloat(process.env.SLO_CITATION_VERIFIED || "0.90"), type: "min" },
  { name: "answer_release_rate", threshold: parseFloat(process.env.SLO_ANSWER_RELEASE || "0.90"), type: "min" },
  { name: "refusal_rate", threshold: parseFloat(process.env.SLO_REFUSAL_RATE || "0.05"), type: "max" },
  { name: "uptime", threshold: parseFloat(process.env.SLO_UPTIME || "0.995"), type: "min" }
];

export function getSloDefinitions() {
  return SLO_DEFINITIONS;
}

export function recordSloViolation(sloName, actual, threshold) {
  sloViolations.push({
    slo: sloName,
    actual,
    threshold,
    ts: new Date().toISOString()
  });
  if (sloViolations.length > 1000) sloViolations.shift();
}

export function getSloViolations(limit = 50) {
  return sloViolations.slice(-limit).reverse();
}

export function getSloSummary() {
  const latency = getLatencySummary("chat");
  const audit = getQueryAudit(200);
  const total = audit.length;
  const hasData = total > 0;
  const errors = hasData ? audit.filter(q => q.status === "error").length : 0;
  const answered = hasData ? audit.filter(q => q.status === "answered").length : 0;
  const refusals = hasData ? audit.filter(q => q.status === "insufficient_evidence").length : 0;
  const verifiedRates = audit.filter(q => q.citationCount > 0).map(() => 1);
  const avgVerified = verifiedRates.length
    ? verifiedRates.reduce((a, b) => a + b, 0) / verifiedRates.length
    : null;

  const results = [];
  for (const slo of SLO_DEFINITIONS) {
    let actual;
    if (slo.name === "p95_latency_ms") actual = hasData ? (latency.p95 || 0) : null;
    else if (slo.name === "error_rate") actual = hasData ? errors / total : null;
    else if (slo.name === "citation_verified_rate") actual = avgVerified;
    else if (slo.name === "answer_release_rate") actual = hasData ? answered / total : null;
    else if (slo.name === "refusal_rate") actual = hasData ? refusals / total : null;
    else actual = null;

    if (actual === null) {
      results.push({ name: slo.name, threshold: slo.threshold, actual: null, passed: null, status: "insufficient_data" });
    } else {
      const passed = slo.type === "max" ? actual <= slo.threshold : actual >= slo.threshold;
      results.push({ name: slo.name, threshold: slo.threshold, actual: Number(actual.toFixed(4)), passed, status: passed ? "pass" : "fail" });
      if (!passed) recordSloViolation(slo.name, actual, slo.threshold);
    }
  }

  const checked = results.filter(r => r.actual !== null).length;
  const allPassing = checked > 0 && results.filter(r => r.actual !== null).every(r => r.passed);
  return { checked, total_definitions: SLO_DEFINITIONS.length, results, all_passing: allPassing };
}
