CREATE TABLE external_tool_requests (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN ('API','MCP')),
 principal_id text NOT NULL,
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 state text NOT NULL CHECK(state IN ('RUNNING','DONE','UNKNOWN')),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,user_id,channel,principal_id,idempotency_key)
);
