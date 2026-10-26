ALTER TABLE "workflow_rules" ADD COLUMN "conditions" JSONB NOT NULL DEFAULT '{"mode":"ALL","items":[]}', ADD COLUMN "notice_assignee_id" UUID, ADD COLUMN "notice_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "document_bookmarks" (
 "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "user_id" UUID NOT NULL, "document_id" UUID NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "document_bookmarks_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "document_bookmarks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "document_bookmarks_organization_id_user_id_document_id_key" ON "document_bookmarks"("organization_id", "user_id", "document_id");

CREATE TABLE "task_stages" (
 "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "name" TEXT NOT NULL,
 "status" "TaskStatus" NOT NULL DEFAULT 'WAITING', "position" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
 CONSTRAINT "task_stages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_stages_organization_id_name_key" ON "task_stages"("organization_id", "name");
ALTER TABLE "tasks" ADD COLUMN "stage_id" UUID;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "task_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
