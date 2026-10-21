-- 3.0-F5: fila de protocolos — agendamento de envio (com interruptor por escritório, desligado por padrão).
ALTER TABLE "organizations" ADD COLUMN "petition_schedule_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "petition_filings" ADD COLUMN "scheduled_for" TIMESTAMPTZ(3);
ALTER TABLE "petition_filings" ADD COLUMN "scheduled_by_id" UUID;
ALTER TABLE "petition_filings" ADD COLUMN "schedule_note" TEXT;
CREATE INDEX "petition_filings_scheduled_for_idx" ON "petition_filings"("scheduled_for") WHERE "scheduled_for" IS NOT NULL;
