const REQUIRED_BY_TYPE = {
  judgment: ["document_id", "title", "court", "year", "citation", "source_url"],
  statute: ["document_id", "title", "year", "act", "section", "source_url"],
  commentary: ["document_id", "title", "publisher", "year", "source_url"],
  notification: ["document_id", "title", "year", "source_url"]
};

export function buildCitation(document, chunk, rank, score) {
  return {
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
