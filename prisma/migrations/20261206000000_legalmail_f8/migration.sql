-- 3.0-F8: sugestão de categoria de documento por IA, sempre com decisão humana; as decisões viram exemplos para as próximas sugestões.
CREATE TABLE "document_classifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "suggested" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "final_category" TEXT,
  "model" TEXT,
  "requested_by_id" UUID,
  "decided_by_id" UUID,
  "decided_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_classifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_classifications_confidence_range" CHECK ("confidence" BETWEEN 0 AND 100)
);
CREATE INDEX "document_classifications_org_status_idx" ON "document_classifications"("organization_id", "status", "created_at");
CREATE INDEX "document_classifications_document_idx" ON "document_classifications"("document_id");
-- no máximo uma sugestão pendente por documento/versão
CREATE UNIQUE INDEX "document_classifications_pending_key" ON "document_classifications"("document_id", "version") WHERE "status" = 'PENDING';
ALTER TABLE "document_classifications" ADD CONSTRAINT "document_classifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_classifications" ADD CONSTRAINT "document_classifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
