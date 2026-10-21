-- Etapa 4 do motor de tribunais: autos baixados do tribunal, sem duplicar (chave externa por escritório).
ALTER TABLE "documents" ADD COLUMN "external_key" TEXT;
CREATE UNIQUE INDEX "documents_organization_id_external_key_key" ON "documents"("organization_id", "external_key");
