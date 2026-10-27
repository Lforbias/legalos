CREATE TABLE chat_api_sends (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
 state text NOT NULL CHECK(state IN ('SENDING','DONE','UNKNOWN')),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,idempotency_key)
);
