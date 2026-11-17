CREATE TABLE "welcome_onboarding" (
  "user_id" UUID NOT NULL,
  "completed_organization_id" UUID,
  "current_step" INTEGER NOT NULL DEFAULT 1,
  "data" JSONB NOT NULL DEFAULT '{}',
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "welcome_onboarding_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "welcome_onboarding_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "welcome_onboarding_completed_organization_id_fkey" FOREIGN KEY ("completed_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "welcome_onboarding_completed_organization_id_key" ON "welcome_onboarding"("completed_organization_id");
