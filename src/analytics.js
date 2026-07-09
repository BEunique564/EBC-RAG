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
