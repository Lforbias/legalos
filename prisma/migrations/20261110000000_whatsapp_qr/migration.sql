-- WhatsApp por QR-Code (conexão NÃO oficial, opção avançada). A Meta oficial continua sendo o padrão.
ALTER TABLE whatsapp_accounts
  ADD COLUMN provider text NOT NULL DEFAULT 'META',
  ADD COLUMN qr_state text NOT NULL DEFAULT 'DISCONNECTED',
  ADD COLUMN qr_code text,
  ADD COLUMN qr_phone text,
  ADD COLUMN qr_updated_at timestamptz(3),
  ADD COLUMN risk_ack_at timestamptz(3),
  ADD COLUMN risk_ack_by_id uuid;
ALTER TABLE whatsapp_accounts ALTER COLUMN phone_number_id DROP NOT NULL;
ALTER TABLE whatsapp_accounts ALTER COLUMN token_enc DROP NOT NULL;
ALTER TABLE whatsapp_accounts ADD CONSTRAINT whatsapp_accounts_provider_chk CHECK (provider IN ('META', 'QR'));
ALTER TABLE whatsapp_accounts ADD CONSTRAINT whatsapp_accounts_qr_state_chk CHECK (qr_state IN ('DISCONNECTED', 'CONNECTING', 'QR', 'CONNECTED'));
ALTER TABLE whatsapp_accounts ADD CONSTRAINT whatsapp_accounts_meta_chk CHECK (provider <> 'META' OR (phone_number_id IS NOT NULL AND token_enc IS NOT NULL));
ALTER TABLE whatsapp_accounts ADD CONSTRAINT whatsapp_accounts_qr_ack_chk CHECK (provider <> 'QR' OR risk_ack_at IS NOT NULL);

-- Estado de autenticação da sessão (chaves do protocolo), SEMPRE cifrado com a chave do cofre.
CREATE TABLE whatsapp_qr_auth (
  account_id uuid NOT NULL REFERENCES whatsapp_accounts (id) ON DELETE CASCADE,
  key text NOT NULL,
  value_enc text NOT NULL,
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, key)
);
