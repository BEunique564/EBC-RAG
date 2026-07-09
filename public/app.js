const state = {
  health: null, lastResult: null, lastQuery: "", activeSource: null,
  workspace: [], userId: "", practiceAreas: [], crmSummary: null, profile: null,
  loading: false
};

const $ = (s) => document.querySelector(s);
const elements = {
  queryForm: $("#queryForm"), queryInput: $("#queryInput"),
  chatMessages: $("#chatMessages"), confidenceBadge: $("#confidenceBadge"),
  confidenceMetric: $("#confidenceMetric"), statusMetric: $("#statusMetric"),
  citationMetric: $("#citationMetric"), intentBadge: $("#intentBadge"),
  topScoreBadge: $("#topScoreBadge"), validationList: $("#validationList"),
  relatedScroller: $("#relatedScroller"), citationsList: $("#citationsList"),
  traceList: $("#traceList"), sourceViewer: $("#sourceViewer"),
  productList: $("#productList"),
  workspaceList: $("#workspaceList"), workspaceCount: $("#workspaceCount"),
  saveAnswerButton: $("#saveAnswerButton"), exportMemoButton: $("#exportMemoButton"),
  healthStatus: $("#healthStatus"), docMetric: $("#docMetric"),
  chunkMetric: $("#chunkMetric"), courtMetric: $("#courtMetric"),
  actMetric: $("#actMetric"), ingestForm: $("#ingestForm"),
  docTitle: $("#docTitle"), docCitation: $("#docCitation"),
  docCourt: $("#docCourt"), docYear: $("#docYear"), docAct: $("#docAct"),
  docSection: $("#docSection"), docText: $("#docText"),
  partyPanel: $("#partyPanel"), partyComparison: $("#partyComparison"),
  profilePanel: $("#profilePanel"), profileInfo: $("#profileInfo"),
  profileAreas: $("#profileAreas"), crmPanel: $("#crmPanel"),
  crmContent: $("#crmContent"), suggestions: $("#suggestions"),
  chatLoading: $("#chatLoading")
};

function guid() { return crypto.randomUUID?.() || "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function getUserId() {
  let id = localStorage.getItem("ebc_user_id");
  if (!id) { id = guid(); localStorage.setItem("ebc_user_id", id); }
  return id;
}
state.userId = getUserId();
function getTier() { return localStorage.getItem("ebc_tier") || "free"; }

function escapeHtml(v) { return String(v || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

async function fetchJ(url, opts = {}) {
  const r = await fetch(url, { headers: { "content-type": "application/json", "x-user-id": state.userId, "x-user-tier": getTier() }, ...opts });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Request failed.");
  return d;
}

function track(event, payload = {}) {
  fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": state.userId },
    body: JSON.stringify({ event, payload, user_id: state.userId })
  }).catch(() => {});
}

function trackClick(event, extra = {}) {
  fetch("/api/track/click", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": state.userId },
    body: JSON.stringify({ event, ...extra })
  }).catch(() => {});
}

function setLoading(v) {
  state.loading = v;
  elements.chatLoading.style.display = v ? "flex" : "none";
  elements.queryInput.disabled = v;
  const btn = elements.queryForm.querySelector(".btn.primary");
  if (btn) btn.disabled = v;
  if (!v) elements.queryInput.focus();
}

function badgeClass(result) {
  if (!result || result.status !== "answered") return "status-badge refused";
  if (result.confidence_label === "high") return "status-badge high";
  if (result.confidence_label === "moderate") return "status-badge moderate";
  return "status-badge low";
}

function metadataChips(item) {
  return [item.court, item.year, item.bench, item.judge, item.act,
    item.section ? `Section ${item.section}` : "", item.document_type, item.topic]
    .filter(Boolean).map(v => `<span class="meta-chip">${escapeHtml(v)}</span>`).join("");
}

function tierBadge(tier) {
  const colors = { free: "muted", basic: "blue", premium: "high", enterprise: "moderate" };
  return `<span class="badge ${colors[tier] || "muted"}">${escapeHtml(tier)}</span>`;
}

function practiceBadge(area) {
  return `<span class="meta-chip blue">${escapeHtml(area.replace(/_/g, " "))}</span>`;
}

function scrollChatToBottom() { elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight; }

function addMessage({ role, html }) {
  const m = document.createElement("div");
  m.className = `msg ${role}`;
  m.innerHTML = `<div class="msg-bubble">${html}</div>`;
  elements.chatMessages.appendChild(m);
  scrollChatToBottom();
}

function updateSaveExportButtons(enabled) {
  elements.saveAnswerButton.disabled = !enabled;
  elements.exportMemoButton.disabled = !enabled;
}

function safeUrl(url) { const v = String(url || "#"); return v.startsWith("local://") ? "#" : v; }

function renderTrace(result) {
  const trace = result.retrieval_trace || {};
  const gates = trace.gates || [];
  elements.topScoreBadge.textContent = trace.top_score ?? "-";
  elements.traceList.innerHTML = gates.length
    ? gates.map(g => `<div class="trace-step ${g.passed ? "passed" : "failed"}"><span>${escapeHtml(g.name.replaceAll("_", " "))}</span><strong>${g.passed ? "Passed" : "Blocked"}</strong></div>`).join("")
      + `<div class="trace-step ${result.status === "answered" ? "passed" : "failed"}"><span>retrieved chunks</span><strong>${escapeHtml(trace.retrieved_chunks ?? 0)}</strong></div>`
    : `<div class="trace-step failed"><span>No retrieval trace</span><strong>Blocked</strong></div>`;
}

function answerMessageHtml(result) {
  let answer = escapeHtml(result.answer);
  const citations = result.citations || [];

  /* Turn raw URLs in answer into clickable links */
  answer = answer.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer" class="source-link answer-link">$1</a>');

  /* Turn [S1], [S2] etc. into clickable source refs */
  for (const c of citations) {
    const ref = `[${escapeHtml(c.source_id)}]`;
    const did = escapeHtml(c.document_id || '');
    const link = `<a href="#" class="citation-ref" data-document-id="${did}" data-source-id="${escapeHtml(c.source_id)}">[${escapeHtml(c.source_id)}]</a>`;
    answer = answer.replaceAll(ref, link);
  }

  /* Source pill bar – clickable badges that load the source */
  const sourceBar = citations.length
    ? `<div class="source-bar">${citations.map(c =>
        `<button class="source-pill" data-document-id="${escapeHtml(c.document_id || '')}" data-source-id="${escapeHtml(c.source_id)}" title="${escapeHtml(c.title)}">${escapeHtml(c.source_id)} ${escapeHtml(c.citation || c.title || '').slice(0, 50)}</button>`
      ).join('')}</div>`
    : '';

  const typeLabel = result.answer_type === "ai_summarized"
    ? `<span class="meta-chip" style="background:#e0f2fe;color:#0369a1">AI Summarised</span>`
    : `<span class="meta-chip" style="background:#f3f4f6;color:var(--muted)">Direct Extract</span>`;
  const w = (result.warnings || []).slice(0, 1).map(w => `<div class="warning-item">${escapeHtml(w)}</div>`).join("");
  const areas = (result.practice_areas || []).map(a => practiceBadge(a)).join("");
  return `<pre class="answer-text">${answer}</pre>
    ${sourceBar}
    <div class="message-meta">
      ${typeLabel}
      <span class="meta-chip blue">${escapeHtml(result.status)}</span>
      <span class="meta-chip">${escapeHtml(result.confidence || 0)}% confidence</span>
      <span class="meta-chip">${escapeHtml(result.citations?.length || 0)} citations</span>
      ${result.user_tier ? tierBadge(result.user_tier) : ''}
    </div>
    ${areas ? `<div class="message-meta">${areas}</div>` : ''}
    ${w}`;
}

function renderParties(result) {
  const parties = result.parties;
  if (!parties) { elements.partyPanel.style.display = "none"; return; }
  elements.partyPanel.style.display = "block";
  const docs = (result.related_documents || []).slice(0, 3);
  elements.partyComparison.innerHTML = `
    <div class="party-col petitioner"><h3>${escapeHtml(parties.petitioner)}</h3><span class="meta-chip">Petitioner</span>
      ${docs.map(d => `<div class="party-doc"><strong>${escapeHtml(d.title)}</strong><p class="snippet">${escapeHtml(d.court || "")} ${escapeHtml(d.year || "")}</p>
        ${d.source_pdf_url && !d.source_pdf_url.startsWith('local://') ? `<a class="source-link" href="${escapeHtml(d.source_pdf_url)}" target="_blank" rel="noreferrer">Open PDF</a>` : ''}</div>`).join("")}
    </div>
    <div class="party-col respondent"><h3>${escapeHtml(parties.respondent)}</h3><span class="meta-chip">Respondent</span>
      ${docs.map(d => `<div class="party-doc"><strong>${escapeHtml(d.title)}</strong><p class="snippet">${escapeHtml(d.court || "")} ${escapeHtml(d.year || "")}</p>
        ${d.source_pdf_url && !d.source_pdf_url.startsWith('local://') ? `<a class="source-link" href="${escapeHtml(d.source_pdf_url)}" target="_blank" rel="noreferrer">Open PDF</a>` : ''}</div>`).join("")}
    </div>`;
}

function renderProducts(products) {
  elements.productList.innerHTML = products.length
    ? products.map(p => `<article class="product-card">
      <div class="product-header"><strong>${escapeHtml(p.title)}</strong>${p.subscription_tier && p.subscription_tier !== "free" ? tierBadge(p.subscription_tier) : ""}</div>
      <div class="metadata-line"><span class="meta-chip blue">${escapeHtml(p.type)}</span><span class="meta-chip">${escapeHtml(p.match || "")}</span></div>
      <p class="snippet">${escapeHtml(p.source_title || "")}</p>
      <a class="source-link" href="${safeUrl(p.source_url)}${p.source_url && !p.source_url.startsWith('local://') ? `?utm_source=ebc_ai&utm_medium=product_rec&utm_campaign=${encodeURIComponent(p.type || 'legal')}` : ''}" target="_blank" rel="noreferrer" data-track-product="${escapeHtml(p.title)}" data-track-type="${escapeHtml(p.type)}">${escapeHtml(p.cta || "View on EBC Webstore")}</a>
    </article>`).join("")
    : `<article class="product-card"><strong>No product match</strong><p class="snippet">Product recommendations appear when retrieved sources carry EBC commerce metadata. Upgrade your subscription for enhanced cross-sell coverage.</p></article>`;
}

async function loadSource(documentId) {
  if (!documentId) return;
  elements.sourceViewer.innerHTML = `<div class="empty-state"><div class="spinner" style="margin:0 auto 8px"></div><p class="muted">Loading source details…</p></div>`;
  const source = await fetchJ(`/api/source?document_id=${encodeURIComponent(documentId)}&user_id=${state.userId}`);
  state.activeSource = source;
  trackClick("source_view", { document_id: documentId });
  renderSource(source);
}

function renderSource(source) {
  const chunks = (source.chunks || []).map(c => `<p><mark>Para ${escapeHtml(c.paragraph || "-")} / Page ${escapeHtml(c.pdf_page || "-")}</mark> ${escapeHtml(c.text)}</p>`).join("");
  const treatments = (source.treatment_summary || []).map(i => `<li>${escapeHtml(i)}</li>`).join("");
  const tier = source.subscription_tier && source.subscription_tier !== "free" ? tierBadge(source.subscription_tier) : "";
  elements.sourceViewer.innerHTML = `<h3>${escapeHtml(source.title)} ${tier}</h3>
    <div class="metadata-line">${metadataChips(source)}</div>
    <p class="snippet"><strong>${escapeHtml(source.authority_status)}</strong></p>
    <ul class="authority-treatment">${treatments}</ul>
    <div class="source-actions">
      <a class="link-button" href="${safeUrl(source.ebc_reader_url || source.source_url)}" target="_blank" rel="noreferrer">Open EBC Reader</a>
      ${source.source_pdf_url && !source.source_pdf_url.startsWith('local://') ? `<a class="link-button" href="${escapeHtml(source.source_pdf_url)}" target="_blank" rel="noreferrer">Open PDF</a>` : ''}
      <a class="link-button" href="${safeUrl(source.webstore_url)}" target="_blank" rel="noreferrer">View on Webstore</a>
      <button type="button" class="link-button" data-action="save-active-source">Save to workspace</button>
    </div>
    <div class="source-viewer-text">${chunks}</div>`;
}

function saveWorkspaceItem(item) {
  if (!item?.id || state.workspace.some(s => s.id === item.id)) return;
  state.workspace.push(item);
  renderWorkspace();
}

function renderWorkspace() {
  elements.workspaceCount.textContent = `${state.workspace.length} saved`;
  elements.workspaceList.innerHTML = state.workspace.length
    ? state.workspace.map(i => `<article class="workspace-card"><strong>${escapeHtml(i.title)}</strong><p class="snippet">${escapeHtml(i.detail || "")}</p></article>`).join("")
    : `<article class="workspace-card"><strong>No saved research yet</strong><p class="snippet">Run a query, then save answers or sources to build a research memo.</p></article>`;
}

function exportMemo() {
  const r = state.lastResult;
  const lines = ["EBC Legal AI Assistant — Research Memo", "", `Query: ${state.lastQuery || "Initial demo query"}`, `Status: ${r?.status || "not run"}`, `Confidence: ${r?.confidence || 0}%`, "", "Answer:", r?.answer || "", "", "Saved Research:", ...state.workspace.map((i, idx) => `${idx + 1}. ${i.title} - ${i.detail || ""}`), "", "Citations:", ...(r?.citations || []).map(c => `${c.source_id}: ${c.title} (${c.citation}) para ${c.paragraph || "-"} page ${c.pdf_page || "-"}`)];
  const b = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "ebc-research-memo.txt"; a.click();
  URL.revokeObjectURL(b);
  trackClick("memo_export", { citation_count: r?.citations?.length || 0 });
}

function renderResult(result, query) {
  state.lastResult = result;
  if (query) state.lastQuery = query;
  elements.statusMetric.textContent = result.status;
  elements.confidenceMetric.textContent = result.status === "answered" ? `${result.confidence}%` : "0%";
  elements.citationMetric.textContent = `${result.citations.length}`;
  elements.intentBadge.textContent = result.query_intent || "legal_research";
  elements.confidenceBadge.className = badgeClass(result);
  elements.confidenceBadge.textContent = result.status === "answered" ? `${result.confidence_label} confidence` : "Refused";
  renderParties(result);
  if (query) addMessage({ role: "user", html: `<pre>${escapeHtml(query)}</pre>` });
  addMessage({ role: "bot", html: answerMessageHtml(result) });
  renderTrace(result);
  elements.validationList.innerHTML = result.citation_validation.checked.length
    ? result.citation_validation.checked.map(i => `<div class="validation-item ${i.valid ? "valid" : "invalid"}"><strong>${escapeHtml(i.source_id)}</strong><div>${i.valid ? "Citation metadata verified" : `Missing: ${escapeHtml(i.missing.join(", "))}`}</div></div>`).join("")
    : `<div class="validation-item invalid">No citation set passed validation.</div>`;
  elements.relatedScroller.innerHTML = result.related_documents.length
    ? result.related_documents.map(item => `<article class="authority-card" data-document-id="${escapeHtml(item.document_id)}">
      <h3>${escapeHtml(item.title)}</h3><div class="metadata-line">${metadataChips(item)}</div>
      <p class="snippet">${escapeHtml(item.match_explanation || "")}</p>
      <p class="snippet"><strong>${escapeHtml(item.authority_status || "")}</strong></p>
      <div class="card-actions" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
        <button type="button" class="link-button" data-action="view-source" data-document-id="${escapeHtml(item.document_id)}">View source</button>
        <button type="button" class="link-button" data-action="save-source" data-document-id="${escapeHtml(item.document_id)}">Save</button>
        <a class="source-link" href="${safeUrl(item.ebc_reader_url || item.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.citation || "source")}</a>
        ${item.source_pdf_url && !item.source_pdf_url.startsWith('local://') ? `<a class="source-link" href="${escapeHtml(item.source_pdf_url)}" target="_blank" rel="noreferrer">PDF</a>` : ''}
      </div>
    </article>`).join("")
    : `<article class="authority-card"><h3>No related authority</h3><p class="snippet">The indexed corpus did not produce a safe match. Try a different query or add more sources.</p></article>`;
  elements.citationsList.innerHTML = result.citations.length
    ? result.citations.map(c => `<article class="citation-card"><h3>${escapeHtml(c.source_id)} ${escapeHtml(c.title)}</h3><div class="metadata-line">${metadataChips(c)}</div><p class="snippet">${escapeHtml(c.snippet)}</p></article>`).join("")
    : `<article class="citation-card"><h3>No citations released</h3><p class="snippet">The answer was blocked because evidence was insufficient. The system refuses to generate unsupported legal statements.</p></article>`;
  renderProducts(result.product_recommendations || []);
  if (result.practice_areas?.length) state.practiceAreas = result.practice_areas;
  updateSaveExportButtons(true);
  if (result.related_documents[0]) loadSource(result.related_documents[0].document_id).catch(() => {});
}

async function submitQuery(showUserMessage = true) {
  const query = elements.queryInput.value.trim();
  if (!query || state.loading) return;
  state.lastQuery = query;
  elements.confidenceBadge.className = "status-badge muted";
  elements.confidenceBadge.textContent = "Retrieving";
  setLoading(true);
  try {
    const result = await fetchJ("/api/chat", {
      method: "POST",
      body: JSON.stringify({ query, filters: {}, role: "lawyer", tier: getTier() })
    });
    track("query_submitted", { query, intent: result.query_intent, status: result.status, result_count: result.related_documents?.length || 0 });
    if (result.product_recommendations?.length) track("product_recommended", { count: result.product_recommendations.length });
    renderResult(result, showUserMessage ? query : "");
  } finally {
    setLoading(false);
  }
}

function renderSummary(summary) {
  elements.docMetric.textContent = summary.indexed_documents;
  elements.chunkMetric.textContent = summary.indexed_chunks;
  elements.courtMetric.textContent = summary.courts.length;
  elements.actMetric.textContent = summary.acts.length;
}

async function loadCorpus() {
  try {
    const c = await fetchJ("/api/corpus");
    renderSummary(c.summary);
  } catch {}
}

async function loadHealth() {
  try {
    const h = await fetchJ("/api/health");
    state.health = h;
    elements.healthStatus.textContent = `${h.corpus_documents} docs / ${h.corpus_chunks} chunks`;
    renderSummary(h.summary);
  } catch {}
}

async function loadProfile() {
  try {
    const p = await fetchJ(`/api/profile?user_id=${state.userId}`);
    state.profile = p;
    if (p.topPracticeAreas?.length) {
      elements.profilePanel.style.display = "block";
      elements.profileInfo.innerHTML = `<span class="meta-chip">${escapeHtml(p.role || "anonymous")}</span> ${tierBadge(p.tier || "free")} <span class="meta-chip">${escapeHtml(p.userId.slice(0, 8))}...</span>`;
      elements.profileAreas.innerHTML = p.topPracticeAreas.map(a => `<span class="meta-chip blue">${escapeHtml(a.area)} (${a.count})</span>`).join("");
    }
  } catch {}
}

async function loadCrm() {
  try {
    const c = await fetchJ("/api/crm");
    state.crmSummary = c.summary;
    elements.crmPanel.style.display = "block";
    const s = c.summary;
    elements.crmContent.innerHTML = `
      <div class="crm-metrics">
        <div class="crm-metric"><dt>Active Users</dt><dd>${s.active_users}</dd></div>
        <div class="crm-metric"><dt>Queries</dt><dd>${s.total_queries}</dd></div>
        <div class="crm-metric"><dt>Product Clicks</dt><dd>${s.product_clicks}</dd></div>
        <div class="crm-metric"><dt>Memos</dt><dd>${s.memos_exported}</dd></div>
        <div class="crm-metric"><dt>Unanswered</dt><dd>${s.unanswered_queries}</dd></div>
        <div class="crm-metric"><dt>Leads</dt><dd>${s.leads_pipeline}</dd></div>
      </div>
      ${s.top_areas?.length ? `<h4 style="font-size:11px;margin:8px 0 4px;color:var(--muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:700">Practice Area Demand</h4><div class="area-bars">${s.top_areas.map(a => `<div class="area-bar"><span>${escapeHtml(a.area.replace(/_/g, " "))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(a.searches / Math.max(s.top_areas[0]?.searches, 1) * 100, 100)}%"></div></div><strong>${a.searches}</strong></div>`).join("")}</div>` : ''}
      ${s.leads_pipeline ? `<h4 style="font-size:11px;margin:8px 0 4px;color:var(--muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:700">Recent Leads</h4>${c.leads?.slice(0, 5).map(l => `<div class="lead-item"><strong>${escapeHtml(l.query?.slice(0, 60))}</strong><span class="meta-chip">${escapeHtml(l.reason)}</span><span class="snippet">${escapeHtml(l.intent)}</span></div>`).join("") || ''}` : ''}`;
  } catch {}
}

/* Suggestions */
elements.suggestions.addEventListener("click", async (e) => {
  const btn = e.target.closest(".suggestion");
  if (!btn || state.loading) return;
  elements.queryInput.value = btn.dataset.query || "";
  await submitQuery(true);
});

/* Product click tracking */
elements.productList.addEventListener("click", (e) => {
  const link = e.target.closest("[data-track-product]");
  if (link) trackClick("product_click", { product: link.dataset.trackProduct, type: link.dataset.trackType });
});

/* Query form */
elements.queryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (state.loading) return;
  try { await submitQuery(true); }
  catch (error) {
    addMessage({ role: "bot", html: `<strong>Request failed.</strong><p>${escapeHtml(error.message)}</p>` });
    elements.confidenceBadge.className = "status-badge refused";
    elements.confidenceBadge.textContent = "Error";
    setLoading(false);
  }
});

/* Clickable source refs inside chat messages */
elements.chatMessages.addEventListener("click", async (e) => {
  const ref = e.target.closest("[data-document-id]");
  if (ref) { e.preventDefault(); await loadSource(ref.dataset.documentId); }
});

/* Related authorities */
elements.relatedScroller.addEventListener("click", async (e) => {
  if (state.loading) return;
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const id = t.dataset.documentId;
  if (t.dataset.action === "view-source") await loadSource(id);
  if (t.dataset.action === "save-source") {
    const s = state.lastResult?.related_documents?.find(i => i.document_id === id);
    saveWorkspaceItem({ id: `source:${id}`, title: s?.title || "Saved source", detail: s?.citation || s?.match_explanation || "" });
  }
});

/* Source viewer save */
elements.sourceViewer.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action='save-active-source']");
  if (!t || !state.activeSource) return;
  saveWorkspaceItem({ id: `source:${state.activeSource.document_id}`, title: state.activeSource.title, detail: state.activeSource.citation || state.activeSource.authority_status });
});

elements.saveAnswerButton.addEventListener("click", () => {
  if (!state.lastResult) return;
  saveWorkspaceItem({ id: `answer:${state.lastQuery}:${state.lastResult.status}`, title: state.lastQuery || "Demo answer", detail: `${state.lastResult.status} - ${state.lastResult.confidence || 0}% confidence` });
});

elements.exportMemoButton.addEventListener("click", () => {
  if (!state.lastResult) return;
  exportMemo();
});

/* Ingest */
elements.ingestForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await fetchJ("/api/documents", {
      method: "POST",
      body: JSON.stringify({ title: elements.docTitle.value, text: elements.docText.value, metadata: { citation: elements.docCitation.value, court: elements.docCourt.value, year: elements.docYear.value ? Number(elements.docYear.value) : undefined, act: elements.docAct.value, section: elements.docSection.value, document_type: elements.docCourt.value ? "judgment" : "commentary" } })
    });
    elements.ingestForm.reset();
    await loadCorpus(); await loadHealth();
  } catch {}
});

/* Init */
await loadCorpus();
await loadHealth();
await loadProfile();
await loadCrm();
renderWorkspace();
updateSaveExportButtons(false);
