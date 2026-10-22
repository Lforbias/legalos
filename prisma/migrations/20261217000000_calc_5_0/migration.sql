-- 5.0: calculadoras, portal em linguagem simples, cobrança por Pix/boleto, triagem com minuta, copiloto e metas.
CREATE TABLE "calculations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "case_id" UUID,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calculations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "calculations_organization_id_case_id_idx" ON "calculations"("organization_id", "case_id");
CREATE INDEX "calculations_organization_id_created_at_idx" ON "calculations"("organization_id", "created_at");
CREATE TABLE "portal_updates" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "source_event_id" UUID,
  "original_text" TEXT NOT NULL,
  "plain_text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "created_by_id" UUID,
  "approved_by_id" UUID,
  "approved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_updates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "portal_updates_organization_id_case_id_created_at_idx" ON "portal_updates"("organization_id", "case_id", "created_at");
CREATE TABLE "client_pendings" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "case_id" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "due_date" DATE,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "client_note" TEXT,
  "done_at" TIMESTAMPTZ(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_pendings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "client_pendings_organization_id_client_id_status_idx" ON "client_pendings"("organization_id", "client_id", "status");
CREATE TABLE "portal_messages" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "case_id" UUID,
  "from_client" BOOLEAN NOT NULL,
  "author_id" UUID,
  "body" TEXT NOT NULL,
  "read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "portal_messages_organization_id_client_id_created_at_idx" ON "portal_messages"("organization_id", "client_id", "created_at");
CREATE TABLE "fee_asaas_configs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "api_key_enc" TEXT NOT NULL,
  "webhook_token" TEXT NOT NULL,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "account_id" UUID,
  "updated_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fee_asaas_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fee_asaas_configs_organization_id_key" ON "fee_asaas_configs"("organization_id");
CREATE TABLE "fee_charges" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "entry_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "asaas_payment_id" TEXT NOT NULL,
  "billing_type" TEXT NOT NULL,
  "value" DECIMAL(14,2) NOT NULL,
  "due_date" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "invoice_url" TEXT,
  "boleto_url" TEXT,
  "pix_payload" TEXT,
  "pix_image" TEXT,
  "paid_at" TIMESTAMPTZ(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fee_charges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fee_charges_organization_id_entry_id_idx" ON "fee_charges"("organization_id", "entry_id");
CREATE INDEX "fee_charges_organization_id_status_idx" ON "fee_charges"("organization_id", "status");
CREATE UNIQUE INDEX "fee_charges_asaas_payment_id_key" ON "fee_charges"("asaas_payment_id");
CREATE TABLE "fee_contracts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "case_id" UUID,
  "title" TEXT NOT NULL,
  "percent" DECIMAL(7,4),
  "fixed_amount" DECIMAL(14,2),
  "base_note" TEXT,
  "expected_base" DECIMAL(14,2),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "triggered_at" TIMESTAMPTZ(3),
  "triggered_base" DECIMAL(14,2),
  "entry_id" UUID,
  "notes" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fee_contracts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fee_contracts_organization_id_status_idx" ON "fee_contracts"("organization_id", "status");
CREATE INDEX "fee_contracts_organization_id_case_id_idx" ON "fee_contracts"("organization_id", "case_id");
CREATE TABLE "notice_triages" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "notice_id" UUID NOT NULL,
  "summary" TEXT NOT NULL,
  "requirement" TEXT NOT NULL,
  "act_key" TEXT,
  "days" INTEGER,
  "count_type" TEXT,
  "due_date" DATE,
  "minuta" TEXT,
  "source" TEXT NOT NULL DEFAULT 'RULES',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "deadline_id" UUID,
  "validated_by_id" UUID,
  "validated_at" TIMESTAMPTZ(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notice_triages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notice_triages_organization_id_status_idx" ON "notice_triages"("organization_id", "status");
CREATE UNIQUE INDEX "notice_triages_notice_id_key" ON "notice_triages"("notice_id");
CREATE TABLE "service_sessions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "client_id" UUID,
  "case_id" UUID,
  "title" TEXT NOT NULL,
  "transcript" TEXT NOT NULL,
  "summary" TEXT,
  "actions" JSONB NOT NULL DEFAULT '[]',
  "tasks" JSONB NOT NULL DEFAULT '[]',
  "documents" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMPTZ(3),
  CONSTRAINT "service_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "service_sessions_organization_id_created_at_idx" ON "service_sessions"("organization_id", "created_at");
CREATE TABLE "work_goals" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID,
  "month" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "target" DECIMAL(10,2) NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_goals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_goals_organization_id_month_idx" ON "work_goals"("organization_id", "month");
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_updates" ADD CONSTRAINT "portal_updates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_pendings" ADD CONSTRAINT "client_pendings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_asaas_configs" ADD CONSTRAINT "fee_asaas_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_contracts" ADD CONSTRAINT "fee_contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notice_triages" ADD CONSTRAINT "notice_triages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_goals" ADD CONSTRAINT "work_goals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
