CREATE TABLE rute_memories (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
 case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
 body text NOT NULL,
 archived_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(case_id IS NULL OR client_id IS NOT NULL)
);
CREATE INDEX rute_memories_owner ON rute_memories(organization_id,user_id,updated_at);
