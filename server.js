import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildCorpusStore } from "./src/corpusStore.js";
import { answerLegalQuery } from "./src/ragPipeline.js";
import { createCache } from "./src/cache.js";
import { ingestDocument } from "./src/ingest.js";
import { getEvents, getEventSummary, getQueryAudit, getHallucinationSummary, recordQueryAudit, recordLatency, getLatencySummary, recordFeedback, getFeedbackSummary } from "./src/analytics.js";
import { recordQuery, recordProductClick, recordSourceView, recordMemoExport, addLead, getLeads, getTopPracticeAreas, getUserProfile, getCrmSummary } from "./src/crm.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 5174);

const store = await buildCorpusStore({
  seedCorpusPath: path.join(__dirname, "data", "legal_corpus.json"),
  localCorpusPath: path.join(__dirname, "data", "local_corpus.json")
});

const cache = createCache(process.env.REDIS_URL || "redis://localhost:6379");

const TIERS = ["free", "basic", "premium", "enterprise"];

function corpusSummary() {
  const documents = store.getDocuments();
  const unique = (field) => new Set(documents.map((document) => document[field]).filter(Boolean)).size;
  const courts = [...new Set(documents.map((document) => document.court).filter(Boolean))].sort();
  const acts = [...new Set(documents.map((document) => document.act).filter(Boolean))].sort();
  const productCount = documents.reduce((sum, document) => sum + (document.related_products?.length || 0), 0);
  return {
    indexed_documents: documents.length,
    indexed_chunks: store.getChunks().length,
    courts, acts,
    related_products: productCount,
    document_types: unique("document_type"),
    production_target: { pdfs: "26L+", update_cadence: "weekly / daily incremental ingestion", retrieval_stack: "BM25 + vector + metadata + reranker + citation gate" }
  };
}

function sourcePayload(documentId) {
  const document = store.getDocuments().find((item) => item.document_id === documentId);
  if (!document) return null;
  return {
    document_id: document.document_id, title: document.title,
    citation: document.citation || "", court: document.court || "",
    judge: document.judge || "", year: document.year || "",
    bench: document.bench || "", act: document.act || "",
    section: document.section || "", topic: document.topic || "",
    document_type: document.document_type || "", publisher: document.publisher || "",
    source_url: document.source_url || "", source_pdf_url: document.source_pdf_url || "",
    ebc_reader_url: document.ebc_reader_url || "", webstore_url: document.webstore_url || "",
    authority_status: document.authority_status || "Authority treatment not available",
    treatment_summary: document.treatment_summary || [],
    related_products: document.related_products || [],
    subscription_tier: document.subscription_tier || "free",
    chunks: (document.chunks || []).map((chunk) => ({
      chunk_id: chunk.chunk_id, paragraph: chunk.paragraph,
      pdf_page: chunk.pdf_page, section: chunk.section,
      topic: chunk.topic, text: chunk.text
    }))
  };
}

function extractUser(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const userId = url.searchParams.get("user_id") || req.headers["x-user-id"] || "anonymous";
  const role = url.searchParams.get("role") || req.headers["x-user-role"] || "anonymous";
  const tier = url.searchParams.get("tier") || req.headers["x-user-tier"] || "free";
  return { userId, role, tier: TIERS.includes(tier) ? tier : "free" };
}

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 1_000_000) { reject(new Error("Payload too large.")); req.destroy(); } });
    req.on("end", () => { if (!body) { resolve({}); return; } try { resolve(JSON.parse(body)); } catch { reject(new Error("Invalid JSON body.")); } });
    req.on("error", reject);
  });
}

function setSessionCookie(res, userId) {
  res.setHeader("set-cookie", `ebc_session=${userId}; path=/; max-age=86400; httponly; samesite=lax`);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalizedPath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, normalizedPath);
  if (!filePath.startsWith(publicDir)) { res.writeHead(403); res.end("Forbidden"); return; }
  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": contentTypes.get(ext) || "application/octet-stream", "cache-control": "no-cache" });
    res.end(file);
  } catch {
    const fallback = await readFile(path.join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    res.end(fallback);
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const user = extractUser(req);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true, service: "legal-evidence-rag",
      corpus_documents: store.getDocuments().length,
      corpus_chunks: store.getChunks().length,
      summary: corpusSummary(),
      guardrail: "answers require retrieved and citation-valid evidence"
    });
  }

  if (req.method === "GET" && url.pathname === "/api/corpus") {
    return sendJson(res, 200, {
      summary: corpusSummary(),
      documents: store.getDocuments().map((d) => ({
        document_id: d.document_id, title: d.title, citation: d.citation,
        court: d.court, year: d.year, act: d.act, section: d.section,
        topic: d.topic, document_type: d.document_type, publisher: d.publisher,
        authority_status: d.authority_status, treatment_summary: d.treatment_summary || [],
        related_products: d.related_products || [],
        ebc_reader_url: d.ebc_reader_url, webstore_url: d.webstore_url,
        demo_only: Boolean(d.demo_only),
        subscription_tier: d.subscription_tier || "free"
      }))
    });
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const startTime = Date.now();
    const body = await readBody(req);
    const role = body.role || user.role;
    const tier = body.tier || user.tier;
    const result = await answerLegalQuery({
      query: String(body.query || ""),
      filters: body.filters || {},
      role,
      store,
      cache,
      userTier: tier,
      userId: user.userId
    });
    const duration = Date.now() - startTime;
    recordLatency("chat", duration);
    recordQuery(user.userId, body.query || "", result.query_intent, result.related_documents?.length || 0, result.status === "answered");
    recordQueryAudit({
      query: body.query,
      intent: result.query_intent,
      confidence: result.confidence || 0,
      status: result.status,
      citationCount: result.citations?.length || 0,
      unsupportedSentences: result.unsupported_sentences || [],
      answerType: result.answer_type || "none",
      answeredAt: Date.now()
    });
    if (result.status !== "answered") addLead({ query: body.query, userId: user.userId, intent: result.query_intent, reason: result.reason || "no_answer" });
    setSessionCookie(res, user.userId);
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/api/events") {
    const body = await readBody(req);
    setSessionCookie(res, user.userId);
    return sendJson(res, 201, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    return sendJson(res, 200, { events: getEvents(200), summary: getEventSummary() });
  }

  if (req.method === "GET" && url.pathname === "/api/crm") {
    return sendJson(res, 200, { summary: getCrmSummary(), leads: getLeads(20) });
  }

  if (req.method === "POST" && url.pathname === "/api/crm/leads") {
    const body = await readBody(req);
    addLead(body);
    return sendJson(res, 201, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/profile") {
    const profile = getUserProfile(user.userId);
    const topAreas = getTopPracticeAreas(user.userId);
    return sendJson(res, 200, { userId: user.userId, role: user.role, tier: user.tier, profile, topPracticeAreas: topAreas });
  }

  if (req.method === "POST" && url.pathname === "/api/track/click") {
    const body = await readBody(req);
    const { event, product, document_id, citation_count } = body;
    if (event === "product_click") recordProductClick(user.userId, product, document_id);
    if (event === "source_view") recordSourceView(user.userId, document_id);
    if (event === "memo_export") recordMemoExport(user.userId, citation_count || 0);
    return sendJson(res, 201, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/source") {
    const startTime = Date.now();
    const documentId = url.searchParams.get("document_id");
    const source = sourcePayload(documentId);
    if (!source) return sendJson(res, 404, { error: "Source document not found." });
    recordSourceView(user.userId, documentId);
    recordLatency("source_view", Date.now() - startTime);
    return sendJson(res, 200, source);
  }

  if (req.method === "POST" && url.pathname === "/api/documents") {
    const body = await readBody(req);
    const document = ingestDocument(body);
    await store.addDocument(document);
    return sendJson(res, 201, { ok: true, document_id: document.document_id, chunks_indexed: document.chunks.length });
  }

  if (req.method === "GET" && url.pathname === "/api/audit") {
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
    return sendJson(res, 200, {
      summary: getHallucinationSummary(),
      recent: getQueryAudit(limit)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const body = await readBody(req);
    recordFeedback({
      userId: user.userId,
      query: body.query,
      rating: body.rating,
      comments: body.comments,
      metadata: body.metadata
    });
    return sendJson(res, 201, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/feedback") {
    return sendJson(res, 200, { summary: getFeedbackSummary() });
  }

  if (req.method === "GET" && url.pathname === "/api/latency") {
    const op = url.searchParams.get("operation") || undefined;
    return sendJson(res, 200, { [op || "all"]: getLatencySummary(op) });
  }

  if (req.method === "GET" && url.pathname === "/api/architecture") {
    return sendJson(res, 200, {
      local: ["Node HTTP API", "Evidence-gated RAG pipeline", "JSON corpus", "Browser UI"],
      production_targets: ["PostgreSQL", "OpenSearch BM25", "Qdrant/OpenSearch vector", "Cross-encoder reranker", "Bedrock or private LLM", "S3", "SQS", "ECS/EKS", "CloudWatch"],
      refusal_policy: "No retrieved and citation-valid evidence means no answer."
    });
  }

  sendJson(res, 404, { error: "API route not found." });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/")) { await handleApi(req, res); return; }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Request failed." });
  }
});

server.listen(port, () => {
  console.log(`Legal Evidence RAG running at http://localhost:${port}`);
});
