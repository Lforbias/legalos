-- Cobrança automática (Asaas) e fila de e-mails com reenvio.
ALTER TABLE plans ADD COLUMN price_cents integer;
ALTER TABLE plans ADD CONSTRAINT plans_price_chk CHECK (price_cents IS NULL OR price_cents BETWEEN 100 AND 100000000);

ALTER TABLE subscriptions
  ADD COLUMN billing_provider text,
  ADD COLUMN provider_customer_id text,
  ADD COLUMN provider_subscription_id text,
  ADD COLUMN cancel_requested_at timestamptz(3),
  ADD COLUMN billing_name text,
  ADD COLUMN billing_document text,
  ADD COLUMN billing_email text;
CREATE UNIQUE INDEX subscriptions_provider_subscription_uq ON subscriptions (provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider_payment_id text NOT NULL UNIQUE,
  status text NOT NULL,
  value_cents integer NOT NULL,
  due_date date NOT NULL,
  paid_at timestamptz(3),
  invoice_url text,
  billing_type text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX billing_invoices_org_idx ON billing_invoices (organization_id, due_date DESC);

-- Idempotência do webhook do provedor: cada evento é processado uma única vez.
CREATE TABLE billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  organization_id uuid REFERENCES organizations (id) ON DELETE SET NULL,
  received_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE mail_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE,
  kind text NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz(3) NOT NULL DEFAULT now(),
  last_error text,
  dedupe_key text UNIQUE,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  sent_at timestamptz(3),
  CONSTRAINT mail_outbox_status_chk CHECK (status IN ('PENDING', 'SENT', 'FAILED'))
);
CREATE INDEX mail_outbox_due_idx ON mail_outbox (next_attempt_at) WHERE status = 'PENDING';
