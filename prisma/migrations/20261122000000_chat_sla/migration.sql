-- 2.0-F8: SLA de resposta do Chat (nasce desligado; só avisa a equipe, nunca escreve ao cliente).
CREATE TABLE "whatsapp_sla_settings" (
  "organization_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "minutes" INTEGER NOT NULL DEFAULT 15,
  "notify_assignee" BOOLEAN NOT NULL DEFAULT true,
  "notify_email" BOOLEAN NOT NULL DEFAULT true,
  "escalate_user_id" UUID,
  "updated_by_id" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "whatsapp_sla_settings_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "whatsapp_sla_settings_minutes_chk" CHECK ("minutes" BETWEEN 1 AND 1440),
  CONSTRAINT "whatsapp_sla_settings_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "whatsapp_sla_alerts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "inbound_at" TIMESTAMPTZ(3) NOT NULL,
  "recipients" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "whatsapp_sla_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_sla_alerts_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_sla_alerts_conv_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "whatsapp_sla_alerts_conversation_id_inbound_at_key" ON "whatsapp_sla_alerts" ("conversation_id", "inbound_at");
CREATE INDEX "whatsapp_sla_alerts_organization_id_created_at_idx" ON "whatsapp_sla_alerts" ("organization_id", "created_at" DESC);
