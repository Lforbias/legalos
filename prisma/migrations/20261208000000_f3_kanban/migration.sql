-- 2.0-F3: quadros Kanban de gestão (livres, por escritório) e pacotes de workflow editáveis.
CREATE TABLE "kanban_boards" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "kanban_boards_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "kanban_boards_organization_id_idx" ON "kanban_boards"("organization_id");
CREATE UNIQUE INDEX "kanban_boards_org_name_key" ON "kanban_boards"("organization_id", lower("name")) WHERE "archived_at" IS NULL;

CREATE TABLE "kanban_columns" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "board_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "is_done" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kanban_columns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "kanban_columns_board_id_idx" ON "kanban_columns"("board_id", "position");

CREATE TABLE "kanban_cards" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "board_id" UUID NOT NULL,
  "column_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "assignee_id" UUID,
  "due_date" DATE,
  "case_id" UUID,
  "client_id" UUID,
  "position" INTEGER NOT NULL DEFAULT 0,
  "closed_at" TIMESTAMPTZ(3),
  "run_id" UUID,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "kanban_cards_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "kanban_cards_board_id_idx" ON "kanban_cards"("board_id", "column_id", "position");
CREATE INDEX "kanban_cards_organization_id_idx" ON "kanban_cards"("organization_id");

CREATE TABLE "kanban_card_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "card_id" UUID NOT NULL,
  "user_id" UUID,
  "kind" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kanban_card_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "kanban_card_events_card_id_idx" ON "kanban_card_events"("card_id", "created_at");

CREATE TABLE "workflow_packages" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "seed_key" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "workflow_packages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workflow_packages_organization_id_idx" ON "workflow_packages"("organization_id");
CREATE UNIQUE INDEX "workflow_packages_seed_key" ON "workflow_packages"("organization_id", "seed_key") WHERE "seed_key" IS NOT NULL;

CREATE TABLE "workflow_package_steps" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "package_id" UUID NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "due_days" INTEGER NOT NULL DEFAULT 1,
  "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
  "assignee_id" UUID,
  "ask" TEXT,
  CONSTRAINT "workflow_package_steps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workflow_package_steps_package_id_idx" ON "workflow_package_steps"("package_id", "position");

CREATE TABLE "workflow_package_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "package_id" UUID NOT NULL,
  "case_id" UUID,
  "client_id" UUID,
  "base_date" DATE NOT NULL,
  "task_count" INTEGER NOT NULL DEFAULT 0,
  "card_id" UUID,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_package_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workflow_package_runs_org_idx" ON "workflow_package_runs"("organization_id", "package_id", "case_id");

ALTER TABLE "kanban_boards" ADD CONSTRAINT "kanban_boards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kanban_columns" ADD CONSTRAINT "kanban_columns_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "kanban_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "kanban_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "kanban_columns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kanban_card_events" ADD CONSTRAINT "kanban_card_events_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "kanban_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_packages" ADD CONSTRAINT "workflow_packages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_package_steps" ADD CONSTRAINT "workflow_package_steps_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "workflow_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_package_runs" ADD CONSTRAINT "workflow_package_runs_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "workflow_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
