-- 3.0-F2 Tarefas 2.0: tipos com pontuação, etiquetas, menções, histórico e anexos.
CREATE TABLE "task_types" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "task_types_organization_id_idx" ON "task_types"("organization_id");
CREATE UNIQUE INDEX "task_types_org_name_uq" ON "task_types"("organization_id", lower("name"));

CREATE TABLE "task_labels" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT 'gray',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "task_labels_organization_id_idx" ON "task_labels"("organization_id");
CREATE UNIQUE INDEX "task_labels_org_name_uq" ON "task_labels"("organization_id", lower("name"));

ALTER TABLE "tasks" ADD COLUMN "type_id" UUID REFERENCES "task_types"("id") ON DELETE SET NULL;
ALTER TABLE "task_comments" ADD COLUMN "mentioned_ids" UUID[] NOT NULL DEFAULT '{}';

CREATE TABLE "task_label_links" (
  "task_id" UUID NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "label_id" UUID NOT NULL REFERENCES "task_labels"("id") ON DELETE CASCADE,
  PRIMARY KEY ("task_id", "label_id")
);

CREATE TABLE "task_events" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "task_id" UUID NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id" UUID,
  "kind" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "task_events_task_id_created_at_idx" ON "task_events"("task_id", "created_at");

CREATE TABLE "task_attachments" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "task_id" UUID NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL UNIQUE,
  "uploaded_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMPTZ(3)
);
CREATE INDEX "task_attachments_task_id_idx" ON "task_attachments"("task_id");
