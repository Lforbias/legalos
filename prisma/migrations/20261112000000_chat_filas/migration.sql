-- LegalOS Chat, fase 2: filas de atendimento, disponibilidade dos atendentes e distribuição automática.
CREATE TABLE whatsapp_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  team_id uuid REFERENCES work_teams(id) ON DELETE SET NULL,
  strategy text NOT NULL DEFAULT 'ROUND_ROBIN',
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_queues_strategy_chk CHECK (strategy IN ('ROUND_ROBIN', 'LEAST_LOAD', 'MANUAL'))
);
CREATE UNIQUE INDEX whatsapp_queues_org_name_key ON whatsapp_queues (organization_id, lower(name));
CREATE UNIQUE INDEX whatsapp_queues_one_default_key ON whatsapp_queues (organization_id) WHERE is_default;

CREATE TABLE whatsapp_agents (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE whatsapp_conversations
  ADD COLUMN queue_id uuid REFERENCES whatsapp_queues(id) ON DELETE SET NULL,
  ADD COLUMN assigned_at timestamptz(3);
CREATE INDEX whatsapp_conversations_queue_id_idx ON whatsapp_conversations (queue_id);
CREATE INDEX whatsapp_conversations_assigned_idx ON whatsapp_conversations (organization_id, assigned_to_id, status);
