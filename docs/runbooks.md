# Runbooks — EBC Legal AI Assistant

## Incident Response

### R1: Hallucination Spike
**Detection:** `/api/audit` shows `hallucination_risk: "high"` or unsupported sentence rate > 5%

**Triage:**
1. Check `/api/audit` for recent queries with unsupported sentences
2. Review answer text for citations without source markers `[S#]`
3. Check if a recent code deploy changed retrieval or prompt logic

**Resolution:**
1. If caused by code change: `git revert <sha>` and redeploy
2. If caused by corpus issue: validate `data/legal_corpus.json` format is `{"documents": [...]}`
3. If LLM misbehaving: reduce temperature in `src/llm.js` (line 44) or disable LLM summarization
4. Add failing query as a unit test to `tests/rag.test.js`

### R2: Citation Fetch Failure
**Detection:** `/api/source` returns 404 or chunks missing paragraph/page locators

**Triage:**
1. Verify document exists in corpus via `/api/corpus`
2. Check `citations.js:verifyCitationMetadata()` — paragraphs and pdf_page must be non-empty
3. Check for `local://` URLs in the corpus — these are blocked by `safeUrl()` in UI

**Resolution:**
1. Add missing locators to document chunks in `data/legal_corpus.json`
2. Replace any `local://` URLs with real source URLs (see R4)
3. Re-index: POST to `/api/documents` or restart server

### R3: Latency Spike (p95 > 5s)
**Detection:** `/api/latency` shows p95 > 5000ms

**Triage:**
1. Check `tests/load/slos.js` output for recent runs
2. Check CPU/memory usage on host
3. Check if LLM provider is slow (Ollama, OpenAI, Azure)

**Resolution:**
1. If LLM timeout: reduce `max_tokens` in `src/llm.js` or increase timeout from 30s
2. If cache miss rate high: verify Redis is connected (`REDIS_URL`)
3. Scale horizontally if on production

### R4: Dead External URLs
**Detection:** Error logs show DNS failures or 404s for source URLs

**Triage:**
1. Identify which URLs are failing from logs
2. Test manually: `curl -I <url>`
3. Check domain availability (e.g., `cdn.sci.gov.in`, `www.scconline.com`)

**Resolution:**
1. If domain is permanently dead, replace with `local://placeholder` (UI will hide the link)
2. If domain is temporarily down, document and monitor
3. For production, maintain a URL health check script

### R5: Corpus Format Corruption
**Detection:** Server starts with 0 documents or `/api/corpus` shows empty

**Triage:**
1. Check server startup logs for "documents" count
2. Inspect `data/legal_corpus.json` for valid JSON and structure
3. `corpusStore.js:81` expects `seed.documents` array — file must be `{"documents": [...]}`

**Resolution:**
1. Restore from git: `git checkout -- data/legal_corpus.json`
2. If format was flattened (bare array), wrap in `{"documents": [...]}`
3. Restart server

### R6: SLO Violation Alert
**Detection:** SLO monitor (`tests/load/slos.js`) reports FAIL or webhook receives alert

**Triage:**
1. Check `/api/slo` for current SLO status and recent violations
2. Identify which SLO is breached (latency, error rate, refusal rate, etc.)
3. Cross-reference with recent deployments

**Resolution:**
1. For latency breach: see R3
2. For error rate breach: check API error logs, 5xx responses
3. For refusal rate breach: may be corpus gap — check that queries have matching documents
4. If sustained >5min, rollback to last stable deploy

### R7: Prompt Injection Attack
**Detection:** Adversarial test suite fails, or logs show suspicious query patterns

**Triage:**
1. Check `tests/adversarial.test.js` results
2. Review the specific query that bypassed guardrails
3. Check answer for system prompt leakage or unsafe content

**Resolution:**
1. The system is evidence-gated — no answer without citation valid evidence
2. If a bypass is found, add the injection vector to `tests/adversarial.test.js`
3. Update `src/ragPipeline.js:detectAdviceQuery()` or add input sanitization

## Maintenance

### M1: Run Full Test Suite
```bash
npm test
node tests/eval/evaluate.js
node tests/load/uisim.js          # requires server running
node tests/load/loadtest.js       # requires server running
node tests/security/security-audit.js  # requires server running
node tests/adversarial.test.js
```

### M2: Update SLO Thresholds
Edit SLO values in environment:
```
SLO_LATENCY_P95=3000
SLO_ERROR_RATE=0.01
SLO_CITATION_VERIFIED=0.95
SLO_ANSWER_RELEASE=0.90
SLO_REFUSAL_RATE=0.10
SLO_UPTIME=0.995
```

### M3: Add Test Query for New Corpus Content
1. Add document to `data/legal_corpus.json`
2. Add test case to `tests/rag.test.js`
3. Add evaluation case to `tests/eval/evaluation-suite-v2.js`
4. Run `npm test` to verify

### M4: Deploy Checklist
1. Run all tests (M1)
2. Check `/api/health` returns ok
3. Verify corpus documents > 0
4. Verify `/api/slo` all passing
5. Run `tests/load/slos.js` — all SLOs pass
6. Deploy
7. Verify canary — run 10 sample queries
8. Monitor SLOs for 5min post-deploy
