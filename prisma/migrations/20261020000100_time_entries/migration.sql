-- LegalOS: Fase 3 (complemento) — registro de horas para "Equipe e produtividade".
CREATE TABLE time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  case_id uuid,
  entry_date date NOT NULL,
  minutes integer NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
  description text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX time_entries_user_date_idx ON time_entries (organization_id, user_id, entry_date) WHERE deleted_at IS NULL;
