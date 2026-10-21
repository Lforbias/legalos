-- 2.0-F13: painel do developer (dono da plataforma). Só contagens, estados e mensagens técnicas curtas e mascaradas.
CREATE TABLE "job_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "job" TEXT NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'CRON',
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "finished_at" TIMESTAMPTZ(3),
  "duration_ms" INTEGER,
  "summary" JSONB,
  "error" TEXT,
  CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "job_runs_job_started_at_idx" ON "job_runs" ("job", "started_at" DESC);

CREATE TABLE "app_errors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "correlation_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "app_errors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "app_errors_created_at_idx" ON "app_errors" ("created_at" DESC);
