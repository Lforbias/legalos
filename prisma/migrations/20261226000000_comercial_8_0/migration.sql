-- 8.0: LegalOS Comercial (espaço da plataforma para prospecção e vendas; não toca dados de escritórios).
CREATE TYPE "ComStage" AS ENUM ('IDENTIFICADO','QUALIFICADO','CONTATO','DEMONSTRACAO','PROPOSTA','NEGOCIACAO','GANHO','PERDIDO');
CREATE TYPE "ComActivityKind" AS ENUM ('LIGACAO','WHATSAPP','EMAIL','REUNIAO','DEMONSTRACAO','NOTA','ETAPA');
CREATE TYPE "ComProposalStatus" AS ENUM ('RASCUNHO','ENVIADA','ACEITA','RECUSADA');
CREATE TYPE "ComMemberRole" AS ENUM ('GERENTE','VENDEDOR');

CREATE TABLE "com_members" (
  "user_id" UUID NOT NULL,
  "role" "ComMemberRole" NOT NULL DEFAULT 'VENDEDOR',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "goal_monthly_cents" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "com_members_pkey" PRIMARY KEY ("user_id")
);
ALTER TABLE "com_members" ADD CONSTRAINT "com_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "com_prospects" (
  "id" UUID NOT NULL,
  "cnpj" TEXT,
  "name" TEXT NOT NULL,
  "legal_name" TEXT,
  "phone" TEXT,
  "phone_2" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "website" TEXT,
  "street" TEXT,
  "number" TEXT,
  "complement" TEXT,
  "district" TEXT,
  "city" TEXT NOT NULL DEFAULT 'São Paulo',
  "state" TEXT NOT NULL DEFAULT 'SP',
  "zip" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "geocoded_at" TIMESTAMPTZ(3),
  "geocode_note" TEXT,
  "cnae" TEXT,
  "opened_at" DATE,
  "company_size" TEXT,
  "lawyers_estimate" INTEGER,
  "areas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ranking_position" INTEGER,
  "ranking_source" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "stage" "ComStage" NOT NULL DEFAULT 'IDENTIFICADO',
  "stage_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lost_reason" TEXT,
  "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
  "contact_verified" BOOLEAN NOT NULL DEFAULT false,
  "owner_id" UUID,
  "plan_key" TEXT,
  "expected_users" INTEGER,
  "addon_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expected_monthly_cents" INTEGER,
  "probability_pct" INTEGER,
  "expected_close_at" DATE,
  "next_action_at" TIMESTAMPTZ(3),
  "next_action_note" TEXT,
  "won_at" TIMESTAMPTZ(3),
  "won_monthly_cents" INTEGER,
  "notes" TEXT,
  "enriched_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "com_prospects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "com_prospects_cnpj_key" ON "com_prospects"("cnpj");
CREATE INDEX "com_prospects_stage_deleted_at_idx" ON "com_prospects"("stage", "deleted_at");
CREATE INDEX "com_prospects_owner_id_idx" ON "com_prospects"("owner_id");
CREATE INDEX "com_prospects_ranking_position_idx" ON "com_prospects"("ranking_position");

CREATE TABLE "com_contacts" (
  "id" UUID NOT NULL,
  "prospect_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "is_decision_maker" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "com_contacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "com_contacts_prospect_id_idx" ON "com_contacts"("prospect_id");
ALTER TABLE "com_contacts" ADD CONSTRAINT "com_contacts_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "com_prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "com_activities" (
  "id" UUID NOT NULL,
  "prospect_id" UUID NOT NULL,
  "user_id" UUID,
  "kind" "ComActivityKind" NOT NULL,
  "summary" TEXT NOT NULL,
  "outcome" TEXT,
  "next_action_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "com_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "com_activities_prospect_id_created_at_idx" ON "com_activities"("prospect_id", "created_at");
CREATE INDEX "com_activities_user_id_created_at_idx" ON "com_activities"("user_id", "created_at");
ALTER TABLE "com_activities" ADD CONSTRAINT "com_activities_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "com_prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "com_addons" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price_cents" INTEGER,
  "per_user" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "com_addons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "com_addons_key_key" ON "com_addons"("key");

CREATE TABLE "com_proposals" (
  "id" UUID NOT NULL,
  "prospect_id" UUID NOT NULL,
  "plan_key" TEXT NOT NULL,
  "users" INTEGER NOT NULL,
  "addon_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "discount_pct" INTEGER NOT NULL DEFAULT 0,
  "monthly_cents" INTEGER NOT NULL,
  "setup_cents" INTEGER NOT NULL DEFAULT 0,
  "valid_until" DATE,
  "status" "ComProposalStatus" NOT NULL DEFAULT 'RASCUNHO',
  "notes" TEXT,
  "snapshot" JSONB NOT NULL DEFAULT '{}',
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "com_proposals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "com_proposals_prospect_id_created_at_idx" ON "com_proposals"("prospect_id", "created_at");
ALTER TABLE "com_proposals" ADD CONSTRAINT "com_proposals_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "com_prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "com_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "stage_probabilities" JSONB NOT NULL DEFAULT '{}',
  "cycle_days" JSONB NOT NULL DEFAULT '{}',
  "churn_monthly_pct" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "com_settings_pkey" PRIMARY KEY ("id")
);
