# Legal Safety Contract

This project is built for sensitive legal research workflows where an unsupported answer is worse than no answer.

## Non-Negotiable Rules

1. Retrieve before answering.
2. Validate citations before releasing the response.
3. Refuse when evidence is absent, weak, or missing required metadata.
4. Do not generate courts, years, citations, paragraph numbers, or source links.
5. Keep generated drafting or strategy separate from retrieved law.
6. Log retrieval sets, source IDs, validation results, and user feedback in production.
7. Treat all seed/demo documents as engineering fixtures until replaced by authoritative licensed material.

## Required Metadata

Every chunk should carry:

```json
{
  "document_id": "",
  "title": "",
  "court": "",
  "judge": "",
  "citation": "",
  "citation_type": "",
  "year": "",
  "bench": "",
  "act": "",
  "section": "",
  "paragraph": "",
  "topic": "",
  "chapter": "",
  "document_type": "",
  "language": "",
  "publisher": "",
  "edition": "",
  "pdf_page": "",
  "chunk_number": "",
  "embedding_version": "",
  "source_url": "",
  "s3_url": "",
  "created_at": "",
  "updated_at": ""
}
```

## Release Gate

The response may be released only when:

- Top retrieval score passes the configured threshold.
- At least one citation is valid.
- Every returned citation passes document-type validation.
- The answer text uses source markers.
- The refusal path is used for missing evidence.

## Production Evaluation

Track these metrics continuously:

- Retrieval Recall@K
- MRR
- NDCG
- Citation accuracy
- Grounded answer rate
- Refusal precision
- Hallucination incident rate
- User correction rate
- Latency by retrieval stage
