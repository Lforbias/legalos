-- LegalOS: Fase 6 — CRM comercial, workflows (regras gatilho → tarefa) e portal do cliente.
-- Mantida em sincronia manual com prisma/schema.prisma. FKs compostas (id, organization_id).

CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'MEETING', 'PROPOSAL', 'WON', 'LOST');
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');
CREATE TYPE "WorkflowTrigger" AS ENUM ('CASE_CREATED', 'DEADLINE_VALIDATED', 'NOTICE_RECEIVED', 'LEAD_WON');
CREATE TYPE "WorkflowAssignee" AS ENUM ('TRIGGER_USER', 'CASE_RESPONSIBLE', 'FIXED');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('CREATED', 'SKIPPED', 'FAILED');

-- ---------- CRM ----------
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  type "ClientType" NOT NULL DEFAULT 'PERSON',
  email text,
  phone text,
  source text,
  interest text,
  estimated_value numeric(14,2),
  stage "LeadStage" NOT NULL DEFAULT 'NEW',
  owner_id uuid REFERENCES users (id) ON DELETE SET NULL,
  next_action_date date,
  notes text,
  lost_reason text,
  client_id uuid,
  closed_at timestamptz(3),
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT leads_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT leads_value_chk CHECK (estimated_value IS NULL OR estimated_value >= 0),
  CONSTRAINT leads_lost_reason_chk CHECK (stage <> 'LOST' OR lost_reason IS NOT NULL),
  CONSTRAINT leads_won_client_chk CHECK (stage <> 'WON' OR client_id IS NOT NULL),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX leads_org_stage_idx ON leads (organization_id, stage, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX leads_owner_idx ON leads (owner_id) WHERE deleted_at IS NULL;

CREATE TABLE lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  kind text NOT NULL,
  body text NOT NULL,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY (lead_id, organization_id) REFERENCES leads (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX lead_activities_lead_idx ON lead_activities (lead_id, created_at DESC);

CREATE TABLE proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  title text NOT NULL,
  amount numeric(14,2) NOT NULL,
  description text,
  valid_until date,
  status "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
  sent_at timestamptz(3),
  decided_at timestamptz(3),
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT proposals_amount_chk CHECK (amount >= 0),
  FOREIGN KEY (lead_id, organization_id) REFERENCES leads (id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX proposals_lead_idx ON proposals (lead_id) WHERE deleted_at IS NULL;

-- ---------- workflows ----------
CREATE TABLE workflow_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger "WorkflowTrigger" NOT NULL,
  task_title text NOT NULL,
  task_description text,
  due_days integer NOT NULL DEFAULT 0,
  priority "TaskPriority" NOT NULL DEFAULT 'NORMAL',
  assignee_mode "WorkflowAssignee" NOT NULL DEFAULT 'TRIGGER_USER',
  assignee_id uuid REFERENCES users (id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT workflow_rules_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT workflow_rules_due_days_chk CHECK (due_days BETWEEN 0 AND 365),
  CONSTRAINT workflow_rules_fixed_chk CHECK (assignee_mode <> 'FIXED' OR assignee_id IS NOT NULL)
);
CREATE INDEX workflow_rules_org_trigger_idx ON workflow_rules (organization_id, trigger) WHERE deleted_at IS NULL AND active;

CREATE TABLE workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  rule_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  status "WorkflowRunStatus" NOT NULL,
  task_id uuid,
  message text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT workflow_runs_once_key UNIQUE (rule_id, source_type, source_id),
  FOREIGN KEY (rule_id, organization_id) REFERENCES workflow_rules (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX workflow_runs_org_idx ON workflow_runs (organization_id, created_at DESC);

-- ---------- portal do cliente ----------
ALTER TABLE invitations ADD COLUMN client_id uuid;
ALTER TABLE invitations ADD CONSTRAINT invitations_client_fk FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE RESTRICT;

CREATE TABLE portal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  revoked_at timestamptz(3),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX portal_accounts_active_key ON portal_accounts (organization_id, user_id, client_id) WHERE revoked_at IS NULL;
CREATE INDEX portal_accounts_client_idx ON portal_accounts (client_id) WHERE revoked_at IS NULL;

ALTER TABLE cases ADD COLUMN shared_with_portal boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN shared_with_portal boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN shared_at timestamptz(3);
