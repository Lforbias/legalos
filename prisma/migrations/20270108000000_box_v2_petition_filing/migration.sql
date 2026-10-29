-- Box 2.0 — peticionamento: estados com prova oficial, tentativas e recibos.
-- Aditiva e compatível: o código antigo ignora as colunas/tabelas novas; os valores novos do enum só são gravados pelo código novo.
-- (Nenhum valor novo do enum é usado nesta migration: o Postgres exige commit antes de usar um valor recém-criado.)

ALTER TYPE "PetitionStatus" ADD VALUE IF NOT EXISTS 'AWAITING_CONFIRMATION';
ALTER TYPE "PetitionStatus" ADD VALUE IF NOT EXISTS 'FILED_CONFIRMED';
ALTER TYPE "PetitionStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN';

ALTER TABLE petition_filings
  ADD COLUMN filing_environment TEXT,
  ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN confirmed_at TIMESTAMPTZ(3),
  ADD COLUMN unknown_since TIMESTAMPTZ(3),
  ADD CONSTRAINT petition_filings_filing_environment_chk CHECK (filing_environment IS NULL OR filing_environment IN ('DEMO', 'SIMULATED', 'HOMOLOGATION', 'PRODUCTION'));

UPDATE petition_filings SET filing_environment = 'DEMO' WHERE is_demo AND filing_environment IS NULL;

-- Uma tentativa de envio. Nunca é apagada nem reescrita depois de concluída: é o histórico que impede "reenvio às cegas".
CREATE TABLE petition_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  petition_id      UUID NOT NULL REFERENCES petition_filings(id) ON DELETE CASCADE,
  attempt_no       INTEGER NOT NULL,
  adapter          TEXT NOT NULL,
  environment      TEXT NOT NULL,
  manifest_sha256  TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  outcome          TEXT NOT NULL DEFAULT 'STARTED',
  error_code       TEXT,
  error_message    TEXT,
  started_by_id    UUID,
  started_at       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ(3),
  resolution       TEXT,
  resolved_by_id   UUID,
  resolved_at      TIMESTAMPTZ(3),
  CONSTRAINT petition_attempts_outcome_chk CHECK (outcome IN ('STARTED', 'CONFIRMED', 'REJECTED', 'UNCERTAIN', 'ABORTED')),
  CONSTRAINT petition_attempts_environment_chk CHECK (environment IN ('DEMO', 'SIMULATED', 'HOMOLOGATION', 'PRODUCTION')),
  CONSTRAINT petition_attempts_resolution_chk CHECK (resolution IS NULL OR resolution IN ('FILED', 'NOT_FILED')),
  UNIQUE (petition_id, attempt_no)
);
CREATE INDEX petition_attempts_org_idx ON petition_attempts(organization_id, petition_id);
-- No máximo UMA tentativa em andamento por petição: impede envio duplo concorrente mesmo se o código falhar.
CREATE UNIQUE INDEX petition_attempts_one_open ON petition_attempts(petition_id) WHERE outcome = 'STARTED';

-- Recibo / prova do protocolo. No máximo um por petição (uma petição não é protocolada duas vezes).
CREATE TABLE petition_receipts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  petition_id           UUID NOT NULL REFERENCES petition_filings(id) ON DELETE CASCADE,
  attempt_id            UUID REFERENCES petition_attempts(id) ON DELETE SET NULL,
  source                TEXT NOT NULL,
  environment           TEXT NOT NULL,
  protocol              TEXT NOT NULL,
  receipt_text          TEXT,
  receipt_sha256        TEXT,
  receipt_document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
  filed_at              TIMESTAMPTZ(3),
  recorded_by_id        UUID,
  note                  TEXT,
  created_at            TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT petition_receipts_source_chk CHECK (source IN ('OFFICIAL_RESPONSE', 'MANUAL_ATTESTATION')),
  CONSTRAINT petition_receipts_environment_chk CHECK (environment IN ('SIMULATED', 'HOMOLOGATION', 'PRODUCTION')),
  -- confirmação oficial exige prova: texto do recibo do tribunal OU o documento do recibo
  CONSTRAINT petition_receipts_proof_chk CHECK (receipt_text IS NOT NULL OR receipt_document_id IS NOT NULL),
  UNIQUE (petition_id)
);
CREATE INDEX petition_receipts_org_idx ON petition_receipts(organization_id, created_at DESC);
