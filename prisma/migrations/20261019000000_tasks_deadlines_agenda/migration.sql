-- LegalOS: Fase 3 — tarefas, comentários, prazos (com validação humana), agenda e notificações.
-- Mantida em sincronia manual com prisma/schema.prisma. FKs compostas (id, organization_id) como na Fase 2.

CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "DeadlineStatus" AS ENUM ('DRAFT', 'VALIDATED', 'FULFILLED', 'CANCELED');
CREATE TYPE "DeadlineSource" AS ENUM ('MANUAL', 'IMPORTED');
CREATE TYPE "DeadlineCountType" AS ENUM ('BUSINESS', 'CALENDAR');
CREATE TYPE "AgendaEventKind" AS ENUM ('HEARING', 'MEETING', 'DILIGENCE', 'OTHER');

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status "TaskStatus" NOT NULL DEFAULT 'TODO',
  priority "TaskPriority" NOT NULL DEFAULT 'NORMAL',
  due_date date,
  assignee_id uuid REFERENCES users (id) ON DELETE SET NULL,
  case_id uuid,
  client_id uuid,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  completed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT tasks_id_org_key UNIQUE (id, organization_id),
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX tasks_org_status_idx ON tasks (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id, status) WHERE deleted_at IS NULL;
CREATE INDEX tasks_case_idx ON tasks (case_id) WHERE deleted_at IS NULL;
CREATE INDEX tasks_due_idx ON tasks (organization_id, due_date) WHERE deleted_at IS NULL AND status IN ('TODO', 'IN_PROGRESS', 'WAITING');

CREATE TABLE task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  task_id uuid NOT NULL,
  author_id uuid REFERENCES users (id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, organization_id) REFERENCES tasks (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX task_comments_task_idx ON task_comments (task_id, created_at);
CREATE INDEX task_comments_org_idx ON task_comments (organization_id);

CREATE TABLE deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  case_id uuid NOT NULL,
  title text NOT NULL,
  kind text,
  source "DeadlineSource" NOT NULL DEFAULT 'MANUAL',
  status "DeadlineStatus" NOT NULL DEFAULT 'DRAFT',
  start_date date,
  days integer,
  count_type "DeadlineCountType",
  due_date date NOT NULL,
  internal_due_date date,
  responsible_id uuid REFERENCES users (id) ON DELETE SET NULL,
  notes text,
  calculation_note text,
  validated_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  validated_at timestamptz(3),
  fulfilled_at timestamptz(3),
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT deadlines_id_org_key UNIQUE (id, organization_id),
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT deadlines_internal_before_due CHECK (internal_due_date IS NULL OR internal_due_date <= due_date),
  CONSTRAINT deadlines_days_positive CHECK (days IS NULL OR (days > 0 AND days <= 3650)),
  CONSTRAINT deadlines_validated_has_actor CHECK (status NOT IN ('VALIDATED', 'FULFILLED') OR validated_at IS NOT NULL)
);
CREATE INDEX deadlines_org_due_idx ON deadlines (organization_id, due_date) WHERE status IN ('DRAFT', 'VALIDATED');
CREATE INDEX deadlines_case_idx ON deadlines (case_id);
CREATE INDEX deadlines_responsible_idx ON deadlines (responsible_id) WHERE status IN ('DRAFT', 'VALIDATED');

CREATE TABLE agenda_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  title text NOT NULL,
  kind "AgendaEventKind" NOT NULL DEFAULT 'OTHER',
  starts_at timestamptz(3) NOT NULL,
  ends_at timestamptz(3),
  all_day boolean NOT NULL DEFAULT false,
  location text,
  description text,
  case_id uuid,
  client_id uuid,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT agenda_events_end_after_start CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX agenda_events_org_start_idx ON agenda_events (organization_id, starts_at) WHERE deleted_at IS NULL;
CREATE INDEX agenda_events_case_idx ON agenda_events (case_id) WHERE deleted_at IS NULL;

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  dedupe_key text,
  read_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT notifications_link_internal CHECK (link IS NULL OR link ~ '^/[^/\\]')
);
CREATE UNIQUE INDEX notifications_user_dedupe_key ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, organization_id, created_at DESC);
