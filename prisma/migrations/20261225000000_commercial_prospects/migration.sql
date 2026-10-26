CREATE TABLE "commercial_prospects" (
 "cnpj" VARCHAR(14) PRIMARY KEY,
 "legal_name" TEXT NOT NULL, "trade_name" TEXT NOT NULL DEFAULT '',
 "legal_nature" TEXT NOT NULL DEFAULT '', "company_size" TEXT NOT NULL DEFAULT '',
 "opened_on" TEXT NOT NULL DEFAULT '', "address" TEXT NOT NULL,
 "neighborhood" TEXT NOT NULL DEFAULT '', "postal_code" TEXT NOT NULL DEFAULT '',
 "phone" TEXT NOT NULL DEFAULT '', "email" TEXT NOT NULL DEFAULT '', "cnae" TEXT NOT NULL,
 "source_month" TEXT NOT NULL, "imported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION,
 "location_source" TEXT, "location_accuracy" TEXT,
 "stage" TEXT NOT NULL DEFAULT 'NEW', "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
 "contact_verified" BOOLEAN NOT NULL DEFAULT false, "notes" TEXT NOT NULL DEFAULT '',
 "next_contact_on" TEXT, "version" INTEGER NOT NULL DEFAULT 0,
 "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "commercial_prospect_stage" CHECK (stage IN ('NEW','QUALIFIED','CONTACTED','DEMO','PROPOSAL','WON','LOST')),
 CONSTRAINT "commercial_prospect_location" CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -24.1 AND -23.3 AND longitude BETWEEN -46.9 AND -46.3))
);
CREATE INDEX "commercial_prospects_neighborhood_idx" ON "commercial_prospects"("neighborhood");
CREATE INDEX "commercial_prospects_stage_do_not_contact_idx" ON "commercial_prospects"("stage", "do_not_contact");
CREATE INDEX "commercial_prospects_source_month_idx" ON "commercial_prospects"("source_month");
