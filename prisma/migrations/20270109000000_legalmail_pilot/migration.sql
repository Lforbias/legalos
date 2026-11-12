CREATE TABLE legalmail_pilot (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_key_enc text
);
