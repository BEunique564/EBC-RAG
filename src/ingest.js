import crypto from "node:crypto";

function requiredString(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function paragraphChunks(text, document) {
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let buffer = [];
  let chunkNumber = 1;

  for (const paragraph of paragraphs) {
    buffer.push(paragraph);
    const wordCount = buffer.join(" ").split(/\s+/).length;
    if (wordCount >= 140) {
      chunks.push({
        chunk_id: `${document.document_id}-chunk-${chunkNumber}`,
        paragraph: String(chunkNumber),
        pdf_page: "",
        act: document.act || "",
        section: document.section || "",
        topic: document.topic || "",
        text: buffer.join("\n\n")
      });
      buffer = [];
      chunkNumber += 1;
    }
  }

  if (buffer.length) {
    chunks.push({
      chunk_id: `${document.document_id}-chunk-${chunkNumber}`,
      paragraph: String(chunkNumber),
      pdf_page: "",
      act: document.act || "",
      section: document.section || "",
      topic: document.topic || "",
      text: buffer.join("\n\n")
    });
  }

  return chunks;
}

export function ingestDocument(payload) {
  const metadata = payload.metadata || {};
  const title = requiredString(payload.title || metadata.title, "title");
  const text = requiredString(payload.text, "text");
  const documentType = String(metadata.document_type || payload.document_type || "commentary").trim().toLowerCase();
  const documentId = metadata.document_id || crypto.createHash("sha256").update(`${title}:${Date.now()}`).digest("hex").slice(0, 16);

  const document = {
    document_id: documentId,
    title,
    court: metadata.court || "",
    judge: metadata.judge || "",
    citation: metadata.citation || "",
    citation_type: metadata.citation_type || "",
    year: metadata.year || new Date().getFullYear(),
    bench: metadata.bench || "",
    act: metadata.act || "",
    section: metadata.section || "",
    topic: metadata.topic || "",
    chapter: metadata.chapter || "",
    document_type: documentType,
    language: metadata.language || "en",
    publisher: metadata.publisher || "Local upload",
    edition: metadata.edition || "",
    source_url: metadata.source_url || "local://uploaded-document",
    s3_url: metadata.s3_url || "",
    embedding_version: metadata.embedding_version || "local-tfidf-v1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    demo_only: false
  };

  document.chunks = paragraphChunks(text, document);
  if (!document.chunks.length) {
    throw new Error("text did not contain any indexable content.");
  }

  return document;
}
