-- 3.0-F1: cadastro único de partes, campos personalizados de processo, acervo e notas fixas/em lote.
CREATE TYPE "RegistryKind" AS ENUM ('PERSON', 'COMPANY', 'ORGAN', 'LAWYER');
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT');

ALTER TABLE "cases" ADD COLUMN "archived_at" TIMESTAMPTZ(3);
ALTER TABLE "cases" ADD COLUMN "custom_fields" JSONB NOT NULL DEFAULT '{}';
CREATE INDEX "cases_organization_id_archived_at_idx" ON "cases"("organization_id", "archived_at");

CREATE TABLE "party_registry" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "kind" "RegistryKind" NOT NULL DEFAULT 'PERSON',
  "name" TEXT NOT NULL,
  "document" TEXT,
  "profession" TEXT,
  "issuing_organ" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "notes" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "party_registry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "party_registry_organization_id_name_idx" ON "party_registry"("organization_id", "name");
ALTER TABLE "party_registry" ADD CONSTRAINT "party_registry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_parties" ADD COLUMN "registry_id" UUID;
ALTER TABLE "case_parties" ADD CONSTRAINT "case_parties_registry_id_fkey" FOREIGN KEY ("registry_id") REFERENCES "party_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "custom_field_defs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" "CustomFieldType" NOT NULL,
  "options" TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_field_defs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "custom_field_defs_organization_id_key_key" ON "custom_field_defs"("organization_id", "key");
ALTER TABLE "custom_field_defs" ADD CONSTRAINT "custom_field_defs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_notes" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "author_id" UUID,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "bulk_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_notes_case_id_pinned_created_at_idx" ON "case_notes"("case_id", "pinned", "created_at" DESC);
CREATE INDEX "case_notes_organization_id_idx" ON "case_notes"("organization_id");
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
