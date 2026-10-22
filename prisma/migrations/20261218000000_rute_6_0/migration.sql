-- 6.0: RUTE (MCP, propostas, assistente, biblioteca e governança).
CREATE TABLE "rute_settings" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "mcp_enabled" BOOLEAN NOT NULL DEFAULT false,
  "proposals_enabled" BOOLEAN NOT NULL DEFAULT false,
  "assistant_enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider" TEXT NOT NULL DEFAULT 'ANTHROPIC',
  "model" TEXT,
  "api_key_enc" TEXT,
  "emergency_stop" BOOLEAN NOT NULL DEFAULT false,
  "retention_days" INTEGER NOT NULL DEFAULT 90,
  "monthly_token_limit" INTEGER,
  "role_limits" JSONB NOT NULL DEFAULT '{}',
  "consent_at" TIMESTAMPTZ(3),
  "consent_by_id" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rute_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rute_settings_organization_id_key" ON "rute_settings"("organization_id");
ALTER TABLE "rute_settings" ADD CONSTRAINT "rute_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "mcp_oauth_clients" (
  "id" UUID NOT NULL,
  "client_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "redirect_uris" TEXT[] NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mcp_oauth_clients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mcp_oauth_clients_client_id_key" ON "mcp_oauth_clients"("client_id");
CREATE TABLE "mcp_oauth_codes" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "client_id" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "code_challenge" TEXT NOT NULL,
  "redirect_uri" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mcp_oauth_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mcp_oauth_codes_code_hash_key" ON "mcp_oauth_codes"("code_hash");
CREATE TABLE "mcp_oauth_tokens" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "client_id" TEXT NOT NULL,
  "client_name" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "access_hash" TEXT NOT NULL,
  "refresh_hash" TEXT NOT NULL,
  "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "refresh_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "last_used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mcp_oauth_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mcp_oauth_tokens_access_hash_key" ON "mcp_oauth_tokens"("access_hash");
CREATE UNIQUE INDEX "mcp_oauth_tokens_refresh_hash_key" ON "mcp_oauth_tokens"("refresh_hash");
CREATE INDEX "mcp_oauth_tokens_organization_id_user_id_idx" ON "mcp_oauth_tokens"("organization_id", "user_id");
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "ai_proposals" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "via" TEXT NOT NULL,
  "connection" TEXT,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "case_id" UUID,
  "client_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "result_type" TEXT,
  "result_id" UUID,
  "decided_by_id" UUID,
  "decided_at" TIMESTAMPTZ(3),
  "decision_note" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_proposals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_proposals_organization_id_status_created_at_idx" ON "ai_proposals"("organization_id", "status", "created_at");
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "ai_tool_logs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "via" TEXT NOT NULL,
  "connection" TEXT,
  "tool" TEXT NOT NULL,
  "ok" BOOLEAN NOT NULL DEFAULT true,
  "ms" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_tool_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_tool_logs_organization_id_created_at_idx" ON "ai_tool_logs"("organization_id", "created_at");
ALTER TABLE "ai_tool_logs" ADD CONSTRAINT "ai_tool_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "assistant_conversations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "case_id" UUID,
  "client_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assistant_conversations_organization_id_user_id_updated_at_idx" ON "assistant_conversations"("organization_id", "user_id", "updated_at");
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "assistant_messages" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "refs" JSONB NOT NULL DEFAULT '[]',
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assistant_messages_conversation_id_created_at_idx" ON "assistant_messages"("conversation_id", "created_at");
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "office_instructions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "area" TEXT NOT NULL DEFAULT 'GERAL',
  "kind" TEXT NOT NULL DEFAULT 'INSTRUCAO',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "office_instructions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "office_instructions_organization_id_active_idx" ON "office_instructions"("organization_id", "active");
ALTER TABLE "office_instructions" ADD CONSTRAINT "office_instructions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "ai_send_logs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "via" TEXT NOT NULL,
  "tool" TEXT NOT NULL,
  "client_id" UUID,
  "case_id" UUID,
  "chars" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_send_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_send_logs_organization_id_created_at_idx" ON "ai_send_logs"("organization_id", "created_at");
CREATE INDEX "ai_send_logs_organization_id_client_id_idx" ON "ai_send_logs"("organization_id", "client_id");
ALTER TABLE "ai_send_logs" ADD CONSTRAINT "ai_send_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
