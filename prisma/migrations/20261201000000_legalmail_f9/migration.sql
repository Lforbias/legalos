-- 3.0-F9: usuários autorizados a usar um certificado (além do titular e de quem administra o cofre).
CREATE TABLE "certificate_authorized_users" (
  "certificate_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "certificate_authorized_users_pkey" PRIMARY KEY ("certificate_id", "user_id")
);
ALTER TABLE "certificate_authorized_users" ADD CONSTRAINT "certificate_authorized_users_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "certificate_authorized_users_organization_id_idx" ON "certificate_authorized_users"("organization_id");
