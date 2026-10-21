-- LegalOS: migration inicial (Fase 1). Mantida em sincronia manual com prisma/schema.prisma.

CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "EmailTokenType" AS ENUM ('VERIFY_EMAIL', 'PASSWORD_RESET');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  email_verified_at timestamptz(3),
  locale text NOT NULL DEFAULT 'pt-BR',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  notification_preferences jsonb NOT NULL DEFAULT '{}',
  disabled_at timestamptz(3),
  last_login_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  legal_name text,
  document text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  locale text NOT NULL DEFAULT 'pt-BR',
  currency text NOT NULL DEFAULT 'BRL',
  settings jsonb NOT NULL DEFAULT '{}',
  created_by_id uuid,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3)
);
CREATE UNIQUE INDEX organizations_slug_key ON organizations (slug);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  active_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  user_agent text,
  ip_address text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  last_seen_at timestamptz(3) NOT NULL DEFAULT now(),
  expires_at timestamptz(3) NOT NULL,
  revoked_at timestamptz(3)
);
CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type "EmailTokenType" NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz(3) NOT NULL,
  used_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_tokens_token_hash_key ON email_tokens (token_hash);
CREATE INDEX email_tokens_user_id_type_idx ON email_tokens (user_id, type);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  permissions text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX roles_organization_id_key_key ON roles (organization_id, key);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  status "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX memberships_organization_id_user_id_key ON memberships (organization_id, user_id);
CREATE INDEX memberships_user_id_idx ON memberships (user_id);
CREATE INDEX memberships_role_id_idx ON memberships (role_id);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  token_hash text NOT NULL,
  invited_by_id uuid,
  accepted_by_id uuid,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  expires_at timestamptz(3) NOT NULL,
  accepted_at timestamptz(3),
  revoked_at timestamptz(3),
  CONSTRAINT invitations_email_lowercase CHECK (email = lower(email))
);
CREATE UNIQUE INDEX invitations_token_hash_key ON invitations (token_hash);
CREATE INDEX invitations_organization_id_email_idx ON invitations (organization_id, email);
-- no máximo 1 convite pendente por e-mail em cada escritório
CREATE UNIQUE INDEX invitations_one_pending_per_email
  ON invitations (organization_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  name text NOT NULL,
  description text,
  max_users integer,
  max_storage_mb integer,
  max_ai_tokens_month integer,
  features text[] NOT NULL DEFAULT '{}',
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX plans_key_key ON plans (key);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  trial_ends_at timestamptz(3),
  current_period_end timestamptz(3),
  provider_reference text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_organization_id_key ON subscriptions (organization_id);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  result "AuditResult" NOT NULL DEFAULT 'SUCCESS',
  ip_address text,
  user_agent text,
  correlation_id text,
  metadata jsonb,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_organization_id_created_at_idx ON audit_logs (organization_id, created_at DESC);
CREATE INDEX audit_logs_user_id_created_at_idx ON audit_logs (user_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action);

-- Dados de referência (não são dados de demonstração): planos propostos, sem cobrança real.
INSERT INTO plans (key, name, description, max_users, max_storage_mb, max_ai_tokens_month, features) VALUES
  ('essencial', 'Essencial', 'Clientes, processos, tarefas, agenda e documentos.', 5, 5120, 0,
    ARRAY['clients','cases','tasks','calendar','documents']),
  ('profissional', 'Profissional', 'Essencial + CRM, workflows, financeiro e relatórios avançados.', 25, 51200, 500000,
    ARRAY['clients','cases','tasks','calendar','documents','crm','workflows','finance','reports']),
  ('enterprise', 'Enterprise', 'Recursos avançados de equipe, permissões personalizadas, auditoria ampliada e integrações.', NULL, NULL, NULL,
    ARRAY['clients','cases','tasks','calendar','documents','crm','workflows','finance','reports','custom_roles','extended_audit','integrations']);
