const PRACTICE_AREAS = [
  { area: "criminal", patterns: [/ipc/, /420/, /cheating/, /bail/, /crpc/, /criminal/, /theft/, /fraud/, /murder/, /penal/] },
  { area: "tax", patterns: [/gst/, /cgst/, /input tax credit/, /itc/, /income tax/, /customs/, /excise/, /tax/] },
  { area: "constitutional", patterns: [/constitution/, /article \d+/, /fundamental right/, /writ/, /privacy/, /article 21/, /article 14/, /article 19/] },
  { area: "corporate_insolvency", patterns: [/ibc/, /insolvency/, /bankruptcy/, /nclat/, /nclt/, /resolution plan/, /liquidat/, /corporate/] },
  { area: "civil", patterns: [/civil/, /tort/, /contract/, /property/, /transfer/, /specific relief/, /limitation/] },
  { area: "labour", patterns: [/labour/, /industrial/, /employee/, /workman/, /gratuity/, /pf /, /esi/, /factory/] }
];

const leads = [];
const userSessions = new Map();
const MAX_LEADS = 5000;

function extractPracticeAreas(query) {
  const normalized = (query || "").toLowerCase();
  const matched = [];
  for (const pa of PRACTICE_AREAS) {
    if (pa.patterns.some(p => p.test(normalized))) matched.push(pa.area);
  }
  return matched;
}

function getOrCreateSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      userId,
      queries: [],
      practiceAreas: {},
      productClicks: [],
      sourcesViewed: [],
      memosExported: 0,
      answersReceived: 0,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    });
  }
  return userSessions.get(userId);
}

function updateSession(userId, update) {
  const session = getOrCreateSession(userId);
  Object.assign(session, update, { lastActive: new Date().toISOString() });
  return session;
}

export function recordQuery(userId, query, intent, resultCount, answered) {
  const areas = extractPracticeAreas(query);
  const session = getOrCreateSession(userId);
  session.queries = [...session.queries, { query, intent, ts: new Date().toISOString() }].slice(-100);
  session.answersReceived = (session.answersReceived || 0) + (answered ? 1 : 0);
  session.lastActive = new Date().toISOString();
  for (const area of areas) {
    session.practiceAreas[area] = (session.practiceAreas[area] || 0) + 1;
  }
  if (!answered) addLead({ query, userId, intent, reason: "no_answer" });
  return { areas };
}

export function recordProductClick(userId, product, sourceDocumentId) {
  const s = getOrCreateSession(userId);
  updateSession(userId, {
    productClicks: [...s.productClicks, { product, sourceDocumentId, ts: new Date().toISOString() }].slice(-50)
  });
}

export function recordSourceView(userId, documentId) {
  const s = getOrCreateSession(userId);
  updateSession(userId, {
    sourcesViewed: [...s.sourcesViewed, { documentId, ts: new Date().toISOString() }].slice(-50)
  });
}

export function recordMemoExport(userId, citationCount) {
  const s = getOrCreateSession(userId);
  updateSession(userId, {
    memosExported: (s.memosExported || 0) + 1
  });
}

export function addLead(lead) {
  if (leads.length >= MAX_LEADS) leads.shift();
  leads.push({
    id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    query: lead.query,
    userId: lead.userId || "anonymous",
    intent: lead.intent || "unknown",
    reason: lead.reason || "unknown",
    ts: new Date().toISOString(),
    contacted: false
  });
}

export function getLeads(limit = 50) {
  return leads.slice(-limit).reverse();
}

export function getTopPracticeAreas(userId) {
  const session = userSessions.get(userId);
  if (!session) return [];
  return Object.entries(session.practiceAreas)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([area, count]) => ({ area, count }));
}

export function getUserProfile(userId) {
  return userSessions.get(userId) || null;
}

export function getCrmSummary() {
  const areaDemand = {};
  for (const [, session] of userSessions) {
    for (const [area, count] of Object.entries(session.practiceAreas)) {
      areaDemand[area] = (areaDemand[area] || 0) + count;
    }
  }
  const unanswered = leads.filter(l => l.reason === "no_answer");
  const practiceAreaDemand = Object.entries(areaDemand)
    .sort((a, b) => b[1] - a[1])
    .map(([area, count]) => ({ area, searches: count }));

  return {
    active_users: userSessions.size,
    total_queries: [...userSessions.values()].reduce((s, u) => s + u.queries.length, 0),
    product_clicks: [...userSessions.values()].reduce((s, u) => s + u.productClicks.length, 0),
    memos_exported: [...userSessions.values()].reduce((s, u) => s + (u.memosExported || 0), 0),
    unanswered_queries: unanswered.length,
    top_areas: practiceAreaDemand.slice(0, 10),
    leads_pipeline: leads.length,
    top_practice_areas_demand: practiceAreaDemand
  };
}
