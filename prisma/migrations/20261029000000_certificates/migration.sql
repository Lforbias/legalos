-- Fase 10 / etapa 0 do motor de tribunais: cofre de certificados digitais A1 (arquivo .pfx cifrado) e registro de cada uso.
CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  label text NOT NULL,
  subject_cn text NOT NULL,
  document_hint text,
  issuer_cn text,
  serial_number text NOT NULL,
  fingerprint_sha256 text NOT NULL,
  not_before timestamptz(3) NOT NULL,
  not_after timestamptz(3) NOT NULL,
  pfx_enc text NOT NULL,
  pass_enc text NOT NULL,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  revoked_at timestamptz(3),
  revoked_by_id uuid REFERENCES users(id),
  last_used_at timestamptz(3),
  CONSTRAINT certificates_label_chk CHECK (length(label) BETWEEN 1 AND 120),
  CONSTRAINT certificates_validity_chk CHECK (not_after > not_before),
  CONSTRAINT certificates_org_fingerprint_uq UNIQUE (organization_id, fingerprint_sha256)
);
CREATE INDEX certificates_org_idx ON certificates (organization_id, revoked_at);
CREATE INDEX certificates_owner_idx ON certificates (owner_user_id);

CREATE TABLE certificate_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  certificate_id uuid NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  user_id uuid,
  purpose text NOT NULL,
  case_id uuid,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX certificate_usage_cert_idx ON certificate_usage (certificate_id, created_at DESC);

UPDATE roles SET permissions = array_append(permissions, 'certificates:manage')
 WHERE is_system AND key IN ('OWNER', 'ADMIN') AND NOT ('certificates:manage' = ANY(permissions));
