-- 3.0-F6b: credenciais de acesso aos sistemas dos tribunais, por usuário e por tribunal/sistema (cifradas).
CREATE TABLE "court_credentials" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "system" TEXT NOT NULL,
  "court_code" TEXT NOT NULL DEFAULT '',
  "auth_mode" TEXT NOT NULL,
  "certificate_id" UUID,
  "secret_enc" TEXT NOT NULL,
  "checked_at" TIMESTAMPTZ(3),
  "check_status" TEXT,
  "check_message" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "court_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "court_credentials_user_system_court_key" ON "court_credentials"("organization_id", "user_id", "system", "court_code");
CREATE INDEX "court_credentials_organization_id_idx" ON "court_credentials"("organization_id");
ALTER TABLE "court_credentials" ADD CONSTRAINT "court_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "court_credentials" ADD CONSTRAINT "court_credentials_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
