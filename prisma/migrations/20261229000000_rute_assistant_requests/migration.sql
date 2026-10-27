CREATE TABLE rute_assistant_requests (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 state text NOT NULL CHECK (state IN ('RUNNING','DONE','UNKNOWN')),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,user_id,conversation_id,request_id)
);
CREATE UNIQUE INDEX rute_assistant_one_running ON rute_assistant_requests(conversation_id) WHERE state='RUNNING';
