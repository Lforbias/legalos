-- Fase 9a: bloqueio progressivo de conta e autenticação multifator (TOTP + códigos de recuperação).
ALTER TABLE users ADD COLUMN failed_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until timestamptz(3);

CREATE TABLE user_mfa (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc text NOT NULL,
  enabled_at timestamptz(3),
  last_step bigint,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT mfa_recovery_codes_uq UNIQUE (user_id, code_hash)
);

CREATE TABLE mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  redirect_to text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz(3) NOT NULL,
  used_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX mfa_challenges_user_idx ON mfa_challenges (user_id);
