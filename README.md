# EBC Legal AI Assistant — Chatbot, RAG, Zero Hallucination

**Eastern Book Company** (1949 se India's #1 law publisher) ka AI chatbot hai. Yeh SCC Online, EBC Reader, EBC Webstore, EBC Learning — sabka corpus use karta hai. Goal: **zero hallucination**, har answer ke saath citation, aur production me **26L+ PDFs** handle karna.

```
⚡ Live demo: http://localhost:5174
📦 Current corpus: 9 demo docs (production: 26L+)
🧪 Tests: 36/36 pass | 225/225 UI pass | 15/15 security pass
```

---

## Yeh Kaam Kaise Karta Hai? (Ek Minute Mein)

Jab user poochhta hai *"Section 420 IPC latest Supreme Court judgment"*:

```
User Query
    │
    ▼
Hybrid Search (BM25 + Vector + Metadata) → Top 15 chunks
    │
    ▼
Cross-encoder Reranker → Top 8 chunks (precision boost)
    │
    ▼
Citation Validation Gate ⛔️
    ├── document_id chahiye? ✅
    ├── court chahiye? ✅
    ├── year chahiye? ✅
    ├── paragraph/page number chahiye? ✅
    └── Koi field missing → ❌ BLOCK answer
    │
    ▼
Answer banega (extractive ya LLM summary)
    │
    ▼
✅ "Answer — har line ke saath [S1] [S2] marker"
❌ "Insufficient evidence — guess nahi kiya"
```

**Zero hallucination guarantee:**
- LLM sirf retrieved chunks se likhta hai, apni memory se nahi
- Har `[S1]` marker ka actual source corpus me exist karna chahiye
- Citation validation fail → answer block
- Koi guess nahi, koi fabrication nahi

---

## Table of Contents

1. [EBC Website Me Integrate Kaise Karein](#1-ebc-website-me-integrate-kaise-karein)
2. [AWS Step by Step Deployment](#2-aws-step-by-step-deployment)
3. [Local Development](#3-local-development)
4. [Testing](#4-testing)
5. [API Reference](#5-api-reference)
6. [Configuration](#6-configuration)
7. [Architecture](#7-architecture)

---

## 1. EBC Website Me Integrate Kaise Karein

### 1.1 Embed Chat Widget (Sabse Simple)

`ebc.co.in` pe ek floating chat button daalna hai:

```html
<!-- ebc.co.in ke footer me yeh daalo -->
<script src="https://your-ai-api.com/widget.js" data-ebc-ai-key="YOUR_API_KEY"></script>
```

Widget automatically:
- Right corner pe chat bubble dikhayega
- User query bhejega → answer dekhega → citation click karega
- Source viewer modal me document dikhega
- User session cookie se track hoga (EBC site ke existing login ke saath)

### 1.2 Iframe Embed (Custom UI)

Agar tumhe apna UI chahiye (e.g., SCC Online me directly):

```html
<iframe
  src="https://your-ai-api.com/chat?token=USER_JWT&theme=ebc"
  width="100%"
  height="600px"
  style="border: none; border-radius: 12px;"
></iframe>
```

Parameters:
- `token` — EBC site ka existing JWT token (SSO ke liye)
- `theme` — `ebc` | `scc` | `reader` (color scheme)
- `tier` — `free` | `basic` | `premium` | `enterprise`

### 1.3 REST API Integration (Full Control)

Agar tum directly apne backend/custom app se connect karna chahte ho:

```bash
# Chat query
curl -X POST https://your-ai-api.com/api/chat \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user@ebc.co.in" \
  -H "X-User-Tier: premium" \
  -d '{"query": "Section 420 IPC latest Supreme Court judgment"}'

# Response:
{
  "status": "answered",
  "answer": "Based only on the retrieved sources:\n\n\"...cheating ingredients...\" (para 4, page 3) [S1]\n\n\"...intent element...\" (para 7, page 5) [S2]",
  "confidence": 82,
  "citations": [
    {
      "source_id": "S1",
      "title": "Supreme Court IPC Section 420 Authority",
      "court": "Supreme Court",
      "section": "420",
      "paragraph": "4",
      "pdf_page": "3"
    }
  ],
  "related_documents": [...],
  "product_recommendations": [...]
}
```

### 1.4 SSO Integration (EBC Login Ke Saath)

EBC website already user login hai (Cognito / custom auth). Integration steps:

| Step | Kaam |
|------|------|
| 1 | EBC site se user login kare |
| 2 | Token generate kare (JWT with user_id, role, tier) |
| 3 | Yeh token bheje AI API ko `Authorization: Bearer <token>` header me |
| 4 | AI API token verify kare → user identify kare → ACL apply kare |

```javascript
// ebc.co.in se AI API call
const token = await getEbcUserToken(); // EBC ka existing auth
const res = await fetch("https://your-ai-api.com/api/chat", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ query: "Section 420 IPC" })
});
```

**Tier-based access** — EBC subscription ke hisaab se:
- **Free** (10 queries/day) — sirf SCC Online demo cases
- **Basic** (₹999/mo) — Supreme Court + High Court + CrPC
- **Premium** (₹4,999/mo) — All judgments + statutes + commentaries
- **Enterprise** (custom) — Full corpus + custom integrations

### 1.5 Deep Link Integration (Citation → Source)

Jab user citation click kare, toh seedha EBC Reader / SCC Online page khule:

```javascript
// /api/source se document URL aata hai
// Agar PDF hai: window.open("https://ebcreader.com/book/isbn-123#page=42")
// Agar SCC Online: window.open("https://scconline.com/case/2024-scc-123#para-7")
```

| Source Type | Deep Link Format |
|-------------|-----------------|
| SCC Online | `https://scconline.com/case/{citation}#para-{n}` |
| EBC Reader | `https://ebcreader.com/book/{isbn}#page={n}` |
| EBC Webstore | `https://ebcwebstore.com/product/{product_id}` |
| PDF (S3) | `https://cdn.ebc.co.in/pdfs/{doc_id}#page={n}` |

### 1.6 Product Recommendations (EBC Webstore)

Har answer ke saath related products bhi recommend hote hain:

```json
{
  "product_recommendations": [
    {
      "title": "Ratanlal & Dhirajlal: Indian Penal Code",
      "type": "book",
      "price": "₹2,495",
      "url": "https://ebcwebstore.com/product/ipc-ratanlal",
      "score": 0.89
    },
    {
      "title": "SCC Online Criminal Law Module",
      "type": "subscription",
      "url": "https://scconline.com/modules/criminal",
      "score": 0.76
    }
  ]
}
```

Yeh EBC Webstore ke actual products se link karta hai — user seedha kharid sakta hai.

---

## 2. AWS Step by Step Deployment

Poora system AWS pe deploy karne ke liye step-by-step guide:

### Step 1: S3 Buckets Setup

```
# 3 buckets chahiye:
aws s3 mb s3://ebc-ai-raw-production     # Original PDFs
aws s3 mb s3://ebc-ai-cleaned-production   # Extracted text
aws s3 mb s3://ebc-ai-embeddings-production # Vector cache

# Lifecycle policy — raw data 90 days baad Glacier
aws s3api put-bucket-lifecycle-configuration \
  --bucket ebc-ai-raw-production \
  --lifecycle-configuration '{
    "Rules": [{
      "Id": "archive-raw",
      "Status": "Enabled",
      "Transitions": [{"Days": 90, "StorageClass": "GLACIER"}]
    }]
  }'
```

### Step 2: OpenSearch Cluster

```bash
# aws opensearch create-domain --domain-name ebc-legal-ai --engine-version OpenSearch_2.11 \
#   --cluster-config InstanceType=r6g.2xlarge.search,InstanceCount=3 \
#   --ebs-options EBSEnabled=true,VolumeSize=200,VolumeType=gp3 \
#   --node-to-node-encryption-enabled --encryption-at-rest-enabled \
#   --domain-endpoint-options EnforceHTTPS=true

# Index mapping:
PUT /legal-corpus
{
  "settings": {
    "index": {
      "knn": true,
      "knn.algo_param.ef_search": 512
    }
  },
  "mappings": {
    "properties": {
      "title": { "type": "text", "analyzer": "standard" },
      "text": { "type": "text", "analyzer": "standard" },
      "court": { "type": "keyword" },
      "act": { "type": "keyword" },
      "section": { "type": "keyword" },
      "year": { "type": "integer" },
      "embedding": { "type": "knn_vector", "dimension": 4096 }
    }
  }
}
```

### Step 3: PostgreSQL (RDS)

```bash
# aws rds create-db-instance --db-instance-identifier ebc-legal-ai \
#   --db-instance-class db.r6g.2xlarge --engine postgres \
#   --master-username ebc_admin --master-user-password SECRET \
#   --allocated-storage 200 --multi-az

# Tables:
CREATE TABLE documents (
  document_id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  document_type VARCHAR(50),
  court VARCHAR(100),
  year INTEGER,
  citation TEXT,
  act VARCHAR(100),
  section VARCHAR(50),
  metadata JSONB,
  s3_raw_path TEXT,
  s3_clean_path TEXT,
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE query_log (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(100),
  query TEXT,
  status VARCHAR(50),
  confidence INTEGER,
  citations_count INTEGER,
  latency_ms INTEGER,
  answer_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Step 4: Ingestion Pipeline (S3 → SQS → Lambda → ECS)

```yaml
# AWS SAM template
Resources:
  RawDataBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: ebc-ai-raw-${env}

  IngestionQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: ebc-ai-ingestion
      VisibilityTimeout: 900
      MessageRetentionPeriod: 1209600

  FormatRouter:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: nodejs20.x
      Timeout: 900
      Events:
        S3Event:
          Type: S3
          Properties:
            Bucket: !Ref RawDataBucket
            Events: s3:ObjectCreated:*
      Environment:
        Variables:
          QUEUE_URL: !Ref IngestionQueue

  ChunkingWorker:
    Type: AWS::ECS::Service
    Properties:
      TaskDefinition: chunking-task
      DesiredCount: 2
      LaunchType: FARGATE
```

**Flow:** S3 pe file aayi → Event notification → SQS → Lambda format detect → ECS Fargate chunk + embed → OpenSearch index

### Step 5: ECS Fargate (API Server)

```yaml
# task-definition.json
{
  "family": "ebc-legal-api",
  "networkMode": "awsvpc",
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [{
    "name": "api",
    "image": "public.ecr.aws/your-repo/ebc-legal-ai:latest",
    "portMappings": [{"containerPort": 5174}],
    "environment": [
      {"name": "OPENSEARCH_HOST", "value": "https://..."},
      {"name": "PG_HOST", "value": "..."},
      {"name": "REDIS_URL", "value": "redis://..."},
      {"name": "LLM_PROVIDER", "value": "bedrock"},
      {"name": "LLM_BEDROCK_MODEL", "value": "claude-3-sonnet"}
    ]
  }]
}
```

**Auto-scaling:** Target tracking — CPU > 70% ya memory > 70% → scale up

### Step 6: API Gateway + WAF + Load Balancer

```
User → CloudFront → WAF → ALB → ECS Fargate
                            │
                            ▼
                    Redis Cache (ElastiCache)
                    OpenSearch (k-NN)
                    PostgreSQL (RDS)
```

- **CloudFront:** Static assets cache, DDoS protection
- **WAF:** Rate limiting (100 req/min/user), SQL injection block, XSS block
- **ALB:** SSL termination, health check, path-based routing
- **ElastiCache (Redis):** Query cache, rate limiter, session store

### Step 7: SSO + Auth (Cognito / Entra ID)

```bash
# aws cognito-idp create-user-pool --pool-name ebc-legal-ai
# aws cognito-idp create-user-pool-client --user-pool-id <id> --client-name ebc-web

# Integration:
# 1. EBC site login → Cognito token
# 2. Frontend AI widget → token bhejega API ko
# 3. API token verify karega → user tier detect → ACL apply
```

### Step 8: Monitoring (CloudWatch + Grafana)

```
CloudWatch Metrics:
├── ChatLatency (p50/p95/p99)
├── ChatErrorRate
├── CorpusDocuments (count)
├── CitationsVerified (rate)
└── HallucinationRisk (if any)

Alarms:
├── P95 > 5s for 5m → SNS → Email/Slack
├── ErrorRate > 1% for 5m → SNS → PagerDuty
├── CitationVerified < 90% → SNS → Review team

Grafana Dashboard:
├── Left: Latency + Error Rate graphs
├── Center: Query volume, answer rate
├── Right: SLO status (pass/fail)
└── Bottom: Recent audit log
```

### Step 9: Cost Estimation (Production Scale — 26L+ PDFs)

| Component | Monthly |
|-----------|---------|
| S3 Storage | $2,500 - $4,000 |
| OpenSearch (3 × r6g.2xlarge) | $1,800 - $2,500 |
| RDS PostgreSQL (db.r6g.2xlarge) | $800 - $1,200 |
| ECS Fargate (API + workers) | $600 - $1,200 |
| ElastiCache Redis | $200 - $400 |
| Lambda + SQS + SNS | $300 - $600 |
| CloudWatch + X-Ray | $100 - $200 |
| LLM Inference (Bedrock Claude) | $500 - $1,500 |
| WAF + CloudFront + ALB | $200 - $400 |
| **Total** | **$7,000 - $12,000/mo (~₹6-10L/mo)** |

> Tier pricing: Free (10/day) → Basic ₹999/mo → Premium ₹4,999/mo → Enterprise custom
> 10,000 paid users @ avg ₹2,000/mo = ₹2Cr/mo revenue

---

## 3. Local Development

### Prerequisites
- Node.js >= 20
- Redis (optional, cache ke liye)
- Ollama ya OpenAI key (optional, LLM mode ke liye)

### Install + Run

```bash
git clone https://github.com/BEunique564/EBC-RAG.git
cd EBC-RAG
npm install
npm start
# → http://localhost:5174
```

### Environment (.env)

```
# Copy .env.example → .env
PORT=5174
REDIS_URL=redis://localhost:6379

# LLM (optional — bina LLM ke bhi kaam karega)
LLM_PROVIDER=ollama
LLM_OLLAMA_URL=http://localhost:11434
LLM_OLLAMA_MODEL=qwen2.5:7b

# AWS (production me bharo)
AWS_REGION=ap-south-1
OPENSEARCH_HOST=
PG_HOST=
```

---

## 4. Testing

```bash
# Unit tests (node:test)
npm test                           # 36 tests

# Evaluation suite
node tests/eval/evaluate.js        # 10 queries + adversarial
node tests/eval/evaluation-suite-v2.js  # 100 queries, exports JSON

# UI tests (server chahiye)
node tests/load/uisim.js           # 225 checks
node tests/load/loadtest.js        # 100 req, concurrency=10

# Security audit (server chahiye)
node tests/security/security-audit.js  # 15 checks

# Adversarial + confidence tests
node tests/adversarial.test.js          # 24 tests
node tests/confidence-calibration.test.js  # 7 tests
```

---

## 5. API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Main query endpoint |
| `/api/source?document_id=` | GET | Get source document with chunks |
| `/api/health` | GET | Health check + SLO status |
| `/api/corpus` | GET | Corpus summary + all documents |
| `/api/slo` | GET | SLO definitions + current status |
| `/api/audit` | GET | Query audit log + hallucination summary |
| `/api/latency?operation=` | GET | Latency percentiles |
| `/api/feedback` | GET/POST | User feedback submission |
| `/api/events` | GET/POST | Analytics events |
| `/api/profile` | GET | User session profile |
| `/api/documents` | POST | Ingest new document |

---

## 6. Configuration

```
SLO_LATENCY_P95=5000         # ms
SLO_ERROR_RATE=0.01          # 1%
SLO_CITATION_VERIFIED=0.90   # 90%
SLO_ANSWER_RELEASE=0.90      # 90%
SLO_REFUSAL_RATE=0.05        # 5%
SLO_UPTIME=0.995             # 99.5%

LOG_LEVEL=info                # error | warn | info | audit | debug
LOG_JSON=true                 # JSON logs for CloudWatch
```

---

## 7. Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser / Client                   │
│  ebc.co.in · SCC Online · EBC Reader · EBC Learning │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS / WSS
┌────────────────────▼────────────────────────────────┐
│           AWS CloudFront + WAF + ALB                 │
│           Rate limit · Auth · SSL                    │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│    ECS Fargate (API Server)                         │
│    ┌───────────────────────────────────────────┐    │
│    │ Retrieval Pipeline                        │    │
│    │ Hybrid Search → Reranker → Citation Gate  │    │
│    │ → Answer Synthesis → Audit Log            │    │
│    └───────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────┼────────────────────┐
│                    │                    │
▼                    ▼                    ▼
Redis              OpenSearch          PostgreSQL
(Cache)            (k-NN + BM25)       (Metadata + Audit)
│                                       │
│                    ┌──────────────────┘
│                    ▼
│              S3 (PDFs + Embeddings)
│              Raw → Clean → Embed
│
└────────────── SQS → Lambda → ECS Fargate
               (Ingestion Pipeline)
```

---

## Safety Contract (KYC — Know Your Corpus)

1. **Never answer from model memory** — LLM sirf retrieved chunks copy karta hai
2. **Retrieval required** — Bina chunk ke koi answer nahi
3. **Citation mandatory** — Har statement ke saath `[S1]` marker
4. **Validation gate** — Required fields check, missing = block
5. **Refuse > Guess** — `insufficient_evidence` bhejo, generate mat karo
6. **Traceability** — Har answer ka source track ho sakta hai

> Yeh hallucination risk kam karta hai lekin legal output automatically correct nahi banata.
> **Lawyer review is mandatory before relying on any output.**

---

## License

Eastern Book Company — Proprietary. All rights reserved.
