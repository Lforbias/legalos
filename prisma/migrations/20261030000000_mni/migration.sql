-- Motor de tribunais, etapa 1: conexões PJe/MNI por escritório e idempotência das intimações importadas.
ALTER TABLE court_notices ADD COLUMN external_key text;
CREATE UNIQUE INDEX court_notices_org_external_key_uq ON court_notices (organization_id, external_key) WHERE external_key IS NOT NULL;

CREATE TABLE court_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  jtr text NOT NULL,
  endpoint_url text NOT NULL,
  auth_mode text NOT NULL,
  certificate_id uuid REFERENCES certificates(id),
  secret_enc text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz(3),
  last_status text,
  last_message text,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT court_connections_auth_chk CHECK (auth_mode IN ('PASSWORD', 'CERTIFICATE', 'PASSWORD_AND_CERTIFICATE')),
  CONSTRAINT court_connections_cert_chk CHECK (auth_mode = 'PASSWORD' OR certificate_id IS NOT NULL),
  CONSTRAINT court_connections_jtr_chk CHECK (jtr ~ '^[0-9]\.[0-9]{2}$')
);
CREATE INDEX court_connections_org_idx ON court_connections (organization_id);
