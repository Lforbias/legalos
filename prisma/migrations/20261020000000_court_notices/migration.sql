-- LegalOS: Fase 4 — central de intimações (caixa de entrada jurídica).
-- Mantida em sincronia manual com prisma/schema.prisma. FKs compostas (id, organization_id).

CREATE TYPE "NoticeStatus" AS ENUM ('NEW', 'DISTRIBUTED', 'PROCESSED', 'DISCARDED');
CREATE TYPE "NoticeKind" AS ENUM ('INTIMACAO', 'CITACAO', 'DESPACHO', 'DECISAO', 'SENTENCA', 'OUTRO');
CREATE TYPE "NoticeSource" AS ENUM ('MANUAL', 'PASTED', 'FILE', 'IMPORTED');

ALTER TABLE documents ADD CONSTRAINT documents_id_org_key UNIQUE (id, organization_id);

CREATE TABLE court_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  source "NoticeSource" NOT NULL DEFAULT 'MANUAL',
  status "NoticeStatus" NOT NULL DEFAULT 'NEW',
  kind "NoticeKind" NOT NULL DEFAULT 'INTIMACAO',
  title text NOT NULL,
  content text NOT NULL,
  case_number text,
  court text,
  published_at date,
  received_at date NOT NULL,
  case_id uuid,
  assignee_id uuid REFERENCES users (id) ON DELETE SET NULL,
  document_id uuid,
  content_hash text NOT NULL,
  duplicate_of_id uuid,
  discard_reason text,
  processed_at timestamptz(3),
  processed_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT court_notices_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT court_notices_case_number_chk CHECK (case_number IS NULL OR case_number ~ '^[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}$'),
  CONSTRAINT court_notices_discard_chk CHECK (status <> 'DISCARDED' OR discard_reason IS NOT NULL),
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id, organization_id) REFERENCES documents (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (duplicate_of_id, organization_id) REFERENCES court_notices (id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX court_notices_org_status_idx ON court_notices (organization_id, status, received_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX court_notices_hash_idx ON court_notices (organization_id, content_hash) WHERE deleted_at IS NULL;
CREATE INDEX court_notices_case_idx ON court_notices (case_id) WHERE deleted_at IS NULL;
CREATE INDEX court_notices_assignee_idx ON court_notices (assignee_id, status) WHERE deleted_at IS NULL;

ALTER TABLE tasks ADD COLUMN source_notice_id uuid;
ALTER TABLE tasks ADD CONSTRAINT tasks_source_notice_fk FOREIGN KEY (source_notice_id, organization_id) REFERENCES court_notices (id, organization_id) ON DELETE RESTRICT;
ALTER TABLE deadlines ADD COLUMN source_notice_id uuid;
ALTER TABLE deadlines ADD CONSTRAINT deadlines_source_notice_fk FOREIGN KEY (source_notice_id, organization_id) REFERENCES court_notices (id, organization_id) ON DELETE RESTRICT;
