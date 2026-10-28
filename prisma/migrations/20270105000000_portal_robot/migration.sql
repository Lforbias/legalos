CREATE TABLE portal_accesses (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 system TEXT NOT NULL DEFAULT 'pje' CHECK (system IN ('pje')),
 target TEXT NOT NULL,
 label TEXT NOT NULL,
 auth_method TEXT NOT NULL CHECK (auth_method IN ('PASSWORD_OTP','CERTIFICATE')),
 certificate_id UUID REFERENCES certificates(id) ON DELETE SET NULL,
 secret_enc TEXT NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT true,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONNECTING','CONNECTED','NEEDS_ACTION','ERROR')),
 status_message TEXT,
 status_at TIMESTAMPTZ(3),
 last_login_at TIMESTAMPTZ(3),
 last_sync_at TIMESTAMPTZ(3),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 UNIQUE (organization_id, user_id, system, target)
);
CREATE INDEX portal_accesses_owner_idx ON portal_accesses(organization_id, user_id);

CREATE TABLE robot_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 access_id UUID NOT NULL REFERENCES portal_accesses(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('LOGIN_TEST','SYNC_NOTICES')),
 status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','DONE','FAILED','WAITING_PERSON')),
 attempts INTEGER NOT NULL DEFAULT 0,
 run_after TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 started_at TIMESTAMPTZ(3),
 finished_at TIMESTAMPTZ(3),
 message TEXT,
 summary JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX robot_jobs_queue_idx ON robot_jobs(status, run_after);
CREATE INDEX robot_jobs_access_idx ON robot_jobs(access_id, created_at DESC);
