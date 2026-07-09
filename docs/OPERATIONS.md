# EBC Legal AI Assistant — Operations Runbook

## 1. Service Overview

| Attribute | Value |
|-----------|-------|
| Service Name | EBC Legal AI Assistant |
| Port | 5174 (configurable via `PORT`) |
| Runtime | Node.js >= 20 |
| Startup | `npm start` / `node server.js` |
| Health Endpoint | `GET /api/health` |
| Build | None (pure Node.js, no build step) |

## 2. Startup & Shutdown

### Normal Startup
```bash
npm start
# or
node server.js
```
Expected log: `Legal Evidence RAG running at http://localhost:5174`

### Hard Restart
```bash
# Find the process
netstat -ano | findstr :5174

# Kill by PID
taskkill /PID <PID> /F

# Restart
npm start
```

### Graceful Shutdown
```bash
# On Windows, Ctrl+C in the running terminal
# The server will close connections on next tick
```

## 3. Health Checks

Manual:
```bash
curl http://localhost:5174/api/health
```
Expected response:
```json
{
  "ok": true,
  "service": "legal-evidence-rag",
  "corpus_documents": 9,
  "corpus_chunks": 12,
  "summary": { ... }
}
```

Automated (cron every 30s):
```bash
node tests/load/slos.js
```

## 4. SLO Monitoring

Run the SLO monitor:
```bash
node tests/load/slos.js                # single shot
node tests/load/slos.js --watch        # continuous (every 30s)
```

Alert webhook (set env var):
```bash
ALERT_WEBHOOK=https://hooks.example.com/alerts node tests/load/slos.js --watch
```

### SLO Targets

| SLO | Threshold | Measurement |
|-----|-----------|-------------|
| p95 Latency | < 5000ms | `/api/chat` response time |
| Refusal Rate | < 5% | Queries returning `insufficient_evidence` |
| Error Rate | < 1% | HTTP 5xx / crashes / timeouts |
| Citation Verified | > 90% | Citations with complete metadata |
| Answer Release | > 90% | Queries producing an answer |
| Uptime | > 99.5% | Health endpoint availability |

### Monitoring script (crontab example)
```bash
*/5 * * * * cd /path/to/ebc && node tests/load/slos.js >> logs/slos.log 2>&1
```

## 5. Load Testing

Run a load test:
```bash
node tests/load/loadtest.js
```

Configure:
```bash
CONCURRENCY=20 REQUESTS_PER_USER=25 node tests/load/loadtest.js
BASE_URL=http://production.example.com node tests/load/loadtest.js
```

Targets tested:
- 10 concurrent users, 10 requests each (100 total)
- 20 concurrent users, 25 requests each (500 total)
- Expected: p95 < 5s, refusal < 5%, error < 1%

## 6. Security Audit

Run the security audit:
```bash
node tests/security/security-audit.js
```

Tests cover:
- XSS injection in queries
- Path traversal in URLs
- SQL injection via query text
- SSRF via document_id parameter
- Payload size limits
- Invalid JSON handling
- Header injection protection
- Source map exposure
- Demo flag exposure from corpus API

## 7. Backup Procedures

### Corpus Data Backup
The corpus is stored in:
- `data/legal_corpus.json` (seed corpus)
- `data/local_corpus.json` (user-ingested documents, auto-created)

Backup script:
```bash
# Daily backup
cp data/legal_corpus.json backups/corpus-$(date +%Y%m%d).json
cp data/local_corpus.json backups/local-$(date +%Y%m%d).json 2>/dev/null || true
```

### Analytics Data Backup
Analytics are in-memory. For production, connect Redis:
```bash
# Redis persistence is configured via redis.conf
redis-cli BGSAVE
```

### Full System Backup
```bash
# Archive the entire working directory
tar -czf ebc-backup-$(date +%Y%m%d).tar.gz \
  --exclude=node_modules \
  --exclude=backups \
  .
```

## 8. Disaster Recovery

### Scenario: Server crash
1. Check logs: `node server.js 2>&1 | tee server.log`
2. Restart: `npm start`
3. Verify health: `curl http://localhost:5174/api/health`

### Scenario: Corpus corruption
```bash
# Restore from latest backup
cp backups/corpus-20260709.json data/legal_corpus.json
# Restart server
npm start
```

### Scenario: Redis failure
The application falls back gracefully — cache is non-blocking.
1. Check Redis: `redis-cli ping`
2. Restart Redis: `redis-server`
3. Cache will repopulate on next queries.

### Scenario: Data loss (full restore)
```bash
# 1. Stop the server
# 2. Restore from backup
tar -xzf ebc-backup-20260709.tar.gz
# 3. Install dependencies
npm install
# 4. Start the server
npm start
# 5. Run health check
node tests/load/slos.js
```

## 9. Logs & Debugging

### Application Logs
Standard output (stdout) contains all logs:
```bash
node server.js 2>&1 | tee -a logs/server.log
```

### Audit Trail
Query audit is available at:
```bash
curl http://localhost:5174/api/audit?limit=100
```

### Latency Summary
```bash
curl http://localhost:5174/api/latency
curl "http://localhost:5174/api/latency?operation=chat"
```

### Feedback Summary
```bash
curl http://localhost:5174/api/feedback
```

## 10. Evaluation

### Standard Evaluation (10 cases)
```bash
node tests/eval/evaluate.js
```

### Expanded Evaluation (100+ cases)
```bash
node tests/eval/evaluation-suite-v2.js
```
Results exported to `tests/eval/results-v2.json`.

### Unit Tests
```bash
npm test
# or
node --test
```

## 11. Capacity Planning

| Metric | Current | Production Target |
|--------|---------|-------------------|
| Documents | 9 | 26,00,000+ |
| Chunks | 14 | ~10,000,000 |
| Courts | 4 | All Indian courts |
| Acts | 5 | All statutes |

Production scaling requires:
- PostgreSQL for persistent corpus storage
- OpenSearch for BM25 + vector search
- Qdrant for dedicated vector similarity
- Cross-encoder reranker model
- Bedrock or self-hosted LLM for summarization
- S3 for document storage
- SQS for ingestion pipeline
- ECS/EKS for container orchestration
- CloudWatch for monitoring and alerting

## 12. Incident Response

### Severity Levels
| Level | Definition | Response Time |
|-------|------------|---------------|
| P0 | Service down / major outage | < 15 min |
| P1 | Partial outage / high error rate | < 1 hour |
| P2 | Degraded performance | < 4 hours |
| P3 | Minor issues / cosmetic | Next business day |

### Incident Response Steps
1. **Detect**: SLO monitor alerts via webhook
2. **Triage**: Health check + load test
3. **Mitigate**: Restart service / restore backup / scale resources
4. **Resolve**: Deploy fix, verify with evaluation suite
5. **Review**: Post-mortem, update runbook

### Escalation Contacts
- Engineering: #ebc-legal-ai-eng (Slack)
- Operations: #ebc-ops (Slack)
- On-call: PagerDuty schedule
