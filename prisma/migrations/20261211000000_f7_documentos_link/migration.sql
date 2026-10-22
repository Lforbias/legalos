-- 2.0-F7: documentos por link (importados do Astrea ou informados à mão).
CREATE TABLE "linked_documents" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "case_id" UUID, "client_id" UUID,
  "name" TEXT NOT NULL, "url" TEXT NOT NULL, "kind" TEXT NOT NULL, "is_model" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL DEFAULT 'MANUAL', "original_at" TIMESTAMPTZ(3), "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "linked_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "linked_documents_organization_id_case_id_idx" ON "linked_documents"("organization_id", "case_id");
CREATE INDEX "linked_documents_organization_id_client_id_idx" ON "linked_documents"("organization_id", "client_id");
ALTER TABLE "linked_documents" ADD CONSTRAINT "linked_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
