CREATE TABLE documents (
  document_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  court TEXT,
  judge TEXT,
  citation TEXT,
  citation_type TEXT,
  year INTEGER,
  bench TEXT,
  act TEXT,
  section TEXT,
  topic TEXT,
  chapter TEXT,
  document_type TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  publisher TEXT,
  edition TEXT,
  source_url TEXT,
  s3_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  chunk_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(document_id),
  chunk_number INTEGER NOT NULL,
  paragraph TEXT,
  pdf_page TEXT,
  act TEXT,
  section TEXT,
  topic TEXT,
  text TEXT NOT NULL,
  embedding_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE citations (
  citation_id BIGSERIAL PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(document_id),
  citation_text TEXT NOT NULL,
  citation_type TEXT,
  court TEXT,
  year INTEGER,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  role_id BIGSERIAL PRIMARY KEY,
  role_name TEXT UNIQUE NOT NULL
);

CREATE TABLE users (
  user_id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role_id BIGINT NOT NULL REFERENCES roles(role_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_permissions (
  document_id TEXT NOT NULL REFERENCES documents(document_id),
  role_id BIGINT NOT NULL REFERENCES roles(role_id),
  can_read BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (document_id, role_id)
);

CREATE TABLE search_history (
  search_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(user_id),
  query TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  result_status TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE answer_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  search_id BIGINT REFERENCES search_history(search_id),
  retrieved_chunk_ids TEXT[] NOT NULL,
  citation_validation JSONB NOT NULL,
  answer_text TEXT NOT NULL,
  refusal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feedback (
  feedback_id BIGSERIAL PRIMARY KEY,
  search_id BIGINT REFERENCES search_history(search_id),
  user_id BIGINT REFERENCES users(user_id),
  rating INTEGER,
  correction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_court_year ON documents(court, year);
CREATE INDEX idx_documents_act_section ON documents(act, section);
CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_act_section ON chunks(act, section);
CREATE INDEX idx_search_history_user_created ON search_history(user_id, created_at DESC);
