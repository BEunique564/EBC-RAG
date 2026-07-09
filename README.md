# EBC Legal AI Assistant — Production Ready Roadmap

**Eastern Book Company** — India's leading law information provider (1949 se). Yeh AI assistant hai jo SCC Online, EBC Reader, EBC Webstore, EBC Learning ke corpus ko use karta hai. Goal: **26,00,000+ PDFs** handle karna, zero hallucination, AWS S3 pe scale karna.

---

## 🚀 Current Status (Run Locally)

```
npm start
→ http://localhost:5174
```

| Metric | Value |
|---|---|
| Tests | ✅ 5/5 pass |
| Homepage | ✅ 200 OK |
| Chat API | ✅ Extractive + AI mode |
| Corpus | 7 demo docs (production target: 26L+) |
| Answer type | `extractive` (default) / `ai_summarized` (LLM mode) |

---

## 📦 EBC Product Ecosystem (Jinhe integrate karna hai)

EBC ka actual product lineup — yeh sab sources hain jinse data aayega:

| Product | Content Type | Data Location |
|---|---|---|
| **SCC Online** | Supreme Court & High Court judgments | S3 + internal feed |
| **SCC Weekly** | Weekly case digests | S3 |
| **SCC Civil / Criminal / Labour** | Subject-wise case collections | S3 |
| **EBC Reader** | eBooks, commentaries, treatises | S3 + DRM |
| **EBC Webstore** | Book metadata, pricing, availability | PostgreSQL |
| **EBC Learning** | Video courses, study material | S3 + Aurora |
| **EBC Explorer** | Legal research tool | API feed |
| **Journals** (5+ journals) | Legal articles, analysis | S3 |
| **Back Volumes** (1950-1969 SCC) | Historical judgments | S3 (scanned PDFs) |

---

## 🗺️ Production Architecture — Hinglish Me Samjho

```
                     ┌──────────────────────────────┐
                     │     Client Layer (Browser)    │
                     │  EBC AI Assistant UI          │
                     │  SCC Online Web / EBC Reader  │
                     └──────────────┬───────────────┘
                                    │
                     ┌──────────────▼───────────────┐
                     │     API Gateway (AWS / Azure)│
                     │  WAF · Rate Limit · Auth     │
                     │  Cognito / Entra ID · JWT    │
                     └──────────────┬───────────────┘
                                    │
                     ┌──────────────▼───────────────┐
                     │     Ingestion Pipeline        │
                     │  (Yahan raw data aata hai)    │
```

### Step 1: Data Sources — Multiple hain, sab S3 me

```
S3 Buckets:
├── scc-online-feed/       ← SCC Online daily/weekly updates
│   ├── 2026/              ← Year-wise
│   │   ├── 01-supreme-court/
│   │   ├── 02-high-courts/
│   │   └── 03-tribunals/
│
├── ebc-reader-content/    ← EBC Reader digital books
│   ├── commentaries/
│   ├── treatises/
│   └── student-books/
│
├── scanned-judgments/     ← Purane judgments (1950-2000)
│   ├── scc-back-volumes/
│   └── gazette-notifications/
│
├── webstore-metadata/     ← EBC Webstore product data
│   └── books.json
│
└── partner-feeds/         ← External partner content
    └── company-law-institute/
```

**Har source ka alaga pipeline hai.** Sab S3 Event Notification → SQS → Lambda trigger karta hai.

---

### Step 2: Raw Data Cleaning — Garbage In, Garbage Out Nahi

**Problems in raw data:**
- Scanned PDFs → OCR errors, missing pages, skewed text
- SCC Online feed → inconsistent formatting, missing benches, party names with typos
- Old back volumes → no metadata, handwritten annotations
- EBC Reader → DRM-protected, need decryption layer

**Cleaning pipeline:**

```
S3 (raw) → Lambda (format detect) → Queue (SQS) → Worker (ECS Fargate)
                                                      │
                 ┌────────────────────────────────────┤
                 ▼                                    ▼
          PDF Pipeline                         DOCX/Text Pipeline
          ├── PyMuPDF (born-digital)           ├── python-docx
          ├── Ghostscript + Tesseract (scan)   ├── table-extractor
          ├── OCR correction (spellcheck)      └── metadata-infer
          ├── table-extraction (Camelot)
          └── page-number detection
                 │
                 ▼
          Validation Layer
          ├── Checksum (SHA256) — dedup check
          ├── Schema validation — required fields present?
          ├── Language detection — Hindi/English mix?
          ├── PII scan — redact phone, aadhaar if present
          └── Quality score — reject if OCR < 80% confidence
                 │
                 ▼
          S3 (cleaned) → Chunking Lambda → OpenSearch + PostgreSQL
```

---

### Step 3: Metadata Filtering — 40% Time Yahi Lagao

**Har document ke saath yeh metadata stored hona chahiye — iske bina search kaam nahi karega:**

```json
{
  "document_id": "uuid-v4",
  "title": "Supreme Court IPC Section 420 Authority",
  "document_type": "judgment | statute | commentary | notification",
  "source_system": "scc_online | ebc_reader | scanned | partner",
  "tenant_id": "ebc_core | scc_online | ebc_learning",
  "access_tier": "free | basic | premium | enterprise",

  "court_fields": {
    "court": "Supreme Court of India | High Court | NCLAT | ...",
    "bench": ["CJI", "Justice A", "Justice B"],
    "judge": "Justice Name",
    "court_division": "Criminal | Civil | Constitutional"
  },

  "case_fields": {
    "parties": ["Petitioner Name", "Respondent Name"],
    "citation": "2024 SCC 123",
    "year": 2024,
    "decision_date": "2024-03-15",
    "outcome": "appeal_allowed | appeal_dismissed | partly_allowed",
    "overruled_by": null,
    "overrules": ["case_id_1", "case_id_2"],
    "cited_cases": ["case_id_3"]
  },

  "statute_fields": {
    "act": "Indian Penal Code | CGST Act | IBC",
    "section": "420 | 16 | 7",
    "article": "21 (for Constitution cases)",
    "amendment_history": [{"year": 2023, "change": "..."}]
  },

  "publishing_fields": {
    "publisher": "Eastern Book Company",
    "publication": "SCC | SCC Weekly | SCC Criminal",
    "volume": 5,
    "page_start": 123,
    "page_end": 145
  },

  "processing_metadata": {
    "source_format": "pdf | docx | tiff | jpg",
    "s3_raw_path": "s3://bucket/raw/doc.pdf",
    "s3_clean_path": "s3://bucket/clean/doc.json",
    "ocr_required": true,
    "ocr_confidence": 0.92,
    "chunk_count": 24,
    "embedding_model": "e5-mistral-7b",
    "ingested_at": "2026-07-09T10:30:00Z",
    "ingestion_version": 3
  }
}
```

**Yeh metadata kyun important hai?** Kyo ki ek lawyer search karta hai:
- *"Supreme Court ke Section 420 IPC ke latest judgments"* → filter: court=Supreme Court, section=420, sort by year
- *"Rohit Sharma vs Maharashtra related cases"* → filter: parties contain Rohit and Maharashtra
- *"GST Section 16 input tax credit Supreme Court"* → filter: act=CGST Act, section=16, court=Supreme Court

**Metadata ke bina, BM25/vector sirf text match karega — sahi answer nahi dega.**

---

### Step 4: Chunking Strategy — 26L+ PDFs Ke Liye

```
Document
└── Section (heading-based split)
    └── Paragraph (200-500 tokens)
        └── Sentence (for extraction)

- Overlap: 10% between adjacent chunks
- Chunk metadata: parent_id, heading_path, section_name, paragraph_index, page_number
- Embedding model: e5-mistral-7b (multilingual, Hindi+English+legal mix handle karega)
- Batch size: 100 chunks/call to embedding API
- Storage: OpenSearch k-NN index (HNSW algorithm, ef_construction=512, m=32)
```

**Why hierarchical?** Kyo ki agar ek lawyer poochhe "Section 420 ke intent element ke baare me Supreme Court kya kehta hai", toh sirf paragraph-level chunk retrieve karna padega, poora document nahi.

---

### Step 5: Retrieval — Zero Hallucination Ka Mantra

```
User Query
    │
    ▼
1. ACL Pre-filter
   ├── User/tenant → permitted document IDs
   ├── Apply BEFORE search (data leakage rokta hai)
   └── "Free tier user can't see Premium documents"
    │
    ▼
2. Hybrid Search (parallel)
   ├── BM25 (OpenSearch query_string) → keyword match
   ├── Vector (k-NN, cosine) → semantic match
   ├── Metadata filter → court, year, act, section
   └── Graph boost → cited-by penalty, overruled-by block
    │
    ▼
3. RRF (Reciprocal Rank Fusion)
   ├── BM25 rank + Vector rank + Metadata rank
   └── final_score = 0.35*bm25_norm + 0.35*vector_norm + 0.20*metadata_boost + 0.10*graph_boost
    │
    ▼
4. Cross-encoder Reranker
   ├── Top 50 → BGE-Reranker-v2 → Top 10-15
   └── Most impactful step for precision
    │
    ▼
5. Citation Validation Gate ⛔️
   ├── Check: document_id? title? court? year? citation? source_url?
   ├── Judgment must have: document_id, title, court, year, citation, source_url, judge/bench, paragraph/page
   └── If ANY required field missing → BLOCK answer ❌
    │
    ▼
6. Answer Synthesis
   ├── Extractive (default): directly from chunks, no LLM
   ├── AI Summarized (LLM mode): LLM summarizes chunks + shows outcomes
   └── Every statement gets [S1], [S2] marker → source tracking
    │
    ▼
   ✅ Answer Released (with citations)
   ❌ Insufficient Evidence (refused — kuch generate nahi kiya)
```

**Zero hallucination guarantee:**
```
1. LLM never writes from memory → only from retrieved chunks
2. Every [S1] marker must point to actual source in corpus
3. Citation validation passes → field check karta hai
4. Agar koi required field missing → answer block
5. Refusal message aata hai "insufficient evidence" — guess nahi karta
```

---

### Step 6: Graph Layer — Cases Ke Relationships Track Karo

**Why graph?** Kyo ki legal research circular hoti hai — ek case doosre case ko cite karta hai.

```
Neptune / Neo4j nodes:
├── Case (document_id, title, court, year)
├── Statute (act, section)
├── Court (name, division)
└── Party (name, type: petitioner/respondent)

Edges:
├── CITES (source → target) — "Case A cites Case B"
├── OVERRULED_BY (source → target) — "Case A was overruled by Case B"
├── FOLLOWED_IN (source → target) — "Case A was followed in Case B"
├── DISTINGUISHED_IN (source → target) — "Court distinguished previous case"
├── AMENDED_BY (statute → statute) — "Section 16 was amended by Finance Act 2023"
└── SAME_SUBJECT (case → case) — "Same legal issue, different outcomes"
```

**Graph boost in retrieval:** Jab retrieval chale, graph traversal karo. Agar koi case overruled hai toh uski ranking kam karo. Agar koi case frequently cited hai toh boost karo.

**Contradiction detection:** Do cases same subject same attribute but different values → flag for review.

---

### Step 7: AWS S3 Architecture — 26L+ PDFs Scale

```
Production S3 Layout:
───────────────────
ebc-ai-raw-{env}/           ← Original files (immutable, versioned)
  ├── scc-online/2026/01/   ← Year/month partition
  ├── ebc-reader/isbn/      ← ISBN-level
  ├── scanned/back-volumes/ ← Batch ID
  └── partner-feeds/        ← Partner name

ebc-ai-cleaned-{env}/       ← Extracted text, OCR output
  ├── documents/{doc_id}.json
  └── chunks/{doc_id}/chunk_{n}.json

ebc-ai-embeddings-{env}/    ← Vector cache
  └── model=v5/{doc_id}_{chunk_id}.npy

ebc-ai-artifacts/           ← Tables, images, metadata
  ├── tables/{doc_id}/
  └── images/{doc_id}/

Lifecycle Policy:
├── Raw: S3 Standard → Glacier (after 90 days) → Delete (after 7 years)
├── Cleaned: S3 Standard-IA (always accessible)
└── Embeddings: S3 Standard (frequently accessed)

Event Flow:
S3 PutEvent → SQS (Standard queue, 100k msg limit)
           → Lambda (format router, 15 min timeout)
           → ECS Fargate (chunking, batch processing)
           → OpenSearch (bulk index, 500 docs/batch)
           → PostgreSQL (metadata, audit log)
           → SNS (notification on complete)
```

---

### Step 8: LLM Integration — Optional, Configurable

**Configuration (`.env` me):**

```env
# Koi bhi OpenAI-compatible API kaam karegi:
# Ollama (local, free) | OpenAI | Azure OpenAI | vLLM | Bedrock

LLM_PROVIDER=ollama
LLM_OLLAMA_URL=http://localhost:11434
LLM_OLLAMA_MODEL=qwen2.5:7b
```

**LLM kya karta hai:**
- Retrieved chunks ka **summary** banata hai
- Har case ka **outcome** batata hai (jeet/haar — who won, who lost)
- **Comparative analysis** — cases ek doosre se kaise relate karte hain
- **Relevant precedents** — kaunsa case kahan applicable hai

**LLM kya NAHIN karta:**
- ❌ Legal advice nahi deta ("you should file...")
- ❌ Apni memory se kuch nahi likhta
- ❌ Bina citation ke koi claim nahi karta
- ❌ Guess nahi karta

**LLM unavailable → automatic extractive fallback. Zero downtime.**

---

### Step 9: Multi-Data Source Ingestion (Real Scenario)

| Source | Format | Volume | Frequency | Method |
|---|---|---|---|---|
| SCC Online Feed | JSON + PDF | 500-1000/week | Daily | API pull → SQS → Lambda |
| SCC Back Volumes | Scanned PDF/TIFF | 50,000+ | One-time batch | S3 batch → OCR → Human review |
| EBC Reader | ePub + PDF | 1000+ books | Weekly | S3 event → Lambda → chunk |
| EBC Webstore | JSON | 10,000+ products | Daily | PostgreSQL sync → OpenSearch |
| Partner Feeds | Varies | Unknown | Monthly | S3 upload → manual QC |
| Court Websites | HTML/PDF | Daily | Cron job | Web scraper → SQS → Lambda |
| User Upload (via UI) | PDF/DOCX | 100/day | Real-time | Lambda → S3 → processing |

**Unified schema:** Har source se data aane ke baad, ek common schema me convert karo (see Step 3 metadata). Agar source me field missing hai, toh `null` mark karo — LLM ya extractor se infer mat karo.

---

### Step 10: Monitoring & Evaluation — Production Me Chup Nahi Baitho

**Every query logged:**
```sql
INSERT INTO query_log (user_id, query, status, confidence, citations_count, latency_ms, answer_type, timestamp);
```

**Dashboards (CloudWatch / Grafana):**

| Metric | Target | Alert If |
|---|---|---|
| Retrieval hit rate | >95% | <90% for 5 min |
| Answer latency p95 | <5s | >8s for 5 min |
| Citation accuracy | >98% | <95% (human review) |
| Hallucination rate | <1% | Any incident = P0 |
| Failed query rate | <5% | >10% for 10 min |
| SQS queue depth | <100 | >1000 |
| OCR quality score | >0.85 | <0.80 for batch |
| User satisfaction | >80% | <60% |

**Eval set:** 100 golden Q&A pairs (real lawyer queries). Har pipeline deploy pe run karo. If nDCG@10 drops >0.05 → rollback.

---

### Step 11: Security & Access Control

```
Authentication: Cognito / Entra ID + OAuth 2.0 + PKCE
────────────────────────────────────────────────────
├── Enterprise users: SSO (Azure AD / Okta)
├── Individual users: Email + OTP
└── API integrations: API key per partner

Authorization: RBAC (per tenant)
────────────────────────────────
├── admin: full access, manage users, view all docs
├── editor: ingest documents, run queries
├── lawyer: query corpus, save sources, export memos
└── viewer: read-only, limited queries/day

Document-level ACL:
──────────────────
├── Each doc tagged with: allowed_roles[], allowed_tiers[]
├── ACL filter runs BEFORE retrieval
└── User never sees docs they don't have access to

Audit Log (immutable):
────────────────────
├── Every query logged: user, query, results, timestamp, IP
├── Every doc access logged: user, doc, action, timestamp
├── Store in S3 (Parquet) + Athena for query
└── Retention: 7 years (legal compliance)
```

---

### Step 12: Cost Estimation (26L+ PDFs)

| Component | Monthly Cost (approx) |
|---|---|
| S3 Storage (raw + clean + embeddings) | $2,500 - $4,000 |
| OpenSearch (3 nodes, r6g.2xlarge) | $1,800 - $2,500 |
| PostgreSQL (RDS, db.r6g.2xlarge) | $800 - $1,200 |
| Neptune/Neo4j | $500 - $1,000 |
| ECS Fargate (ingestion workers) | $400 - $800 |
| Lambda (serverless) | $200 - $500 |
| SQS + SNS | $50 - $100 |
| LLM inference (Qwen-32B self-hosted) | $1,000 - $2,000 |
| Cross-encoder reranker | $200 - $400 |
| CloudWatch + X-Ray | $100 - $200 |
| **Total (approx)** | **$7,550 - $12,700/mo** |

> SaaS pricing model: Free (10 queries/day) + Basic (₹999/mo) + Premium (₹4,999/mo) + Enterprise (custom).
> At 10,000 paid users (avg ₹2,000/mo) → ₹2Cr/mo revenue. Cost ~₹6-10L/mo.

---

## 📋 Step-by-Step Execution Plan (12 Weeks)

### Week 1-2: Data Audit & Schema
- [ ] S3 buckets ka survey karo — kaunsa data kaha hai, kya format hai
- [ ] Metadata schema final karo (40% time yahi lagao)
- [ ] Schema enforcement tool banao (JSON Schema validation)

### Week 3-4: Ingestion Pipeline
- [ ] S3 Event → SQS → Lambda pipeline banao
- [ ] Format router: PDF (PyMuPDF + OCR), DOCX, XLSX, Image
- [ ] Chunking: hierarchical (heading → para → sentence)
- [ ] Embedding: multilingual model deploy karo

### Week 5-6: Storage & Search
- [ ] OpenSearch cluster setup (3 node, shard per document type)
- [ ] PostgreSQL schema migrate
- [ ] Graph DB setup (citation edges)
- [ ] Hybrid search (BM25 + vector + metadata + graph)

### Week 7-8: Retrieval Pipeline
- [ ] Cross-encoder reranker integration
- [ ] Citation validation gate (unchanged from demo)
- [ ] ACL pre-filter (role/tier based doc access)
- [ ] Answer synthesis (extractive + AI summarized)

### Week 9-10: Auth & Security
- [ ] Cognito / Entra ID integration
- [ ] RBAC implementation
- [ ] Audit logging (S3 + Athena)
- [ ] Rate limiting (Redis sliding window)

### Week 11-12: Testing & Launch
- [ ] Eval set: 100 golden queries
- [ ] Load testing (1000 concurrent users)
- [ ] Security audit
- [ ] Production deployment
- [ ] Monitoring dashboards

---

## 🛡️ Safety Contract (KYC — Know Your Corpus)

1. **Never answer from model memory** — LLM sirf retrieved chunks copy karta hai
2. **Retrieval required** — Bina chunk ke koi answer nahi
3. **Citation mandatory** — Har statement ke saath `[S1]` marker
4. **Validation gate** — Required fields check, missing = block
5. **Refuse > Guess** — `insufficient_evidence` bhejo, generate mat karo
6. **Traceability** — Har answer ka source track ho sakta hai (file, heading, line)

> Yeh hallucination risk kam karta hai lekin legal output automatically correct nahi banata.
> **Lawyer review is mandatory before relying on any output.**

---

## 🔧 Tech Stack Summary

| Layer | Tech | Why |
|---|---|---|
| Storage (docs) | PostgreSQL | ACID, metadata queries, audit |
| Search | OpenSearch | BM25 + vector (k-NN) + filter |
| Graph | Neptune / Neo4j | Citation tracking, contradiction |
| Queue | SQS | Async ingestion, 100k msg limit |
| Compute | Lambda + ECS Fargate | Serverless + batch workers |
| Embeddings | e5-mistral-7b | Multilingual (Hindi+English+legal) |
| Reranker | BGE-Reranker-v2 | Precision boost |
| LLM | Qwen-32B / Claude / GPT-4o | Summarization (optional) |
| Auth | Cognito / Entra ID | OAuth 2.0, SSO |
| Monitoring | CloudWatch + Grafana | Metrics, logs, traces |
| Frontend | Vanilla JS + CSS (current) | Expandable to React/Vue |
>>>>>>> 04f00be (Initial: evidence-gated legal RAG with Redis cache + Render Blueprint)
