-- 2.0-F15: comunicados do developer (aviso no sistema e/ou no celular). Texto escrito pelo developer; sem dados de clientes.
ALTER TABLE "push_preferences" ADD COLUMN "announcements" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "announcements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "link" TEXT,
  "audience" TEXT NOT NULL,
  "organization_id" UUID,
  "target_user_id" UUID,
  "via_in_app" BOOLEAN NOT NULL DEFAULT true,
  "via_push" BOOLEAN NOT NULL DEFAULT false,
  "recipients" INTEGER NOT NULL DEFAULT 0,
  "in_app_count" INTEGER NOT NULL DEFAULT 0,
  "push_sent" INTEGER NOT NULL DEFAULT 0,
  "push_failed" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcements_kind_chk" CHECK ("kind" IN ('INFO','MAINTENANCE','ALERT')),
  CONSTRAINT "announcements_audience_chk" CHECK ("audience" IN ('ALL','ORG','USER')),
  CONSTRAINT "announcements_channel_chk" CHECK ("via_in_app" OR "via_push"),
  CONSTRAINT "announcements_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "announcements_created_at_idx" ON "announcements" ("created_at" DESC);
