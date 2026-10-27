CREATE TABLE chat_email_accounts (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
 address text NOT NULL,
 config_enc text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 queue_id uuid REFERENCES whatsapp_queues(id) ON DELETE SET NULL,
 uid_validity text,
 last_uid bigint NOT NULL DEFAULT 0,
 poll_until timestamptz,
 last_checked_at timestamptz,
 last_error text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE chat_email_conversations (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES chat_email_accounts(id) ON DELETE CASCADE,
 contact_email text NOT NULL,
 subject text NOT NULL,
 queue_id uuid REFERENCES whatsapp_queues(id) ON DELETE SET NULL,
 assigned_to_id uuid REFERENCES users(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
 blocked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_email_conversations_org ON chat_email_conversations(organization_id,updated_at DESC);
CREATE TABLE chat_email_messages (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES chat_email_conversations(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES chat_email_accounts(id) ON DELETE CASCADE,
 provider_id text NOT NULL,
 direction text NOT NULL CHECK(direction IN ('IN','OUT','NOTE')),
 body text NOT NULL,
 attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL,
 send_key text,
 request_hash text,
 author_id uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,provider_id),
 UNIQUE(account_id,send_key)
);
CREATE INDEX chat_email_message_conversation ON chat_email_messages(organization_id,conversation_id,created_at);
