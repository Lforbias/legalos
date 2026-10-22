-- 4.0: Chat (ChatGuru) — biblioteca, checklists, status, diálogos, intenções, campanhas, relatórios agendados e segurança da conta.
ALTER TABLE "whatsapp_extras_settings"
  ADD COLUMN "archive_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archive_days" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "archive_last_run_at" TIMESTAMPTZ(3),
  ADD COLUMN "nps_auto_on_close" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "campaigns_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "delegate_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "intents_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "transcribe_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "chat_status_id" UUID;

CREATE TABLE "whatsapp_library_files" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "title" TEXT NOT NULL, "file_name" TEXT NOT NULL, "mime" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL, "storage_key" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "whatsapp_library_files_pkey" PRIMARY KEY ("id"));
CREATE INDEX "whatsapp_library_files_organization_id_idx" ON "whatsapp_library_files"("organization_id");
ALTER TABLE "whatsapp_library_files" ADD CONSTRAINT "whatsapp_library_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_checklists" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "title" TEXT NOT NULL, "items" TEXT[], "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "whatsapp_checklists_pkey" PRIMARY KEY ("id"));
CREATE INDEX "whatsapp_checklists_organization_id_idx" ON "whatsapp_checklists"("organization_id");
ALTER TABLE "whatsapp_checklists" ADD CONSTRAINT "whatsapp_checklists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_chat_statuses" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "name" TEXT NOT NULL, "color" TEXT NOT NULL DEFAULT '#64748b', "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "whatsapp_chat_statuses_pkey" PRIMARY KEY ("id"));
CREATE INDEX "whatsapp_chat_statuses_organization_id_idx" ON "whatsapp_chat_statuses"("organization_id");
ALTER TABLE "whatsapp_chat_statuses" ADD CONSTRAINT "whatsapp_chat_statuses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_chat_status_id_fkey" FOREIGN KEY ("chat_status_id") REFERENCES "whatsapp_chat_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "whatsapp_dialogs" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "kind" TEXT NOT NULL, "name" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB NOT NULL DEFAULT '{}', "text" TEXT NOT NULL, "template_id" UUID, "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "whatsapp_dialogs_pkey" PRIMARY KEY ("id"));
CREATE INDEX "whatsapp_dialogs_organization_id_kind_idx" ON "whatsapp_dialogs"("organization_id", "kind");
ALTER TABLE "whatsapp_dialogs" ADD CONSTRAINT "whatsapp_dialogs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_dialog_runs" (
  "id" UUID NOT NULL, "dialog_id" UUID NOT NULL, "organization_id" UUID NOT NULL, "conversation_id" UUID, "key" TEXT NOT NULL, "status" TEXT NOT NULL, "message" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "whatsapp_dialog_runs_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "whatsapp_dialog_runs_dialog_id_key_key" ON "whatsapp_dialog_runs"("dialog_id", "key");
CREATE INDEX "whatsapp_dialog_runs_organization_id_created_at_idx" ON "whatsapp_dialog_runs"("organization_id", "created_at" DESC);
ALTER TABLE "whatsapp_dialog_runs" ADD CONSTRAINT "whatsapp_dialog_runs_dialog_id_fkey" FOREIGN KEY ("dialog_id") REFERENCES "whatsapp_dialogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_intents" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "name" TEXT NOT NULL, "terms" JSONB NOT NULL DEFAULT '[]', "threshold" INTEGER NOT NULL DEFAULT 3,
  "actions" JSONB NOT NULL DEFAULT '[]', "active" BOOLEAN NOT NULL DEFAULT false, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_intents_pkey" PRIMARY KEY ("id"));
CREATE INDEX "whatsapp_intents_organization_id_idx" ON "whatsapp_intents"("organization_id");
ALTER TABLE "whatsapp_intents" ADD CONSTRAINT "whatsapp_intents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_campaigns" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "name" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "text" TEXT NOT NULL, "template_id" UUID,
  "account_id" UUID, "scheduled_at" TIMESTAMPTZ(3), "approved_by_id" UUID, "approved_at" TIMESTAMPTZ(3), "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finished_at" TIMESTAMPTZ(3), CONSTRAINT "whatsapp_campaigns_pkey" PRIMARY KEY ("id"));
CREATE INDEX "whatsapp_campaigns_organization_id_status_idx" ON "whatsapp_campaigns"("organization_id", "status");
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_campaign_recipients" (
  "id" UUID NOT NULL, "campaign_id" UUID NOT NULL, "organization_id" UUID NOT NULL, "client_id" UUID, "wa_id" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "error" TEXT, "wa_message_id" TEXT, "sent_at" TIMESTAMPTZ(3), CONSTRAINT "whatsapp_campaign_recipients_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "whatsapp_campaign_recipients_campaign_id_wa_id_key" ON "whatsapp_campaign_recipients"("campaign_id", "wa_id");
CREATE INDEX "whatsapp_campaign_recipients_campaign_id_status_idx" ON "whatsapp_campaign_recipients"("campaign_id", "status");
ALTER TABLE "whatsapp_campaign_recipients" ADD CONSTRAINT "whatsapp_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_report_schedules" (
  "organization_id" UUID NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false, "frequency" TEXT NOT NULL DEFAULT 'WEEKLY', "recipients" TEXT[],
  "last_sent_at" TIMESTAMPTZ(3), "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "whatsapp_report_schedules_pkey" PRIMARY KEY ("organization_id"));
ALTER TABLE "whatsapp_report_schedules" ADD CONSTRAINT "whatsapp_report_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "org_security_settings" (
  "organization_id" UUID NOT NULL, "ip_allowlist" TEXT[], "ip_enforced" BOOLEAN NOT NULL DEFAULT false, "idle_logout_minutes" INTEGER, "updated_by_id" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "org_security_settings_pkey" PRIMARY KEY ("organization_id"));
ALTER TABLE "org_security_settings" ADD CONSTRAINT "org_security_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_transcripts" (
  "message_id" UUID NOT NULL, "organization_id" UUID NOT NULL, "text" TEXT NOT NULL, "model" TEXT NOT NULL, "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "whatsapp_transcripts_pkey" PRIMARY KEY ("message_id"));
CREATE INDEX "whatsapp_transcripts_organization_id_idx" ON "whatsapp_transcripts"("organization_id");
ALTER TABLE "whatsapp_transcripts" ADD CONSTRAINT "whatsapp_transcripts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "whatsapp_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
