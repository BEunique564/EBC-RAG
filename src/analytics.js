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
