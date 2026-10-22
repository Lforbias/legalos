-- 2.0-F8: vários números de WhatsApp por escritório (o principal continua único).
ALTER TABLE "whatsapp_accounts" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "whatsapp_accounts" DROP CONSTRAINT IF EXISTS "whatsapp_accounts_organization_id_key";
DROP INDEX IF EXISTS "whatsapp_accounts_organization_id_key";
CREATE UNIQUE INDEX "whatsapp_accounts_primary_key" ON "whatsapp_accounts"("organization_id") WHERE "is_primary";
CREATE INDEX "whatsapp_accounts_organization_id_idx" ON "whatsapp_accounts"("organization_id");
