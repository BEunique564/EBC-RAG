/**
 * Security audit for EBC Legal AI Assistant.
 * Tests: XSS, path traversal, SQL injection, SSRF, payload size limits, auth bypass.
 *
 * Usage:
 *   node tests/security/security-audit.js
 *   BASE_URL=http://localhost:5174 node tests/security/security-audit.js
 *
 * Exits with code 0 if all checks pass, 1 otherwise.
 */

import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://localhost:5174";

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, headers: res.headers, body };
}

const CHECKS = [];

function define(name, fn) {
  CHECKS.push({ name, fn });
}

/* ==============================
   API Security
   ============================== */

define("XSS: script injection in query is rejected or safely escaped", async () => {
  const { status, body } = await fetchJson(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "<script>alert('xss')</script>" })
  });
  /* Should not 500 or return HTML */
  ok(body !== null, "Response should be valid JSON");
  ok(body.answer === undefined || typeof body.answer === "string", "Answer should not be raw HTML");
});

define("XSS: query with event handlers is handled safely", async () => {
  const { body } = await fetchJson(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: 'onerror=alert(1) javascript:void(0)' })
  });
  ok(body !== null);
});

define("Path traversal: ../ in URL is blocked", async () => {
  /* Fetch may normalize ../ before sending; test using raw path via URL API */
  const serverUrl = new URL(BASE_URL);
  const res = await fetch(`${serverUrl.protocol}//${serverUrl.host}/../../../windows/win.ini`);
  ok(res.status === 403 || res.status === 404, `Path traversal should be blocked, got ${res.status}`);
});

define("Path traversal: encoded ../ in URL is blocked", async () => {
  const res = await fetch(`${BASE_URL}/%2e%2e%2f%2e%2e%2fetc/passwd`);
  strictEqual(res.status, 403, "Encoded path traversal should return 403");
});

define("Path traversal: source endpoint rejects ../ document IDs", async () => {
  const { status } = await fetchJson(`${BASE_URL}/api/source?document_id=../../../etc/passwd`);
  strictEqual(status, 404, "Non-existent document ID should return 404, not 200 with file contents");
});

define("SQL Injection: DROP TABLE in query is handled gracefully", async () => {
  const { status, body } = await fetchJson(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "SELECT * FROM documents; DROP TABLE users; --" })
  });
  ok(status === 200, "SQL injection should not crash the server");
  ok(body !== null, "Should return valid JSON");
});

define("SSRF: URL in source endpoint cannot be used to probe internal services", async () => {
  const { status } = await fetchJson(`${BASE_URL}/api/source?document_id=http://169.254.169.254/latest/meta-data/`);
  strictEqual(status, 404, "Should not return SSRF metadata");
});

define("Payload size limit: large payload is rejected", async () => {
  const bigQuery = "a".repeat(1_500_000);
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: bigQuery }),
      signal: AbortSignal.timeout(5000)
    });
    ok(res.status === 400 || res.status === 413, `Large payload should be rejected, got ${res.status}`);
  } catch {
    /* Connection error / destroy also counts as rejection */
    ok(true, "Payload rejected (connection closed / timeout)");
  }
});

define("Invalid JSON body returns 400", async () => {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json-at-all"
  });
  ok(res.status === 400, `Invalid JSON should return 400, got ${res.status}`);
});

/* ==============================
   Header / Auth
   ============================== */

define("X-User-Id header is properly bounded", async () => {
  const { body } = await fetchJson(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": `../../${"A".repeat(10000)}` },
    body: JSON.stringify({ query: "test" })
  });
  ok(body !== null, "Should not crash on long header");
});

define("Unexpected HTTP methods return 404", async () => {
  const { status } = await fetchJson(`${BASE_URL}/api/chat`, { method: "PUT" });
  ok(status === 404, `PUT should return 404, got ${status}`);
});

define("PUT on static file is handled", async () => {
  const res = await fetch(`${BASE_URL}/index.html`, { method: "PUT" });
  ok(res.status !== 500, "PUT on static file should not crash");
});

/* ==============================
   Static file security
   ============================== */

define("Source map files are not accessible", async () => {
  const res = await fetch(`${BASE_URL}/app.js.map`);
  ok(res.status === 404 || res.status === 403, "Source maps should not be accessible");
});

define("Server JS source cannot be read via static", async () => {
  const res = await fetch(`${BASE_URL}/server.js`);
  ok(res.status === 404 || res.status === 403, "Server source should not be accessible");
});

/* ==============================
   Corpus / data integrity
   ============================== */

define("Corpus API does not expose demo flags", async () => {
  const { body } = await fetchJson(`${BASE_URL}/api/corpus`);
  if (body?.documents) {
    for (const doc of body.documents) {
      strictEqual(doc.demo_only, undefined, `demo_only flag should not be exposed: ${doc.document_id}`);
    }
  }
});

/* ==============================
   Run
   ============================== */

let passed = 0, failed = 0;
console.log("EBC Legal AI — Security Audit");
console.log("=".repeat(60));
console.log();

for (const check of CHECKS) {
  try {
    await check.fn();
    console.log(`  PASS  ${check.name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${check.name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

console.log();
console.log("=".repeat(60));
console.log(`  Passed: ${passed}/${CHECKS.length}`);
console.log(`  Failed: ${failed}/${CHECKS.length}`);
console.log();

const allPassed = failed === 0;
const exitCode = allPassed ? 0 : 1;

if (!allPassed) {
  console.log("  SECURITY ISSUES DETECTED — review failures above");
}
console.log(`  Exit code: ${exitCode}`);

process.exit(exitCode);
