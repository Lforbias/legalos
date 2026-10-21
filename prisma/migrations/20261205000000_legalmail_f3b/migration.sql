-- 3.0-F3b: Google Drive/Docs opcional, com as credenciais OAuth de cada escritório (cifradas). Nasce desligado.
CREATE TABLE "google_integrations" (
  "organization_id" UUID NOT NULL,
  "client_id" TEXT NOT NULL,
  "client_secret_enc" TEXT NOT NULL,
  "refresh_token_enc" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "folder_id" TEXT,
  "folder_name" TEXT NOT NULL DEFAULT 'LegalOS',
  "connected_by_id" UUID,
  "connected_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "google_integrations_pkey" PRIMARY KEY ("organization_id")
);
ALTER TABLE "google_integrations" ADD CONSTRAINT "google_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "document_drive_links" (
  "document_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "drive_file_id" TEXT NOT NULL,
  "web_view_link" TEXT NOT NULL,
  "is_google_doc" BOOLEAN NOT NULL DEFAULT false,
  "sent_version" INTEGER NOT NULL,
  "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_by_id" UUID,
  "pulled_at" TIMESTAMPTZ(3),
  CONSTRAINT "document_drive_links_pkey" PRIMARY KEY ("document_id")
);
CREATE INDEX "document_drive_links_organization_id_idx" ON "document_drive_links"("organization_id");
ALTER TABLE "document_drive_links" ADD CONSTRAINT "document_drive_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
