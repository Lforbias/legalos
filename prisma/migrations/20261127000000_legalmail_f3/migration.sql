-- 3.0-F3: timbrados (cabeçalho, rodapé e logo) para documentos gerados e prévia em PDF.
CREATE TABLE "letterheads" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "header_text" TEXT,
  "footer_text" TEXT,
  "logo" BYTEA,
  "logo_mime" TEXT,
  "show_page_numbers" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "letterheads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "letterheads_organization_id_idx" ON "letterheads"("organization_id");
-- no máximo um timbrado padrão por escritório
CREATE UNIQUE INDEX "letterheads_one_default_per_org" ON "letterheads"("organization_id") WHERE "is_default" AND "deleted_at" IS NULL;
ALTER TABLE "letterheads" ADD CONSTRAINT "letterheads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
