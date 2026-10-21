-- 3.0 (L9): notas do processo com anexos e histórico de alterações.
CREATE TABLE "case_note_attachments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "note_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "uploaded_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "case_note_attachments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_note_attachments_storage_key_key" ON "case_note_attachments"("storage_key");
CREATE INDEX "case_note_attachments_note_id_idx" ON "case_note_attachments"("note_id");
ALTER TABLE "case_note_attachments" ADD CONSTRAINT "case_note_attachments_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "case_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- histórico por processo (sem FK para a nota: o registro sobrevive à exclusão da nota)
CREATE TABLE "case_note_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "note_id" UUID NOT NULL,
  "user_id" UUID,
  "kind" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "previous" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_note_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_note_events_case_id_created_at_idx" ON "case_note_events"("case_id", "created_at");
CREATE INDEX "case_note_events_organization_id_idx" ON "case_note_events"("organization_id");
