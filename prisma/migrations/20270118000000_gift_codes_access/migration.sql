CREATE TYPE "GiftCodeBenefitType" AS ENUM ('TRIAL_EXTENSION', 'PLAN_ACCESS');
CREATE TYPE "GiftCodeRedemptionStatus" AS ENUM ('RESERVED', 'APPLIED', 'REVOKED');

CREATE TABLE "gift_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code_hash" TEXT NOT NULL,
  "code_prefix" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "benefit_type" "GiftCodeBenefitType" NOT NULL,
  "plan_key" TEXT,
  "access_days" INTEGER NOT NULL,
  "usage_limit" INTEGER NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3),
  "stackable" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "revoked_at" TIMESTAMPTZ(3),
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gift_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gift_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "gift_codes_code_hash_key" ON "gift_codes"("code_hash");
CREATE INDEX "gift_codes_active_starts_at_expires_at_idx" ON "gift_codes"("active", "starts_at", "expires_at");

CREATE TABLE "gift_code_redemptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gift_code_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID,
  "status" "GiftCodeRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
  "reserved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reservation_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "applied_at" TIMESTAMPTZ(3),
  CONSTRAINT "gift_code_redemptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gift_code_redemptions_gift_code_id_fkey" FOREIGN KEY ("gift_code_id") REFERENCES "gift_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gift_code_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gift_code_redemptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "gift_code_redemptions_gift_code_id_user_id_key" ON "gift_code_redemptions"("gift_code_id", "user_id");
CREATE INDEX "gift_code_redemptions_gift_code_id_status_reservation_expires_at_idx" ON "gift_code_redemptions"("gift_code_id", "status", "reservation_expires_at");
CREATE INDEX "gift_code_redemptions_user_id_status_reservation_expires_at_idx" ON "gift_code_redemptions"("user_id", "status", "reservation_expires_at");
