-- Fase 8a: assistente de IA (opt-in por escritório) e registro de consumo.
ALTER TABLE organizations ADD COLUMN ai_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid,
  case_id uuid,
  feature text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_tokens_chk CHECK (input_tokens >= 0 AND output_tokens >= 0)
);
CREATE INDEX ai_usage_org_created_idx ON ai_usage (organization_id, created_at DESC);
