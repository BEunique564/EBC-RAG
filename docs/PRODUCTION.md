# Production Architecture

The local app is intentionally dependency-free. For a real lawyer-facing deployment, keep the same API contract and replace local storage/scoring pieces with managed services.

## Target Flow

```text
Authorized Sources
  -> Ingestion Queue
  -> OCR / Parser / Metadata Extractor
  -> Chunker
  -> PostgreSQL document store
  -> OpenSearch BM25 index
  -> Vector index
  -> Hybrid retrieval
  -> Cross-encoder reranker
  -> Citation validator
  -> Bedrock or private LLM answer draft
  -> Final response or refusal
```

## AWS Mapping

- S3: source PDFs, OCR output, parsed text, provenance artifacts.
- SQS or Kafka: ingestion jobs and retry queues.
- ECS or EKS: API, workers, reranker, LLM adapter.
- RDS PostgreSQL: documents, chunks, users, roles, audit logs, feedback.
- OpenSearch: BM25, metadata filters, optional vector search.
- Qdrant or OpenSearch Vector: dense retrieval.
- Bedrock: managed model endpoint where allowed.
- Secrets Manager: provider keys and database credentials.
- CloudWatch: logs, metrics, alerts.
- IAM: least-privilege service access.
- API Gateway or ALB: public entry point.

## Hardening Checklist

- Tenant-aware authorization on every document and chunk.
- Subscription/license filters before retrieval.
- Immutable source versioning.
- Citation validation after generation.
- Prompt injection filtering on retrieved text and user uploads.
- Full audit record for query, retrieved source IDs, answer, refusal reason, and feedback.
- Offline benchmark set with lawyer-verified expected sources.
- Red-team tests for fabricated cases, stale law, wrong court hierarchy, and missing paragraph references.

## Swappable Interfaces

The current `src/search.js`, `src/corpusStore.js`, and `src/ragPipeline.js` are the boundaries to replace:

- `corpusStore`: move from JSON to PostgreSQL plus object storage.
- `searchCorpus`: move from local scoring to OpenSearch plus vector DB.
- `answerLegalQuery`: keep the refusal and citation validation contract, but add a guarded LLM adapter.
