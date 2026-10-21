-- LegalOS: Fase 5 — versões de documentos, modelos com campos de mesclagem e fluxo de peticionamento.
-- Mantida em sincronia manual com prisma/schema.prisma. FKs compostas (id, organization_id).

CREATE TYPE "PetitionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUBMITTING', 'SUBMITTED', 'FAILED', 'CANCELED');
CREATE TYPE "DocumentVersionSource" AS ENUM ('UPLOAD', 'TEMPLATE');

-- ---------- modelos ----------
CREATE TABLE document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT document_templates_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT document_templates_body_len CHECK (char_length(body) BETWEEN 1 AND 100000)
);
CREATE UNIQUE INDEX document_templates_name_key ON document_templates (organization_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX document_templates_org_idx ON document_templates (organization_id) WHERE deleted_at IS NULL;

-- ---------- documentos: metadados e versão corrente ----------
ALTER TABLE documents ADD COLUMN category text;
ALTER TABLE documents ADD COLUMN description text;
ALTER TABLE documents ADD COLUMN current_version integer NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN template_id uuid;
ALTER TABLE documents ADD COLUMN updated_at timestamptz(3) NOT NULL DEFAULT now();
ALTER TABLE documents ADD CONSTRAINT documents_template_fk FOREIGN KEY (template_id, organization_id) REFERENCES document_templates (id, organization_id) ON DELETE RESTRICT;
ALTER TABLE documents ADD CONSTRAINT documents_current_version_chk CHECK (current_version >= 1);

CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  version integer NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  storage_key text NOT NULL,
  source "DocumentVersionSource" NOT NULL DEFAULT 'UPLOAD',
  note text,
  uploaded_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT document_versions_doc_ver_key UNIQUE (document_id, version),
  CONSTRAINT document_versions_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT document_versions_size_chk CHECK (size_bytes > 0 AND version >= 1),
  FOREIGN KEY (document_id, organization_id) REFERENCES documents (id, organization_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX document_versions_storage_key_key ON document_versions (storage_key);
CREATE INDEX document_versions_org_idx ON document_versions (organization_id);

-- versão 1 dos documentos já existentes (mesmo arquivo; nenhuma cópia de armazenamento)
INSERT INTO document_versions (organization_id, document_id, version, file_name, mime_type, size_bytes, sha256, storage_key, source, uploaded_by_id, created_at)
SELECT organization_id, id, 1, name, mime_type, size_bytes, sha256, storage_key, 'UPLOAD', uploaded_by_id, created_at FROM documents;

-- ---------- peticionamento ----------
CREATE TABLE petition_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  case_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version integer NOT NULL,
  title text NOT NULL,
  kind text,
  court text,
  status "PetitionStatus" NOT NULL DEFAULT 'DRAFT',
  adapter text,
  is_demo boolean NOT NULL DEFAULT false,
  protocol text,
  receipt text,
  error text,
  review_note text,
  author_id uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewer_id uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at timestamptz(3),
  submitted_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  submitted_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT petition_filings_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT petition_filings_submitted_chk CHECK (status <> 'SUBMITTED' OR (protocol IS NOT NULL AND submitted_at IS NOT NULL AND adapter IS NOT NULL)),
  CONSTRAINT petition_filings_version_chk CHECK (document_version >= 1),
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id, organization_id) REFERENCES documents (id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX petition_filings_org_status_idx ON petition_filings (organization_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX petition_filings_case_idx ON petition_filings (case_id) WHERE deleted_at IS NULL;
CREATE INDEX petition_filings_document_idx ON petition_filings (document_id);

-- ---------- permissões: novo "templates:manage" e petições para assistente/controladoria em escritórios existentes ----------
UPDATE roles SET permissions = array_append(permissions, 'templates:manage')
 WHERE is_system AND key IN ('OWNER', 'ADMIN', 'LAWYER') AND NOT ('templates:manage' = ANY(permissions));
UPDATE roles SET permissions = array_append(permissions, 'petitions:read')
 WHERE is_system AND key = 'ASSISTANT' AND NOT ('petitions:read' = ANY(permissions));
UPDATE roles SET permissions = array_append(permissions, 'petitions:write')
 WHERE is_system AND key IN ('ASSISTANT', 'CONTROLLER') AND NOT ('petitions:write' = ANY(permissions));
