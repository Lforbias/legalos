ALTER TABLE "plans"
  ADD COLUMN "max_processes" INTEGER,
  ADD COLUMN "max_whatsapp_numbers" INTEGER;

-- Keep existing subscriptions and their entitlement values untouched. The old catalog
-- remains private so it can continue serving existing offices and administrative support.
UPDATE "plans" SET "is_public" = false;

INSERT INTO "plans" (
  "key", "name", "description", "max_users", "max_processes", "max_whatsapp_numbers",
  "max_storage_mb", "max_ai_tokens_month", "features", "price_cents", "is_public"
) VALUES
  ('welcome-trial', 'Avaliação gratuita', '14 dias de avaliação, sem cobrança automática. Mantém os limites do trial anterior.', 25, NULL, NULL, 51200, 500000,
   ARRAY['clients','cases','tasks','calendar','documents','crm','workflows','finance','reports'], NULL, false),
  ('simples', 'Simples', 'O primeiro passo para organizar a rotina.', 2, 150, NULL, NULL, NULL,
   ARRAY['clients','cases','tasks','calendar','documents'], 7900, true),
  ('basico', 'Básico', 'Mais estrutura para o dia a dia.', 5, 500, NULL, NULL, NULL,
   ARRAY['clients','cases','tasks','calendar','documents','finance'], 14900, true),
  ('intermediario', 'Intermediário', 'Equipe, atendimento e operação conectados.', 10, 1000, 1, NULL, NULL,
   ARRAY['clients','cases','tasks','calendar','documents','crm','finance','whatsapp'], 34900, true),
  ('avancado', 'Avançado', 'Uma operação com mais possibilidades.', 20, 2000, 2, NULL, NULL,
   ARRAY['clients','cases','tasks','calendar','documents','crm','workflows','finance','whatsapp','integrations','ai'], 59900, true);

