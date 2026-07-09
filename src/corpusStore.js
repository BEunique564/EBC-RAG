import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tokenize, tokenCounts } from "./tokenize.js";

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeDocument(document) {
  return {
    ...document,
    chunks: (document.chunks || []).map((chunk, index) => ({
      chunk_id: chunk.chunk_id || `${document.document_id}-chunk-${index + 1}`,
      document_id: document.document_id,
      chunk_number: index + 1,
      act: chunk.act || document.act || "",
      section: chunk.section || document.section || "",
      topic: chunk.topic || document.topic || "",
      paragraph: chunk.paragraph || "",
      pdf_page: chunk.pdf_page || "",
      text: String(chunk.text || "")
    }))
  };
}

function createIndex(documents) {
  const chunks = [];
  const docById = new Map();
  const documentFrequency = new Map();

  for (const rawDocument of documents) {
    const document = normalizeDocument(rawDocument);
    docById.set(document.document_id, document);

    for (const chunk of document.chunks) {
      const combinedText = [
        document.title,
        document.citation,
        document.court,
        document.act,
        document.topic,
        chunk.section,
        chunk.text
      ].filter(Boolean).join(" ");

      const tokens = tokenize(combinedText);
      const counts = tokenCounts(tokens);
      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
      }

      chunks.push({
        ...chunk,
        document,
        tokens,
        counts,
        length: tokens.length || 1
      });
    }
  }

  const averageLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0) / Math.max(chunks.length, 1);

  return {
    documents,
    chunks,
    docById,
    documentFrequency,
    averageLength
  };
}

export async function buildCorpusStore({ seedCorpusPath, localCorpusPath }) {
  const seed = await readJsonIfExists(seedCorpusPath, { documents: [] });
  const local = await readJsonIfExists(localCorpusPath, { documents: [] });
  let documents = [...(seed.documents || []), ...(local.documents || [])].map(normalizeDocument);
  let index = createIndex(documents);

  return {
    getDocuments() {
      return documents;
    },
    getChunks() {
      return index.chunks;
    },
    getIndex() {
      return index;
    },
    async addDocument(document) {
      documents = [...documents, normalizeDocument(document)];
      index = createIndex(documents);
      const localDocuments = documents.filter((item) => !item.seed_document);
      await mkdir(path.dirname(localCorpusPath), { recursive: true });
      await writeFile(localCorpusPath, JSON.stringify({ documents: localDocuments }, null, 2));
    }
  };
}
