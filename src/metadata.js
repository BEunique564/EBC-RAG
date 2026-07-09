const COURTS = [
  "Supreme Court",
  "High Court",
  "Delhi High Court",
  "Bombay High Court",
  "Madras High Court",
  "Calcutta High Court",
  "NCLAT",
  "NCLT",
  "ITAT",
  "CESTAT",
  "Tribunal"
];

const ACT_ALIASES = [
  { label: "CGST Act", terms: ["cgst", "central goods and services tax"] },
  { label: "GST", terms: ["gst", "goods and services tax"] },
  { label: "Indian Penal Code", terms: ["ipc", "indian penal code"] },
  { label: "Constitution of India", terms: ["constitution"] },
  { label: "Insolvency and Bankruptcy Code", terms: ["ibc", "insolvency", "bankruptcy"] },
  { label: "Code of Criminal Procedure", terms: ["crpc", "criminal procedure"] }
];

export function extractQueryMetadata(query) {
  const normalized = String(query || "").toLowerCase();
  const years = [...normalized.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]));
  const afterMatch = normalized.match(/\bafter\s+((?:19|20)\d{2})\b/);
  const beforeMatch = normalized.match(/\bbefore\s+((?:19|20)\d{2})\b/);
  const sectionMatches = [...normalized.matchAll(/\b(?:section|sec\.?)\s*([0-9]+[a-z]?(?:\([0-9a-z]+\))*)/g)].map((match) => match[1].toUpperCase());
  const paragraphMatches = [...normalized.matchAll(/\b(?:para|paragraph)\s*([0-9]+[a-z]?)/g)].map((match) => match[1]);
  const latest = /\b(latest|recent|newest|new|current|updated)\b/.test(normalized);

  const courts = COURTS.filter((court) => normalized.includes(court.toLowerCase()));
  const acts = ACT_ALIASES.filter((act) => act.terms.some((term) => normalized.includes(term))).map((act) => act.label);
  const citationMatches = [
    ...String(query || "").matchAll(/\b\d{4}\s+[A-Z]{2,}\s+\d+\b/g),
    ...String(query || "").matchAll(/\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+v\.?\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\b/g)
  ].map((match) => match[0]);

  const parts = query.split(/\s+(?:v(?:s|\.)?\.?)\s+/i);
  const parties = parts.length === 2 && /^[A-Z]/.test(parts[0].trim()) && /^[A-Z]/.test(parts[1].trim())
    ? (() => {
        const p = [parts[0].trim(), parts[1].trim()];
        const strip = (s) => s.replace(/\s+(Section|Article|IPC|GST|Act|Code|Rule|year|latest|under|judgment|what|give|show|compare|material|case|on|me).*/i, '').trim();
        return { petitioner: strip(p[0]), respondent: strip(p[1]) };
      })()
    : null;

  return {
    years,
    year_after: afterMatch ? Number(afterMatch[1]) : null,
    year_before: beforeMatch ? Number(beforeMatch[1]) : null,
    sections: sectionMatches,
    paragraphs: paragraphMatches,
    courts,
    acts,
    citations: citationMatches,
    latest,
    parties
  };
}

function partyBoost(document, queryMetadata) {
  if (!queryMetadata.parties) return 0;
  const title = String(document.title || "").toLowerCase();
  const text = document.chunks?.map(c => String(c.text || "")).join(" ").toLowerCase() || "";
  const haystack = `${title} ${text}`;
  const p = queryMetadata.parties;
  const hasPet = haystack.includes(p.petitioner.toLowerCase());
  const hasRes = haystack.includes(p.respondent.toLowerCase());
  if (hasPet && hasRes) return 0.35;
  if (hasPet || hasRes) return 0.18;
  return 0;
}

export function documentMatchesFilters(document, filters = {}, queryMetadata = {}) {
  const normalizedCourt = String(document.court || "").toLowerCase();
  const normalizedAct = String(document.act || "").toLowerCase();
  const normalizedType = String(document.document_type || "").toLowerCase();

  if (filters.court && normalizedCourt !== String(filters.court).toLowerCase()) return false;
  if (filters.act && normalizedAct !== String(filters.act).toLowerCase()) return false;
  if (filters.document_type && normalizedType !== String(filters.document_type).toLowerCase()) return false;

  if (filters.year_from && Number(document.year || 0) < Number(filters.year_from)) return false;
  if (filters.year_to && Number(document.year || 0) > Number(filters.year_to)) return false;

  if (queryMetadata.year_after && Number(document.year || 0) <= queryMetadata.year_after) return false;
  if (queryMetadata.year_before && Number(document.year || 0) >= queryMetadata.year_before) return false;

  if (queryMetadata.years?.length && document.year && !queryMetadata.years.includes(Number(document.year))) {
    return false;
  }

  if (queryMetadata.courts?.length) {
    const hasCourt = queryMetadata.courts.some((court) => normalizedCourt.includes(court.toLowerCase()));
    if (!hasCourt) return false;
  }

  if (queryMetadata.acts?.length) {
    const hasAct = queryMetadata.acts.some((act) => normalizedAct.includes(act.toLowerCase()) || String(document.topic || "").toLowerCase().includes(act.toLowerCase()));
    if (!hasAct) return false;
  }

  return true;
}

export function metadataBoost(document, chunk, queryMetadata) {
  let boost = 0;
  const section = String(chunk.section || document.section || "").toUpperCase();
  const court = String(document.court || "").toLowerCase();
  const act = String(document.act || "").toLowerCase();
  const citation = String(document.citation || "").toLowerCase();
  const title = String(document.title || "").toLowerCase();

  for (const requestedSection of queryMetadata.sections || []) {
    if (section.includes(requestedSection)) boost += 0.2;
  }
  for (const requestedCourt of queryMetadata.courts || []) {
    if (court.includes(requestedCourt.toLowerCase())) boost += 0.15;
  }
  for (const requestedAct of queryMetadata.acts || []) {
    if (act.includes(requestedAct.toLowerCase()) || title.includes(requestedAct.toLowerCase())) boost += 0.15;
  }
  for (const requestedCitation of queryMetadata.citations || []) {
    const normalized = requestedCitation.toLowerCase();
    if (citation.includes(normalized) || title.includes(normalized)) boost += 0.3;
  }
  if (queryMetadata.latest && document.year) {
    boost += Math.min(Math.max((Number(document.year) - 2020) / 40, 0), 0.14);
  }

  boost += partyBoost(document, queryMetadata);
  return Math.min(boost, 0.55);
}
