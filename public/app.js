const state = {
  health: null, lastResult: null, lastQuery: "",
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

function trustMeter(confidence, breakdown) {
  if (confidence == null || confidence === 0) return '';
  const b = breakdown || {};
  const groundedness = b.groundedness != null ? b.groundedness : null;
  return `<div class="trust-meter">
    <div class="trust-meter-header"><span>Trust Score</span><strong>${confidence}%</strong></div>
    <div class="trust-meter-bar">
      <div class="trust-fill" style="width:${confidence}%"></div>
    </div>
    <div class="conf-breakdown">
      <div class="conf-row"><span class="conf-label">Relevance</span><div class="conf-track"><div class="conf-fill" style="width:${b.topScore || 0}%"></div></div><span class="conf-value">${b.topScore || 0}%</span></div>
      <div class="conf-row"><span class="conf-label">Completeness</span><div class="conf-track"><div class="conf-fill" style="width:${b.citationCompleteness || 0}%"></div></div><span class="conf-value">${b.citationCompleteness || 0}%</span></div>
      <div class="conf-row"><span class="conf-label">Corroboration</span><div class="conf-track"><div class="conf-fill" style="width:${b.corroboration || 0}%"></div></div><span class="conf-value">${b.corroboration || 0}%</span></div>
      <div class="conf-row"><span class="conf-label">Coverage</span><div class="conf-track"><div class="conf-fill" style="width:${b.sourceCoverage || 0}%"></div></div><span class="conf-value">${b.sourceCoverage || 0}%</span></div>
      ${groundedness != null ? `<div class="conf-row"><span class="conf-label">Groundedness</span><div class="conf-track"><div class="conf-fill" style="width:${groundedness}%"></div></div><span class="conf-value">${groundedness}%</span></div>` : ''}
    </div>
  </div>`;
}

function citationFidelityMeter(fidelity) {
  if (!fidelity || !fidelity.total) return '';
  const pct = fidelity.fidelity || 0;
  const cls = pct >= 90 ? 'green' : pct >= 70 ? 'amber' : 'red';
  return `<div class="fidelity-meter fidelity-${cls}">
    <span class="fidelity-dot"></span>
    <span>${fidelity.withMarkers}/${fidelity.total} sentences sourced — <strong>${pct}% citation fidelity</strong></span>
  </div>`;
}

function evidenceGapList(gaps) {
  if (!gaps || !gaps.length) return '';
  return `<div class="evidence-gaps">${gaps.map(g => `<div class="evidence-gap-item">${escapeHtml(g)}</div>`).join('')}</div>`;
}

function answerMessageHtml(result) {
  let answer = escapeHtml(result.answer);
  const citations = result.citations || [];
  const isRefused = result.status !== "answered";

  if (isRefused) {
    const reason = escapeHtml(result.failure_reason_human || result.reason || '');
    const gaps = result.evidence_gaps || [];
    return `<div class="refusal-banner">
      <strong>Answer Blocked</strong>
      <p>${reason}</p>
      ${gaps.length ? `<ul class="refusal-gaps">${gaps.map(g => `<li>${escapeHtml(g)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="message-meta">
      <span class="meta-chip refused">Insufficient Evidence</span>
      <span class="meta-chip">${result.citations?.length || 0} citations</span>
      ${result.user_tier ? tierBadge(result.user_tier) : ''}
    </div>`;
  }

  /* Highlight quoted text (within double quotes in original answer) */
  answer = answer.replace(/"([^"]+)"/g, '<mark class="quote-highlight">"$1"</mark>');

  /* Turn raw URLs in answer into clickable links */
  answer = answer.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer" class="source-link answer-link">$1</a>');

  /* Turn [S1], [S2] etc. into clickable source refs with paragraph data */
  for (const c of citations) {
    const ref = `[${escapeHtml(c.source_id)}]`;
    const did = escapeHtml(c.document_id || '');
    const para = escapeHtml(c.paragraph || c.pdf_page || '');
    const loc = c.paragraph ? `para ${escapeHtml(c.paragraph)}` : c.pdf_page ? `page ${escapeHtml(c.pdf_page)}` : '';
    const link = `<a href="#source-${did}${para ? '@' + encodeURIComponent(para) : ''}" class="citation-ref" data-document-id="${did}" data-source-id="${escapeHtml(c.source_id)}" data-paragraph="${para}" title="View ${escapeHtml(c.title)} — ${loc}">[${escapeHtml(c.source_id)}]</a>`;
    answer = answer.replaceAll(ref, link);
  }

  /* Source pill bar – clickable badges that load the source with paragraph */
  const sourceBar = citations.length
    ? `<div class="source-bar">${citations.map(c => {
        const did = escapeHtml(c.document_id || '');
        const para = escapeHtml(c.paragraph || c.pdf_page || '');
        return `<a href="#source-${did}${para ? '@' + encodeURIComponent(para) : ''}" class="source-pill" data-document-id="${did}" data-source-id="${escapeHtml(c.source_id)}" data-paragraph="${para}" title="${escapeHtml(c.title)}">${escapeHtml(c.source_id)} ${escapeHtml(c.citation || c.title || '').slice(0, 50)}</a>`;
      }).join('')}</div>`
    : '';

  /* Collapsible evidence section with paragraph locators and verification badge */
  const evidenceHtml = citations.length
    ? `<details class="evidence-details" ${citations.length > 2 ? '' : 'open'}>
        <summary>View ${citations.length} verified source${citations.length > 1 ? 's' : ''}</summary>
        <div class="evidence-list">${citations.map(c => {
          const did = escapeHtml(c.document_id || '');
          const para = escapeHtml(c.paragraph || c.pdf_page || '');
          const loc = (c.locator || '') || (c.paragraph ? `para ${c.paragraph}` : c.pdf_page ? `page ${c.pdf_page}` : '');
          const deeplink = c.pdf_deeplink && !c.pdf_deeplink.startsWith('local://')
            ? ` <a class="source-link" href="${escapeHtml(c.pdf_deeplink)}" target="_blank" rel="noreferrer" title="Open at exact page">Open at page</a>`
            : '';
          return `<div class="evidence-item"><strong>${escapeHtml(c.source_id)}</strong> ${escapeHtml(c.title)}${loc ? ` <span class="evidence-loc">${escapeHtml(loc)}</span>` : ''}${deeplink}<br><span class="snippet">${escapeHtml(c.snippet?.slice(0, 200))}…</span>
            <a href="#source-${did}${para ? '@' + encodeURIComponent(para) : ''}" class="link-button" style="margin-top:4px;font-size:10px" data-document-id="${did}" data-paragraph="${para}">View in Source Viewer</a></div>`;
        }).join('')}</div>
       </details>`
    : '';

  /* Unverified sources — hidden behind toggle by default */
  const unverifiedCiteBlock = result.unverified_citations?.length
    ? `<details class="evidence-details unverified-evidence">
        <summary>Show ${result.unverified_citations.length} unverified source${result.unverified_citations.length > 1 ? 's' : ''} (metadata missing or demo)</summary>
        <div class="evidence-list">${result.unverified_citations.map(c => {
          const missing = (c.missing || []).map(m => m.replace(/_/g, ' ')).join(', ');
          return `<div class="evidence-item unverified"><strong>${escapeHtml(c.source_id)}</strong> <span class="ver-badge unverified">Unverified</span> ${escapeHtml(c.title)}<br><span class="snippet">Missing: ${escapeHtml(missing || 'metadata')}</span><br><span class="snippet">${escapeHtml(c.snippet?.slice(0, 150))}…</span></div>`;
        }).join('')}</div>
       </details>`
    : '';

  const fidelityHtml = citationFidelityMeter(result.citation_fidelity);
  const trustHtml = trustMeter(result.confidence, result.confidence_breakdown);
  const unsupportedWarn = result.unsupported_sentences?.length
    ? `<div class="warning-item">${result.unsupported_sentences.length} sentence(s) lack direct source markers. Verify before relying.</div>`
    : '';
  const gapHtml = evidenceGapList(result.evidence_gaps);

  const isAdviceLabel = result.is_advice_query
    ? `<span class="meta-chip" style="background:#fef3c7;color:#92400e">Advice query — research only</span>`
    : '';

  const typeLabel = result.answer_type === "ai_summarized"
    ? `<span class="meta-chip" style="background:#e0f2fe;color:#0369a1">AI Summarised</span>`
    : `<span class="meta-chip" style="background:#f3f4f6;color:var(--muted)">Direct Extract</span>`;
  const w = (result.warnings || []).slice(0, 3).map(w => `<div class="warning-item">${escapeHtml(w)}</div>`).join("");
  const unverifiedBanner = result.unverified_citations_hidden && result.unverified_citations?.length
    ? `<div class="warning-item warning-amber">${result.unverified_citations.length} unverified citation(s) hidden by default. Expand "Show unverified sources" below to review.</div>`
    : '';
  const areas = (result.practice_areas || []).map(a => practiceBadge(a)).join("");
  return `${trustHtml}
    ${fidelityHtml}
    ${gapHtml}
    ${unverifiedBanner}
    <pre class="answer-text">${answer}</pre>
    ${sourceBar}
    ${evidenceHtml}
    ${unverifiedCiteBlock}
    ${unsupportedWarn}
    <div class="message-meta">
      ${typeLabel}
      ${isAdviceLabel}
      <span class="meta-chip blue">${escapeHtml(result.status)}</span>
      <span class="meta-chip">${escapeHtml(result.confidence || 0)}% confidence</span>
      <span class="meta-chip">${escapeHtml(result.citations?.length || 0)} verified citations</span>
      ${result.unverified_citations?.length ? `<span class="meta-chip" style="background:#fef2f2;color:var(--danger)">${result.unverified_citations.length} unverified</span>` : ''}
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

/* Single source of truth for Source Viewer session */
const sourceSession = {
  documentId: null,
  highlightPara: "",
  source: null,

  set(docId, para) {
    this.documentId = docId;
    this.highlightPara = para || "";
    try { sessionStorage.setItem("ebc_active_source", JSON.stringify({ documentId: docId, highlightPara: this.highlightPara })); } catch {}
    const hashPara = this.highlightPara ? `@${encodeURIComponent(this.highlightPara)}` : "";
    const newHash = `#source-${encodeURIComponent(docId)}${hashPara}`;
    if (location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }
  },

  restore() {
    const match = location.hash.match(/^#source-(.+?)(?:@(.+))?$/);
    if (match) {
      this.documentId = decodeURIComponent(match[1]);
      this.highlightPara = decodeURIComponent(match[2] || "");
      return true;
    }
    try {
      const raw = sessionStorage.getItem("ebc_active_source");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.documentId) {
          this.documentId = saved.documentId;
          this.highlightPara = saved.highlightPara || "";
          return true;
        }
      }
    } catch {}
    return false;
  },

  clear() {
    this.documentId = null;
    this.highlightPara = "";
    this.source = null;
    try { sessionStorage.removeItem("ebc_active_source"); } catch {}
  }
};

const sourceCache = new Map();
const sourceInflight = new Map(); /* prevent duplicate in-flight loads */

async function loadSource(documentId, highlightPara) {
  if (!documentId) return;

  sourceSession.set(documentId, highlightPara);

  /* Serve from cache if fresh */
  if (sourceCache.has(documentId)) {
    sourceSession.source = sourceCache.get(documentId);
    renderSource(sourceSession.source, highlightPara);
    return;
  }

  /* Prevent duplicate in-flight requests for the same documentId */
  if (sourceInflight.has(documentId)) {
    return sourceInflight.get(documentId);
  }

  const timeoutMs = 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  elements.sourceViewer.innerHTML = `<div class="empty-state"><div class="spinner" style="margin:0 auto 8px"></div><p class="muted">Loading source details…</p></div>`;

  const promise = (async () => {
    try {
      const source = await fetchJ(`/api/source?document_id=${encodeURIComponent(documentId)}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      sourceCache.set(documentId, source);
      sourceSession.source = source;
      trackClick("source_view", { document_id: documentId });
      renderSource(source, highlightPara);
      return source;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") return null;
      elements.sourceViewer.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p class="muted">Could not load source details.</p><p class="snippet">${escapeHtml(err.message || "Unknown error")}</p><button type="button" class="link-button" data-action="retry-source" data-document-id="${escapeHtml(documentId)}">Retry</button></div>`;
      return null;
    } finally {
      sourceInflight.delete(documentId);
    }
  })();

  sourceInflight.set(documentId, promise);
  return promise;
}

function renderSource(source, highlightPara) {
  const chunks = (source.chunks || []).map(c => {
    const isHighlighted = highlightPara && (c.paragraph === highlightPara || c.paragraph === String(highlightPara));
    const pdfLink = c.pdf_page && source.source_pdf_url && !source.source_pdf_url.startsWith("local://")
      ? ` <a class="source-link" href="${escapeHtml(source.source_pdf_url)}#page=${escapeHtml(c.pdf_page)}" target="_blank" rel="noreferrer" title="Open PDF at page ${escapeHtml(c.pdf_page)}">📄 Page ${escapeHtml(c.pdf_page)}</a>`
      : '';
    return `<p class="chunk-text ${isHighlighted ? 'source-highlighted' : ''}" data-paragraph="${escapeHtml(c.paragraph || '')}"><mark>Para ${escapeHtml(c.paragraph || "-")}${c.pdf_page ? ` | Page ${escapeHtml(c.pdf_page)}` : ''}</mark> ${escapeHtml(c.text)}${pdfLink}</p>`;
  }).join("");
  const treatments = (source.treatment_summary || []).map(i => `<li>${escapeHtml(i)}</li>`).join("");
  const tier = source.subscription_tier && source.subscription_tier !== "free" ? tierBadge(source.subscription_tier) : "";
  const pdfDeepLink = source.source_pdf_url && !source.source_pdf_url.startsWith("local://") ? source.source_pdf_url : null;
  const readerLink = source.ebc_reader_url && !source.ebc_reader_url.startsWith("local://") ? source.ebc_reader_url : null;
  const anchorId = `source-${escapeHtml(source.document_id || '')}`;

  elements.sourceViewer.innerHTML = `<div id="${anchorId}"><h3>${escapeHtml(source.title)} ${tier}</h3>
    <div class="metadata-line">${metadataChips(source)}</div>
    <p class="snippet"><strong>${escapeHtml(source.authority_status)}</strong></p>
    <ul class="authority-treatment">${treatments}</ul>
    <div class="source-actions">
      ${readerLink ? `<a class="link-button" href="${escapeHtml(readerLink)}" target="_blank" rel="noreferrer">Open in EBC Reader</a>` : ''}
      ${pdfDeepLink ? `<a class="link-button" href="${escapeHtml(pdfDeepLink)}#page=1" target="_blank" rel="noreferrer">Open PDF</a>` : ''}
      ${source.webstore_url && !source.webstore_url.startsWith("local://") ? `<a class="link-button" href="${escapeHtml(source.webstore_url)}" target="_blank" rel="noreferrer">View on Webstore</a>` : ''}
      <button type="button" class="link-button" data-action="save-active-source">Save to workspace</button>
    </div>
    <div class="source-viewer-text" id="${anchorId}-text">${chunks || '<p class="muted">No chunk text available.</p>'}</div></div>`;

  if (highlightPara) {
    const el = elements.sourceViewer.querySelector('.source-highlighted');
    if (el) {
      /* Ensure the source viewer card itself is visible on mobile */
      const viewerCard = elements.sourceViewer.closest('.card');
      if (viewerCard) viewerCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      /* Then scroll to the highlighted paragraph inside the viewer */
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      /* Flash highlight animation */
      el.classList.add('highlight-flash');
      setTimeout(() => el.classList.remove('highlight-flash'), 2000);
    }
  }
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

function renderPrecedentTable(citations) {
  if (!citations || citations.length < 2) return '';
  return `<div class="precedent-table-wrapper">
    <table class="precedent-table">
      <thead><tr><th>Source</th><th>Court</th><th>Year</th><th>Section</th><th>Relevance</th></tr></thead>
      <tbody>${citations.map(c => `<tr><td><strong>${escapeHtml(c.source_id)}</strong> ${escapeHtml(c.title?.slice(0, 40))}</td><td>${escapeHtml(c.court || '-')}</td><td>${escapeHtml(c.year || '-')}</td><td>${escapeHtml(c.section || '-')}</td><td class="snippet">${escapeHtml(c.snippet?.slice(0, 60))}…</td></tr>`).join('')}</tbody>
    </table>
  </div>`;
}

function exportMemo() {
  const r = state.lastResult;
  const lines = [];
  lines.push("====================================================================");
  lines.push("EBC LEGAL AI ASSISTANT — RESEARCH MEMO");
  lines.push("====================================================================");
  lines.push("");
  lines.push("QUERY");
  lines.push("--------------------------------------------------------------------");
  lines.push(state.lastQuery || "Initial demo query");
  lines.push("");
  lines.push("STATUS & CONFIDENCE");
  lines.push("--------------------------------------------------------------------");
  lines.push(`Status: ${r?.status || "not run"}`);
  lines.push(`Confidence: ${r?.confidence || 0}%`);
  lines.push(`Label: ${r?.confidence_label || "N/A"}`);
  lines.push(`Intent: ${r?.query_intent || "N/A"}`);
  if (r?.issues?.length) lines.push(`Issues: ${r.issues.join(", ")}`);
  if (r?.citation_fidelity) lines.push(`Citation Fidelity: ${r.citation_fidelity.withMarkers}/${r.citation_fidelity.total} sentences sourced`);
  lines.push("");
  lines.push("ANSWER");
  lines.push("--------------------------------------------------------------------");
  lines.push(r?.answer || "");
  lines.push("");
  if (r?.citations?.length) {
    lines.push("CITED SOURCES");
    lines.push("--------------------------------------------------------------------");
    for (const c of r.citations) {
      const loc = [c.paragraph ? `para ${c.paragraph}` : '', c.pdf_page ? `page ${c.pdf_page}` : '', c.section ? `Section ${c.section}` : ''].filter(Boolean).join(', ');
      lines.push(`  [${c.source_id}] ${c.title}`);
      if (c.citation) lines.push(`       Citation: ${c.citation}`);
      if (c.court) lines.push(`       Court: ${c.court}`);
      if (c.year) lines.push(`       Year: ${c.year}`);
      if (loc) lines.push(`       Location: ${loc}`);
      if (c.snippet) lines.push(`       Excerpt: ${c.snippet.slice(0, 300)}`);
      lines.push("");
    }
  }
  lines.push("SAVED RESEARCH ITEMS");
  lines.push("--------------------------------------------------------------------");
  if (state.workspace.length) {
    state.workspace.forEach((i, idx) => lines.push(`  ${idx + 1}. ${i.title} - ${i.detail || ""}`));
  } else {
    lines.push("  (none)");
  }
  lines.push("");
  lines.push("DISCLAIMER");
  lines.push("--------------------------------------------------------------------");
  lines.push("This memo was generated by the EBC Legal AI Assistant. It is based on the indexed corpus and is not a substitute for professional legal advice. Always verify citations against the original sources and consult a licensed attorney.");
  const b = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "ebc-research-memo.txt"; a.click();
  URL.revokeObjectURL(b);
  trackClick("memo_export", { citation_count: r?.citations?.length || 0 });
}

function renderIssues(result) {
  const issues = result.issues || [];
  const issuesPanel = document.getElementById("issuesPanel");
  const issuesContent = document.getElementById("issuesContent");
  if (!issuesPanel || !issuesContent) return;

  const verdict = result.citation_verification || [];
  const verifiedCount = verdict.filter(v => v.verified).length;
  const totalCount = verdict.length;
  const verSummary = totalCount ? `${verifiedCount}/${totalCount} citations verified` : '';

  if (!issues.length && !result.evidence_gaps?.length && !verSummary) {
    issuesPanel.style.display = "none";
    return;
  }
  issuesPanel.style.display = "block";
  const items = issues.map(i => `<span class="meta-chip blue">${escapeHtml(i)}</span>`).join('');
  const gaps = (result.evidence_gaps || []).map(g => `<div class="evidence-gap-item">${escapeHtml(g)}</div>`).join('');
  issuesContent.innerHTML = `
    ${items ? `<div class="chip-row">${items}</div>` : ''}
    ${verSummary ? `<div class="ver-summary">${escapeHtml(verSummary)}</div>` : ''}
    ${gaps ? `<div class="evidence-gaps" style="margin-top:6px">${gaps}</div>` : ''}
    <div class="quick-actions">
      <button class="link-button" data-action="copy-citations">Copy citations</button>
      <button class="link-button" data-action="compare-precedents">Compare precedents</button>
    </div>`;
}

function renderResult(result, query) {
  state.lastResult = result;
  if (query) state.lastQuery = query;
  elements.statusMetric.textContent = result.status;
  elements.confidenceMetric.textContent = result.status === "answered" ? `${result.confidence}%` : "0%";
  const unvCount = result.unverified_citations?.length || 0;
  elements.citationMetric.textContent = unvCount ? `${result.citations.length}+${unvCount}` : `${result.citations.length}`;
  elements.intentBadge.textContent = result.query_intent || "legal_research";
  elements.confidenceBadge.className = badgeClass(result);
  elements.confidenceBadge.textContent = result.status === "answered" ? `${result.confidence_label} confidence` : "Refused";
  renderParties(result);
  if (query) addMessage({ role: "user", html: `<pre>${escapeHtml(query)}</pre>` });
  addMessage({ role: "bot", html: answerMessageHtml(result) });
  renderTrace(result);
  renderIssues(result);
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
  const allCitations = [...(result.citations || []), ...(result.unverified_citations || []).map(c => ({ ...c, _unverified: true }))];
  elements.citationsList.innerHTML = allCitations.length
    ? allCitations.map(c => {
        const loc = (c.locator || '') || (c.paragraph ? `para ${c.paragraph}` : c.pdf_page ? `page ${c.pdf_page}` : '');
        const verBadge = c._unverified
          ? `<span class="ver-badge unverified">Unverified</span>`
          : `<span class="ver-badge verified">Verified</span>`;
        const deeplink = c.pdf_deeplink && !c.pdf_deeplink.startsWith('local://')
          ? ` <a class="source-link" href="${escapeHtml(c.pdf_deeplink)}" target="_blank" rel="noreferrer">Open at page</a>`
          : '';
        const extraMeta = c._unverified ? `<span class="meta-chip" style="background:#fef2f2;color:var(--danger)">HIDDEN FROM ANSWER</span>` : '';
        return `<article class="citation-card ${c._unverified ? 'citation-unverified' : ''}"><h3>${escapeHtml(c.source_id)} ${escapeHtml(c.title)} ${verBadge}</h3><div class="metadata-line">${metadataChips(c)}${loc ? `<span class="meta-chip">${escapeHtml(loc)}</span>` : ''}${extraMeta}</div><p class="snippet">${escapeHtml(c.snippet)}</p>${deeplink}</article>`;
      }).join("")
    : `<article class="citation-card"><h3>No citations released</h3><p class="snippet">The answer was blocked because evidence was insufficient. The system refuses to generate unsupported legal statements.</p></article>`;
  renderProducts(result.product_recommendations || []);
  if (result.practice_areas?.length) state.practiceAreas = result.practice_areas;
  updateSaveExportButtons(true);
  /* Auto-load first related doc only if no source is currently active */
  if (result.related_documents[0] && !sourceSession.source && !sourceInflight.size) {
    loadSource(result.related_documents[0].document_id).catch(() => {});
  }
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

/* Keyboard shortcuts */
elements.queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    elements.queryForm.dispatchEvent(new Event("submit"));
  }
  if (e.key === "Escape" && !state.loading) {
    elements.queryInput.value = "";
    elements.queryInput.blur();
  }
});

/* Consolidated click handler: source refs, pills, and any [data-document-id] element */
elements.chatMessages.addEventListener("click", async (e) => {
  const ref = e.target.closest("[data-document-id]");
  if (ref) {
    e.preventDefault();
    const docId = ref.dataset.documentId;
    const para = ref.dataset.paragraph || ref.dataset.para || '';
    if (docId) {
      sourceSession.set(docId, para);
      await loadSource(docId, para);
    }
  }
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

/* Quick actions */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t || !t.dataset.action) return;
  if (t.dataset.action === "copy-citations") {
    const cites = state.lastResult?.citations || [];
    if (!cites.length) return;
    const text = cites.map(c => `[${c.source_id}] ${c.title} — ${c.citation || ''} (${c.court || ''} ${c.year || ''})`).join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
    trackClick("copy_citations", { count: cites.length });
  }
  if (t.dataset.action === "compare-precedents") {
    const cites = state.lastResult?.citations || [];
    if (cites.length < 2) return;
    const existing = document.getElementById("precedentTable");
    if (existing) existing.remove();
    const wrapper = document.createElement("div");
    wrapper.id = "precedentTable";
    wrapper.innerHTML = `<div class="card"><h3>Precedent Comparison</h3>${renderPrecedentTable(cites)}<button class="link-button" data-action="close-precedent-table" style="margin-top:6px">Close</button></div>`;
    document.querySelector(".sidebar-right")?.prepend(wrapper);
    trackClick("compare_precedents", { count: cites.length });
  }
  if (t.dataset.action === "close-precedent-table") {
    document.getElementById("precedentTable")?.remove();
  }
});

/* Source viewer save */
elements.sourceViewer.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  if (t.dataset.action === "save-active-source" && sourceSession.source) {
    saveWorkspaceItem({ id: `source:${sourceSession.source.document_id}`, title: sourceSession.source.title, detail: sourceSession.source.citation || sourceSession.source.authority_status });
  }
  if (t.dataset.action === "retry-source") {
    loadSource(t.dataset.documentId).catch(() => {});
  }
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

/* Restore Source Viewer session — single deterministic entry point (hash > sessionStorage) */
if (sourceSession.restore()) {
  loadSource(sourceSession.documentId, sourceSession.highlightPara).catch(() => {});
}
