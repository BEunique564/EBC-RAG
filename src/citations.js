const REQUIRED_BY_TYPE = {
  judgment: ["document_id", "title", "court", "year", "citation", "source_url"],
  statute: ["document_id", "title", "year", "act", "section", "source_url"],
  commentary: ["document_id", "title", "publisher", "year", "source_url"],
  notification: ["document_id", "title", "year", "source_url"]
};

export function verifyCitationMetadata(citation) {
  const checks = {};
  checks.document_id = Boolean(citation.document_id);
  checks.title = Boolean(citation.title);
  checks.court = Boolean(citation.court);
  checks.year = Boolean(citation.year);
  checks.citation = Boolean(citation.citation);
  checks.source_url = Boolean(citation.source_url && !citation.source_url.startsWith("local://"));
  checks.pdf_url = Boolean(citation.source_pdf_url && !citation.source_pdf_url.startsWith("local://"));
  checks.reader_url = Boolean(citation.ebc_reader_url && !citation.ebc_reader_url.startsWith("local://"));
  checks.judge_or_bench = Boolean(citation.judge || citation.bench);
  checks.paragraph = Boolean(citation.paragraph);
  checks.pdf_page = Boolean(citation.pdf_page);
  return {
    all_required: checks.document_id && checks.title && checks.court && checks.year && checks.citation,
    has_pdf_link: checks.pdf_url,
    has_reader_link: checks.reader_url,
    has_locator: checks.paragraph || checks.pdf_page,
    has_judge: checks.judge_or_bench,
    is_demo: !checks.source_url && !checks.pdf_url && !checks.reader_url,
    missing: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  };
}

export function buildCitation(document, chunk, rank, score) {
  const citation = {
    source_id: `S${rank}`,
    document_id: document.document_id,
    title: document.title,
    court: document.court || "",
    judge: document.judge || "",
    citation: document.citation || "",
    year: document.year || "",
    bench: document.bench || "",
    act: chunk.act || document.act || "",
    section: chunk.section || document.section || "",
    paragraph: chunk.paragraph || "",
    pdf_page: chunk.pdf_page || "",
    topic: chunk.topic || document.topic || "",
    document_type: document.document_type || "",
    publisher: document.publisher || "",
    edition: document.edition || "",
    source_url: document.source_url || "",
    source_pdf_url: document.source_pdf_url || "",
    ebc_reader_url: document.ebc_reader_url || "",
    webstore_url: document.webstore_url || "",
    score: Number(score.toFixed(3)),
    snippet: chunk.text
  };
  const verification = verifyCitationMetadata(citation);
  citation.verified = verification.all_required;
  citation.document_url = verification.has_pdf_link ? document.source_pdf_url :
    verification.has_reader_link ? document.ebc_reader_url :
    document.source_url || "";
  citation.pdf_deeplink = citation.paragraph && citation.document_url ?
    `${citation.document_url}#page=${citation.pdf_page || 1}` : citation.document_url;
  return citation;
}

export function validateCitation(citation) {
  const required = REQUIRED_BY_TYPE[citation.document_type] || ["document_id", "title", "year", "source_url"];
  const missing = required.filter((field) => !citation[field]);
  const needsLocator = citation.document_type === "judgment" || citation.document_type === "commentary";

  if (needsLocator && !citation.paragraph && !citation.pdf_page) {
    missing.push("paragraph_or_pdf_page");
  }

  if (citation.document_type === "judgment" && !citation.judge && !citation.bench) {
    missing.push("judge_or_bench");
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

export function validateEvidence(citations) {
  const checked = citations.map((citation) => ({
    source_id: citation.source_id,
    ...validateCitation(citation)
  }));

  return {
    valid: checked.length > 0 && checked.every((item) => item.valid),
    checked
  };
}
