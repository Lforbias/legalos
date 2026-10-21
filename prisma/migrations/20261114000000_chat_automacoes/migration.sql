-- LegalOS Chat, fase 4: automações (gatilho → ações) nas conversas.
CREATE TABLE whatsapp_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger text NOT NULL,
  trigger_value text,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  once_per_conversation boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_automations_trigger_chk CHECK (trigger IN ('NEW_CONVERSATION', 'KEYWORD', 'OUTSIDE_HOURS', 'LABEL_ADDED'))
);
CREATE UNIQUE INDEX whatsapp_automations_org_name_key ON whatsapp_automations (organization_id, lower(name));
CREATE INDEX whatsapp_automations_trigger_idx ON whatsapp_automations (organization_id, trigger, active);

CREATE TABLE whatsapp_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES whatsapp_automations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  status text NOT NULL DEFAULT 'DONE',
  message text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_automation_runs_status_chk CHECK (status IN ('DONE', 'PARTIAL', 'FAILED'))
);
CREATE UNIQUE INDEX whatsapp_automation_runs_once_key ON whatsapp_automation_runs (automation_id, conversation_id, event_key);
CREATE INDEX whatsapp_automation_runs_org_idx ON whatsapp_automation_runs (organization_id, created_at DESC);
