-- 2.0-F5: processo mais rico — honorários, apensos, recursos, provisão e índices de correção.
ALTER TABLE "cases" ADD COLUMN "provision_value" DECIMAL(14,2), ADD COLUMN "provision_base_date" DATE, ADD COLUMN "claim_base_date" DATE, ADD COLUMN "correction_index" TEXT;

CREATE TABLE "case_fees" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "case_id" UUID NOT NULL,
  "kind" TEXT NOT NULL, "description" TEXT NOT NULL, "amount" DECIMAL(14,2), "percent" DECIMAL(5,2), "notes" TEXT,
  "created_by_id" UUID, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "case_fees_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_fees_case_id_idx" ON "case_fees"("case_id");
ALTER TABLE "case_fees" ADD CONSTRAINT "case_fees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_fees" ADD CONSTRAINT "case_fees_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_links" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "case_id" UUID NOT NULL, "related_case_id" UUID NOT NULL,
  "kind" TEXT NOT NULL, "notes" TEXT, "created_by_id" UUID, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "case_links_not_self" CHECK ("case_id" <> "related_case_id")
);
CREATE INDEX "case_links_organization_id_case_id_idx" ON "case_links"("organization_id", "case_id");
CREATE INDEX "case_links_organization_id_related_case_id_idx" ON "case_links"("organization_id", "related_case_id");
-- um par só existe uma vez, em qualquer sentido
CREATE UNIQUE INDEX "case_links_pair_key" ON "case_links"("organization_id", LEAST("case_id", "related_case_id"), GREATEST("case_id", "related_case_id"));
ALTER TABLE "case_links" ADD CONSTRAINT "case_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_appeals" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "case_id" UUID NOT NULL,
  "degree" TEXT NOT NULL, "appeal_type" TEXT NOT NULL, "number" TEXT, "court" TEXT, "filed_on" DATE,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE', "judged_on" DATE, "notes" TEXT,
  "created_by_id" UUID, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "case_appeals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_appeals_case_id_idx" ON "case_appeals"("case_id");
ALTER TABLE "case_appeals" ADD CONSTRAINT "case_appeals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_appeals" ADD CONSTRAINT "case_appeals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "monetary_indices" (
  "id" UUID NOT NULL, "organization_id" UUID, "series" TEXT NOT NULL, "month" DATE NOT NULL,
  "rate_percent" DECIMAL(12,6) NOT NULL, "source" TEXT NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "monetary_indices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "monetary_indices_series_month_idx" ON "monetary_indices"("series", "month");
CREATE UNIQUE INDEX "monetary_indices_official_key" ON "monetary_indices"("series", "month") WHERE "organization_id" IS NULL;
CREATE UNIQUE INDEX "monetary_indices_org_key" ON "monetary_indices"("organization_id", "series", "month") WHERE "organization_id" IS NOT NULL;
