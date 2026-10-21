-- Anexos classificados da petição (vários documentos, versão travada na revisão) e autotextos (trechos reutilizáveis).
CREATE TABLE petition_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  petition_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version integer NOT NULL,
  classification text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT petition_attachments_unique UNIQUE (petition_id, document_id),
  CONSTRAINT petition_attachments_version_chk CHECK (document_version >= 1),
  CONSTRAINT petition_attachments_class_chk CHECK (classification IN ('PROCURACAO','DOCUMENTO_PESSOAL','COMPROVANTE_RESIDENCIA','PROVA_DOCUMENTAL','CONTRATO','DECISAO_ANEXA','OUTROS')),
  FOREIGN KEY (petition_id, organization_id) REFERENCES petition_filings (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (document_id, organization_id) REFERENCES documents (id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX petition_attachments_petition_idx ON petition_attachments (petition_id, position);
CREATE INDEX petition_attachments_document_idx ON petition_attachments (document_id);

CREATE TABLE text_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT text_snippets_slug_chk CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60)
);
CREATE UNIQUE INDEX text_snippets_org_slug_key ON text_snippets (organization_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX text_snippets_org_idx ON text_snippets (organization_id) WHERE deleted_at IS NULL;
