-- LegalOS Chat, fase 5: menu de triagem (chatbot) e pré-atendimento.
CREATE TABLE whatsapp_bots (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  greeting text NOT NULL DEFAULT 'Olá! Como podemos ajudar?',
  invalid_text text NOT NULL DEFAULT 'Não entendi. Responda com o número de uma das opções.',
  handoff_text text NOT NULL DEFAULT 'Obrigado! Um atendente vai continuar a conversa com você em instantes.',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_bot_sessions (
  conversation_id uuid PRIMARY KEY REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'MENU',
  option_key text,
  question_index integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  step integer NOT NULL DEFAULT 0,
  started_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_bot_sessions_state_chk CHECK (state IN ('MENU', 'QUESTION', 'DONE'))
);
CREATE INDEX whatsapp_bot_sessions_org_idx ON whatsapp_bot_sessions (organization_id, state);
