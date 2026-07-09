# Demo Script

## Opening

This is a local-first legal AI search console designed for a production corpus of 26L+ legal PDFs. The core rule is simple: the system must retrieve evidence, validate citations, and only then release an answer.

## Show These Queries

1. `What are the latest Supreme Court judgments on Section 420 IPC?`
   - Shows latest-in-index handling, Supreme Court metadata, Section 420 filter, citation gate, and warning that latest means latest in the indexed corpus.

2. `Give me material on GST input tax credit citing Section 16`
   - Shows act and section metadata extraction, ranked sources, and citation-marked answer paragraphs.

3. `Give me Supreme Court material on privacy under Article 21`
   - Shows court filtering, constitutional metadata, and paragraph-level citation display.

4. `Give me Supreme Court judgments after 2025 on maritime salvage liens and drone evidence`
   - Shows refusal behavior when the corpus cannot support the answer.

## What To Emphasize

- It is not a generic chatbot. It is a retrieval and citation system.
- The answer text is released only after retrieval and citation validation.
- The UI shows why an answer was released or blocked.
- The local JSON corpus can be replaced by PostgreSQL, OpenSearch, Qdrant, S3, FastAPI, ECS, and Bedrock without changing the safety contract.
- For real legal deployment, demo fixtures must be replaced by licensed EBC or authoritative government/legal sources.

## Production Explanation

The production version would ingest PDFs into S3, extract text and metadata, chunk with legal-aware strategies, generate Bedrock embeddings, index BM25 in OpenSearch, store vectors in Qdrant or OpenSearch Vector, rerank top results, validate citation metadata, and use Bedrock Claude/Nova only after the evidence set is ready.
