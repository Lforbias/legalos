-- 2.0-F9: follow-ups, mensagens agendadas, NPS, formulários de atendimento e chaves do Chat.
CREATE TABLE "whatsapp_follow_ups" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "conversation_id" UUID NOT NULL, "assignee_id" UUID,
  "due_at" TIMESTAMPTZ(3) NOT NULL, "note" TEXT NOT NULL, "done_at" TIMESTAMPTZ(3), "notified_at" TIMESTAMPTZ(3),
  "created_by_id" UUID, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_follow_ups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "whatsapp_follow_ups_organization_id_due_at_idx" ON "whatsapp_follow_ups"("organization_id", "due_at");
CREATE INDEX "whatsapp_follow_ups_conversation_id_idx" ON "whatsapp_follow_ups"("conversation_id");
ALTER TABLE "whatsapp_follow_ups" ADD CONSTRAINT "whatsapp_follow_ups_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_scheduled_messages" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "conversation_id" UUID NOT NULL, "body" TEXT NOT NULL,
  "send_at" TIMESTAMPTZ(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "error" TEXT, "processed_at" TIMESTAMPTZ(3),
  "created_by_id" UUID, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_scheduled_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "whatsapp_scheduled_messages_status_send_at_idx" ON "whatsapp_scheduled_messages"("status", "send_at");
CREATE INDEX "whatsapp_scheduled_messages_conversation_id_idx" ON "whatsapp_scheduled_messages"("conversation_id");
ALTER TABLE "whatsapp_scheduled_messages" ADD CONSTRAINT "whatsapp_scheduled_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_surveys" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "conversation_id" UUID NOT NULL, "status" TEXT NOT NULL DEFAULT 'ASKED',
  "asked_by_id" UUID, "asked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "answered_at" TIMESTAMPTZ(3), "score" INTEGER, "comment" TEXT,
  CONSTRAINT "whatsapp_surveys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_surveys_score_range" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 10))
);
CREATE INDEX "whatsapp_surveys_organization_id_asked_at_idx" ON "whatsapp_surveys"("organization_id", "asked_at");
CREATE INDEX "whatsapp_surveys_conversation_id_status_idx" ON "whatsapp_surveys"("conversation_id", "status");
CREATE UNIQUE INDEX "whatsapp_surveys_one_open_key" ON "whatsapp_surveys"("conversation_id") WHERE "status" = 'ASKED';
ALTER TABLE "whatsapp_surveys" ADD CONSTRAINT "whatsapp_surveys_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_forms" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "name" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_forms_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "whatsapp_forms_organization_id_idx" ON "whatsapp_forms"("organization_id");
CREATE TABLE "whatsapp_form_fields" (
  "form_id" UUID NOT NULL, "field_id" UUID NOT NULL, "required" BOOLEAN NOT NULL DEFAULT false, "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "whatsapp_form_fields_pkey" PRIMARY KEY ("form_id", "field_id")
);
ALTER TABLE "whatsapp_form_fields" ADD CONSTRAINT "whatsapp_form_fields_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "whatsapp_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_form_fields" ADD CONSTRAINT "whatsapp_form_fields_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "whatsapp_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_extras_settings" (
  "organization_id" UUID NOT NULL, "scheduled_enabled" BOOLEAN NOT NULL DEFAULT false, "nps_enabled" BOOLEAN NOT NULL DEFAULT false,
  "nps_question" TEXT NOT NULL DEFAULT 'De 0 a 10, o quanto você recomendaria o nosso atendimento a um amigo? Responda apenas com o número.',
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_extras_settings_pkey" PRIMARY KEY ("organization_id")
);
