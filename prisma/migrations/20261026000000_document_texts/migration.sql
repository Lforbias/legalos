-- Fase 8b: texto extraído dos documentos (texto embutido, OCR local) para busca e para a IA.
CREATE TYPE "DocumentTextStatus" AS ENUM ('EXTRACTED', 'EMPTY', 'UNAVAILABLE', 'FAILED');

CREATE TABLE document_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version integer NOT NULL,
  status "DocumentTextStatus" NOT NULL,
  method text,
  content text NOT NULL DEFAULT '',
  search_text text NOT NULL DEFAULT '',
  pages integer,
  error text,
  extracted_by_id uuid,
  extracted_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT document_texts_doc_version_key UNIQUE (document_id, version),
  CONSTRAINT document_texts_doc_fk FOREIGN KEY (document_id, organization_id) REFERENCES documents (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT document_texts_org_fk FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);
CREATE INDEX document_texts_org_idx ON document_texts (organization_id);
CREATE INDEX document_texts_fts_idx ON document_texts USING gin (to_tsvector('portuguese', search_text));
