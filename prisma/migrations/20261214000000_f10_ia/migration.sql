-- 2.0-F10: IA no Chat (resumo de conversa) — chave própria, desligada por padrão.
ALTER TABLE "whatsapp_extras_settings" ADD COLUMN "ai_summary_enabled" BOOLEAN NOT NULL DEFAULT false;
