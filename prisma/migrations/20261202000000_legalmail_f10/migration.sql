-- 3.0-F10: créditos e custos por escritório (nasce desligado; nada muda para quem não ligar).
ALTER TABLE "organizations" ADD COLUMN "credits_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "credits_low_threshold" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "credit_grants" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "amount" INTEGER NOT NULL,
  "remaining" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ(3),
  "note" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_grants_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "credit_grants_remaining_range" CHECK ("remaining" >= 0 AND "remaining" <= "amount")
);
CREATE INDEX "credit_grants_organization_id_expires_at_idx" ON "credit_grants"("organization_id", "expires_at");
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "credit_usages" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "cost" INTEGER NOT NULL,
  "ref_type" TEXT,
  "ref_id" TEXT,
  "user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_usages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_usages_cost_positive" CHECK ("cost" > 0)
);
CREATE INDEX "credit_usages_organization_id_created_at_idx" ON "credit_usages"("organization_id", "created_at");
-- um mesmo fato (ex.: o protocolo de uma petição) nunca cobra duas vezes
CREATE UNIQUE INDEX "credit_usages_org_action_ref_key" ON "credit_usages"("organization_id", "action", "ref_type", "ref_id") WHERE "ref_id" IS NOT NULL;
ALTER TABLE "credit_usages" ADD CONSTRAINT "credit_usages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
