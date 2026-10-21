-- 2.0-F14: avisos no celular (push). Nasce desligado; texto genérico, sem dados de clientes ou processos.
CREATE TABLE "push_settings" (
  "organization_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_by_id" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "push_settings_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "push_settings_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "push_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "last_sent_at" TIMESTAMPTZ(3),
  "failures" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_subscriptions_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "push_subscriptions_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" ("endpoint");
CREATE INDEX "push_subscriptions_organization_id_user_id_idx" ON "push_subscriptions" ("organization_id", "user_id");

CREATE TABLE "push_preferences" (
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "deadlines" BOOLEAN NOT NULL DEFAULT true,
  "tasks" BOOLEAN NOT NULL DEFAULT true,
  "lead_days" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "push_preferences_pkey" PRIMARY KEY ("organization_id", "user_id"),
  CONSTRAINT "push_preferences_lead_chk" CHECK ("lead_days" BETWEEN 0 AND 3),
  CONSTRAINT "push_preferences_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "push_preferences_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "push_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_deliveries_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "push_deliveries_user_id_dedupe_key_key" ON "push_deliveries" ("user_id", "dedupe_key");
CREATE INDEX "push_deliveries_created_at_idx" ON "push_deliveries" ("created_at");
