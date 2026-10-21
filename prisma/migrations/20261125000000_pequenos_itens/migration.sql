-- 2.0-F6: 2FA obrigatório por escritório (nasce desligado).
ALTER TABLE "organizations" ADD COLUMN "require_mfa" BOOLEAN NOT NULL DEFAULT false;
