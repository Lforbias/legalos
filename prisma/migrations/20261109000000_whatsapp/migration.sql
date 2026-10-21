-- Atendimento por WhatsApp (API oficial da Meta, Cloud API): números, conversas, mensagens, respostas rápidas e modelos.
CREATE TABLE whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations (id) ON DELETE CASCADE,
  label text NOT NULL,
  phone_number_id text NOT NULL UNIQUE,
  waba_id text,
  display_phone text,
  token_enc text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  away_enabled boolean NOT NULL DEFAULT false,
  away_message text,
  open_from text NOT NULL DEFAULT '09:00',
  open_until text NOT NULL DEFAULT '18:00',
  open_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  last_status text,
  last_message text,
  last_check_at timestamptz(3),
  created_by_id uuid,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_accounts_hours_chk CHECK (open_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND open_until ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE TABLE whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES whatsapp_accounts (id) ON DELETE CASCADE,
  wa_id text NOT NULL,
  contact_name text,
  client_id uuid REFERENCES clients (id) ON DELETE SET NULL,
  assigned_to_id uuid REFERENCES users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'OPEN',
  last_message_at timestamptz(3),
  last_inbound_at timestamptz(3),
  last_away_at timestamptz(3),
  last_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_conversations_status_chk CHECK (status IN ('OPEN', 'CLOSED')),
  CONSTRAINT whatsapp_conversations_uq UNIQUE (account_id, wa_id)
);
CREATE INDEX whatsapp_conversations_org_idx ON whatsapp_conversations (organization_id, status, last_message_at DESC);
CREATE INDEX whatsapp_conversations_client_idx ON whatsapp_conversations (client_id) WHERE client_id IS NOT NULL;

CREATE TABLE whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations (id) ON DELETE CASCADE,
  direction text NOT NULL,
  wa_message_id text,
  type text NOT NULL DEFAULT 'text',
  body text,
  media_key text,
  media_mime text,
  media_name text,
  media_size integer,
  status text NOT NULL,
  error text,
  author_id uuid REFERENCES users (id) ON DELETE SET NULL,
  automatic boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_messages_direction_chk CHECK (direction IN ('IN', 'OUT', 'NOTE')),
  CONSTRAINT whatsapp_messages_status_chk CHECK (status IN ('RECEIVED', 'PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'NOTE'))
);
CREATE UNIQUE INDEX whatsapp_messages_wamid_uq ON whatsapp_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX whatsapp_messages_conv_idx ON whatsapp_messages (conversation_id, created_at);

CREATE TABLE whatsapp_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  shortcut text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_by_id uuid,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_quick_replies_uq UNIQUE (organization_id, shortcut)
);

-- Modelos aprovados pela Meta (únicos que podem iniciar conversa fora da janela de 24 h). Sincronizados pela API.
CREATE TABLE whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  language text NOT NULL,
  category text,
  status text NOT NULL,
  body text NOT NULL,
  variable_count integer NOT NULL DEFAULT 0,
  synced_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_templates_uq UNIQUE (organization_id, name, language)
);

-- Novas permissões nos perfis do sistema.
UPDATE roles SET permissions = permissions || ARRAY['whatsapp:read', 'whatsapp:write', 'whatsapp:manage']
 WHERE is_system AND key IN ('OWNER', 'ADMIN') AND NOT ('whatsapp:read' = ANY(permissions));
UPDATE roles SET permissions = permissions || ARRAY['whatsapp:read', 'whatsapp:write']
 WHERE is_system AND key IN ('LAWYER', 'CONTROLLER', 'ASSISTANT') AND NOT ('whatsapp:read' = ANY(permissions));
