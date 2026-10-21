-- Webhooks: avisos de eventos para sistemas externos, com fila de entregas e reenvio.
CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  secret_enc text NOT NULL,
  events text[] NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  disabled_reason text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_success_at timestamptz(3),
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT webhook_endpoints_events_chk CHECK (cardinality(events) BETWEEN 1 AND 20),
  CONSTRAINT webhook_endpoints_org_id_key UNIQUE (id, organization_id)
);
CREATE INDEX webhook_endpoints_org_idx ON webhook_endpoints (organization_id) WHERE deleted_at IS NULL;

CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz(3) NOT NULL DEFAULT now(),
  last_status_code integer,
  last_error text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  delivered_at timestamptz(3),
  CONSTRAINT webhook_deliveries_status_chk CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
  CONSTRAINT webhook_deliveries_endpoint_fk FOREIGN KEY (endpoint_id, organization_id) REFERENCES webhook_endpoints (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT webhook_deliveries_event_uq UNIQUE (endpoint_id, event_id)
);
CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (next_attempt_at) WHERE status = 'PENDING';
CREATE INDEX webhook_deliveries_org_idx ON webhook_deliveries (organization_id, created_at DESC);
