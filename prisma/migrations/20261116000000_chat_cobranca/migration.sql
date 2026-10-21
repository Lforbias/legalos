-- LegalOS Chat, fase 6: lembretes de cobrança de honorários pelo WhatsApp.
CREATE TABLE whatsapp_billing_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  offsets integer[] NOT NULL DEFAULT '{-3,0,3}',
  send_hour integer NOT NULL DEFAULT 9,
  skip_weekends boolean NOT NULL DEFAULT true,
  max_overdue_days integer NOT NULL DEFAULT 60,
  before_text text NOT NULL DEFAULT 'Olá, {{nome}}! Lembramos que a parcela {{parcela}} dos honorários, no valor de {{valor}}, vence em {{vencimento}}. Qualquer dúvida, é só responder esta mensagem.',
  due_text text NOT NULL DEFAULT 'Olá, {{nome}}! Hoje vence a parcela {{parcela}} dos honorários, no valor de {{valor}}. Qualquer dúvida, é só responder esta mensagem.',
  overdue_text text NOT NULL DEFAULT 'Olá, {{nome}}! Não identificamos o pagamento da parcela {{parcela}} dos honorários, no valor de {{valor}}, que venceu em {{vencimento}}. Se já pagou, desconsidere e nos envie o comprovante. Qualquer dúvida, é só responder esta mensagem.',
  payment_info text,
  template_id uuid REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_billing_hour_chk CHECK (send_hour BETWEEN 0 AND 23),
  CONSTRAINT whatsapp_billing_overdue_chk CHECK (max_overdue_days BETWEEN 1 AND 365)
);

CREATE TABLE whatsapp_billing_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES finance_entries(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  offset_days integer,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'SENDING',
  attempts integer NOT NULL DEFAULT 0,
  reason text,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_billing_sends_kind_chk CHECK (kind IN ('BEFORE', 'DUE', 'OVERDUE')),
  CONSTRAINT whatsapp_billing_sends_status_chk CHECK (status IN ('SENDING', 'SENT', 'FAILED', 'SKIPPED'))
);
CREATE UNIQUE INDEX whatsapp_billing_sends_auto_key ON whatsapp_billing_sends (entry_id, offset_days) WHERE offset_days IS NOT NULL;
CREATE INDEX whatsapp_billing_sends_entry_idx ON whatsapp_billing_sends (entry_id, created_at DESC);
CREATE INDEX whatsapp_billing_sends_org_idx ON whatsapp_billing_sends (organization_id, created_at DESC);
CREATE INDEX whatsapp_billing_sends_conv_idx ON whatsapp_billing_sends (conversation_id, created_at DESC);

CREATE TABLE whatsapp_billing_optouts (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wa_id text NOT NULL,
  source text NOT NULL DEFAULT 'REPLY',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, wa_id),
  CONSTRAINT whatsapp_billing_optouts_source_chk CHECK (source IN ('REPLY', 'MANUAL'))
);
