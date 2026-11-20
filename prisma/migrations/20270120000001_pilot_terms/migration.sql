-- MVP: aceite registrado dos termos de uso e privacidade do piloto.
CREATE TABLE pilot_term_acceptances (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version text NOT NULL,
  accepted_at timestamptz(3) NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);
CREATE UNIQUE INDEX pilot_term_acceptances_user_id_version_key ON pilot_term_acceptances(user_id, version);
CREATE INDEX pilot_term_acceptances_organization_id_idx ON pilot_term_acceptances(organization_id);
