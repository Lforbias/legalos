-- Chaves da API pública (/api/v1): só o hash do segredo é guardado; o segredo aparece uma única vez, na criação.
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at timestamptz(3),
  last_used_at timestamptz(3),
  revoked_at timestamptz(3),
  revoked_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_prefix_key UNIQUE (prefix),
  CONSTRAINT api_keys_scopes_chk CHECK (cardinality(scopes) BETWEEN 1 AND 10)
);
CREATE INDEX api_keys_org_idx ON api_keys (organization_id);
