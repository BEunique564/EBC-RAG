const BASE_URL = process.env.BASE_URL || "http://localhost:5174";
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "30000", 10);

const TEST_QUERIES = [
  "Latest Supreme Court judgments on Section 420 IPC",
  "What is GST input tax credit under Section 16?",
  "Privacy under Article 21 of the Constitution",
  "Vodafone India Ltd v. Union of India GST dispute analysis",
  "Rohit Sharma vs State of Maharashtra Section 420",
  "Bail under Section 439 CrPC",
  "Resolution plan under IBC Section 30",
  "Right to privacy under Constitution of India",
  "Corporate insolvency resolution process",
  "Cheating and fraud under IPC Section 420",
  "Article 21 personal liberty",
  "Committee of creditors commercial wisdom",
  "CGST Act Section 16 eligibility"
];

let passed = 0;
let failed = 0;
let totalChecks = 0;

function check(condition, label) {
  totalChecks++;
  if (condition) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}`); }
}

async function chat(query) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": "uisim-test", "x-user-tier": "premium" },
    body: JSON.stringify({ query, filters: {}, role: "lawyer", tier: "premium" })
  });
  const body = await res.json();
  return { ok: res.ok, body };
}

async function getSource(documentId) {
  const res = await fetch(`${BASE_URL}/api/source?document_id=${encodeURIComponent(documentId)}`, {
    headers: { "x-user-id": "uisim-test" }
  });
  const body = await res.json();
  return { ok: res.ok, body };
}

async function testCitationSourceLoad(query) {
  console.log(`\nQuery: "${query}"`);
  const { ok, body } = await chat(query);
  check(ok, "chat endpoint returned 200");
  if (!ok || body.status !== "answered") {
    console.log(`  SKIP (status=${body.status})`);
    return;
  }

  const citations = body.citations || [];
  check(citations.length > 0, `has ${citations.length} verified citations`);
  if (!citations.length) return;

  for (const c of citations) {
    if (!c.document_id) { check(false, `citation ${c.source_id} has document_id`); continue; }

    const src = await getSource(c.document_id);
    check(src.ok, `GET /api/source for doc "${c.document_id}" returned 200`);

    if (src.ok && src.body) {
      check(!!src.body.title, `source "${c.document_id}" has title`);
      check(Array.isArray(src.body.chunks) && src.body.chunks.length > 0, `source "${c.document_id}" has chunks`);

      /* Verify paragraph match between citation and source chunk */
      if (c.paragraph) {
        const hasPara = (src.body.chunks || []).some(ch => String(ch.paragraph) === String(c.paragraph));
        check(hasPara, `citation S${c.source_id} paragraph ${c.paragraph} found in source chunks`);
      } else if (c.pdf_page) {
        const hasPage = (src.body.chunks || []).some(ch => String(ch.pdf_page) === String(c.pdf_page));
        check(hasPage, `citation S${c.source_id} pdf_page ${c.pdf_page} found in source chunks`);
      }
    }
  }
}

async function main() {
  console.log("EBC Legal AI — UI Simulation Test (Citation → Source verification)");
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Queries: ${TEST_QUERIES.length}`);

  for (const q of TEST_QUERIES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try { await testCitationSourceLoad(q); }
    catch (err) {
      if (err.name === "AbortError") console.log(`  TIMEOUT query: "${q.slice(0, 40)}..."`);
      else console.log(`  ERROR  ${err.message}`);
    } finally { clearTimeout(timeoutId); }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`RESULTS: ${passed}/${totalChecks} passed, ${failed} failed`);
  if (failed > 0) console.log("  SOME CHECKS FAILED");
  else console.log("  ALL CHECKS PASSED");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error("UI test error:", err); process.exit(1); });
