-- Additive workspace tools. No channel is enabled and no message is sent by migration.
CREATE TABLE chat_workspace_settings (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 ai_assist_enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE chat_resources (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('KNOWLEDGE','MACRO','VIEW')),
 name text NOT NULL,
 payload jsonb NOT NULL,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id, kind, name)
);
CREATE INDEX chat_resources_org_kind ON chat_resources(organization_id, kind);
CREATE TABLE chat_presence (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 typing boolean NOT NULL DEFAULT false,
 touched_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (conversation_id,user_id)
);
CREATE TABLE chat_contact_controls (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
 wa_id text NOT NULL,
 blocked boolean NOT NULL DEFAULT false,
 reason text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,account_id,wa_id)
);
CREATE TABLE chat_contact_events (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('CONSENT','WITHDRAWAL','DELETION_REQUEST','ATTRIBUTION','AI_CLASSIFICATION')),
 payload jsonb NOT NULL,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_contact_events_lookup ON chat_contact_events(organization_id,conversation_id,created_at DESC);
ALTER TABLE whatsapp_campaign_recipients ADD COLUMN message_id uuid REFERENCES whatsapp_messages(id) ON DELETE SET NULL;
CREATE INDEX whatsapp_campaign_recipient_message ON whatsapp_campaign_recipients(message_id);
