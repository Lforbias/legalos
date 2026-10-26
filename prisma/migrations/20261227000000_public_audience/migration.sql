-- Public audience is intentionally separate from users/memberships/tenant data.
CREATE TABLE audience_settings (
 id integer PRIMARY KEY CHECK (id=1), reviewer text NOT NULL DEFAULT '', moderator text NOT NULL DEFAULT '',
 blog_enabled boolean NOT NULL DEFAULT false, community_enabled boolean NOT NULL DEFAULT false,
 legal_approved boolean NOT NULL DEFAULT false
);
INSERT INTO audience_settings(id) VALUES(1);
CREATE TABLE audience_members (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, google_sub text UNIQUE,
 area text NOT NULL DEFAULT '', state text NOT NULL DEFAULT '', invited boolean NOT NULL DEFAULT false,
 blocked boolean NOT NULL DEFAULT false, origin text NOT NULL CHECK(origin IN ('blog','ferramenta','comunidade')),
 marketing boolean NOT NULL DEFAULT false, marketing_at timestamptz, unsubscribe_hash text UNIQUE NOT NULL,
 converted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audience_consents (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES audience_members(id),
 kind text NOT NULL CHECK(kind IN ('terms','marketing','withdrawal')), version text NOT NULL, text text NOT NULL,
 origin text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audience_sessions (
 token_hash text PRIMARY KEY, member_id uuid NOT NULL REFERENCES audience_members(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE audience_auth (
 token_hash text PRIMARY KEY, browser_hash text NOT NULL, email text, name text NOT NULL DEFAULT '',
 origin text NOT NULL, marketing boolean NOT NULL, verifier text, expires_at timestamptz NOT NULL
);
CREATE TABLE audience_invites (email text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audience_posts (
 id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, title text NOT NULL, category text NOT NULL,
 summary text NOT NULL, practical text NOT NULL, applies text NOT NULL,
 source_url text NOT NULL, source_name text NOT NULL, source_date date NOT NULL, accessed_at date NOT NULL,
 tool text NOT NULL DEFAULT 'prazos', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 reviewed_by text, reviewed_at timestamptz, published_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 correction text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status!='published' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND published_at IS NOT NULL))
);
CREATE TABLE audience_questions (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES audience_members(id), title text NOT NULL, body text NOT NULL,
 category text NOT NULL, tribunal text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','hidden')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audience_replies (
 id uuid PRIMARY KEY, question_id uuid NOT NULL REFERENCES audience_questions(id), member_id uuid NOT NULL REFERENCES audience_members(id),
 body text NOT NULL, source_url text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','hidden')), accepted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX audience_one_accepted ON audience_replies(question_id) WHERE accepted=true;
CREATE TABLE audience_comments (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES audience_members(id), post_id uuid REFERENCES audience_posts(id),
 tool text, body text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','hidden')),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK((post_id IS NULL) != (tool IS NULL))
);
CREATE TABLE audience_marks (
 member_id uuid NOT NULL REFERENCES audience_members(id), target_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('question_vote','reply_vote','save')), PRIMARY KEY(member_id,target_id,kind)
);
CREATE TABLE audience_reports (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES audience_members(id), target_id uuid NOT NULL,
 reason text NOT NULL, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audience_notifications (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES audience_members(id), question_id uuid NOT NULL REFERENCES audience_questions(id),
 message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audience_calculations (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES audience_members(id), tool text NOT NULL,
 input jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audience_events (
 id uuid PRIMARY KEY, member_id uuid REFERENCES audience_members(id), origin text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('tool_use','tool_save','signup','demo')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audience_audit (
 id uuid PRIMARY KEY, admin_id uuid NOT NULL, action text NOT NULL, target text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audience_posts_status_date ON audience_posts(status,published_at DESC);
CREATE INDEX audience_questions_status_date ON audience_questions(status,created_at DESC);
CREATE INDEX audience_replies_question ON audience_replies(question_id,status);
CREATE INDEX audience_events_origin_date ON audience_events(origin,created_at);
CREATE INDEX audience_sessions_expiry ON audience_sessions(expires_at);
CREATE TABLE audience_mail_deliveries (
 member_id uuid NOT NULL REFERENCES audience_members(id), step text NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'claimed' CHECK(status IN ('claimed','sent','failed')), error text, PRIMARY KEY(member_id,step)
);
CREATE TABLE audience_sources (
 id uuid PRIMARY KEY, name text NOT NULL, url text UNIQUE NOT NULL, category text NOT NULL,
 active boolean NOT NULL DEFAULT true, last_checked_at timestamptz, last_error text
);
CREATE TABLE audience_source_snapshots (
 id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES audience_sources(id),
 content_hash text NOT NULL, body text NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now(),
 draft_id uuid REFERENCES audience_posts(id), UNIQUE(source_id,content_hash)
);
