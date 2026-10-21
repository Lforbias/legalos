-- Caixa de entrada jurídica: equipes de trabalho, devolução, notas, adormecer e etiquetas nas intimações.
CREATE TABLE work_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT work_teams_name_chk CHECK (char_length(name) BETWEEN 2 AND 60),
  CONSTRAINT work_teams_id_org_uq UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX work_teams_org_name_uq ON work_teams (organization_id, lower(name));

CREATE TABLE work_team_members (
  team_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id, organization_id) REFERENCES work_teams (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX work_team_members_user_idx ON work_team_members (user_id);

ALTER TABLE court_notices
  ADD COLUMN team_id uuid,
  ADD COLUMN assigned_by_id uuid REFERENCES users(id),
  ADD COLUMN snoozed_until date,
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT court_notices_team_fk FOREIGN KEY (team_id, organization_id) REFERENCES work_teams (id, organization_id) ON DELETE SET NULL (team_id),
  ADD CONSTRAINT court_notices_one_owner_chk CHECK (assignee_id IS NULL OR team_id IS NULL),
  ADD CONSTRAINT court_notices_tags_chk CHECK (cardinality(tags) <= 10);
CREATE INDEX court_notices_org_team_idx ON court_notices (organization_id, team_id) WHERE team_id IS NOT NULL;

CREATE TABLE notice_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notice_id uuid NOT NULL REFERENCES court_notices(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT notice_notes_body_chk CHECK (char_length(body) BETWEEN 1 AND 2000)
);
CREATE INDEX notice_notes_notice_idx ON notice_notes (notice_id, created_at);
