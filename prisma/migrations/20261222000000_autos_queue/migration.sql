CREATE TABLE "autos_download_jobs" (
 "id" UUID PRIMARY KEY, "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "case_id" UUID NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
 "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'QUEUED', "attempts" INTEGER NOT NULL DEFAULT 0,
 "initial_count" INTEGER NOT NULL DEFAULT 0,
 "listed" INTEGER NOT NULL DEFAULT 0, "imported" INTEGER NOT NULL DEFAULT 0,
 "remaining" INTEGER NOT NULL DEFAULT 0, "skipped" INTEGER NOT NULL DEFAULT 0,
 "excluded_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "error" TEXT,
 "next_run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lease_until" TIMESTAMPTZ(3), "lease_token" UUID,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "autos_download_jobs_status_next_run_at_idx" ON "autos_download_jobs"("status", "next_run_at");
CREATE INDEX "autos_download_jobs_organization_id_case_id_created_at_idx" ON "autos_download_jobs"("organization_id", "case_id", "created_at");
CREATE UNIQUE INDEX "autos_download_jobs_one_active" ON "autos_download_jobs"("organization_id", "case_id") WHERE "status" IN ('QUEUED','RUNNING','RETRY');
