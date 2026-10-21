-- 3.0-F4: importação de processos em lote (por número CNJ) com acompanhamento por item.
CREATE TABLE "case_import_batches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "created_by_id" UUID,
  "options" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_import_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_import_batches_organization_id_created_at_idx" ON "case_import_batches"("organization_id", "created_at" DESC);
ALTER TABLE "case_import_batches" ADD CONSTRAINT "case_import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_import_items" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "raw" TEXT NOT NULL,
  "number" TEXT,
  "create_status" TEXT NOT NULL,
  "case_id" UUID,
  "message" TEXT,
  "sync_status" TEXT NOT NULL DEFAULT 'NONE',
  "sync_message" TEXT,
  "autos_status" TEXT NOT NULL DEFAULT 'NONE',
  "autos_message" TEXT,
  CONSTRAINT "case_import_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_import_items_batch_id_position_idx" ON "case_import_items"("batch_id", "position");
ALTER TABLE "case_import_items" ADD CONSTRAINT "case_import_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "case_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
