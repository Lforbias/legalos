-- Painel de administração da plataforma: super-administradores (concedidos só por script) e suspensão de escritórios.
CREATE TABLE platform_admins (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_at timestamptz(3) NOT NULL DEFAULT now(),
  granted_note text
);

ALTER TABLE organizations
  ADD COLUMN suspended_at timestamptz(3),
  ADD COLUMN suspended_reason text,
  ADD CONSTRAINT organizations_suspension_chk CHECK ((suspended_at IS NULL) = (suspended_reason IS NULL));
