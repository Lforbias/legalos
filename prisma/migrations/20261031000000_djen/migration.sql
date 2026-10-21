-- Motor de tribunais, etapa 2a: monitoramento de publicações do DJEN (Diário de Justiça Eletrônico Nacional) por OAB.
CREATE TABLE djen_monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  oab_number text NOT NULL,
  oab_uf text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz(3),
  last_window_end date,
  last_status text,
  last_message text,
  created_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT djen_monitors_oab_chk CHECK (oab_number ~ '^[0-9]{1,7}$' AND oab_uf ~ '^[A-Z]{2}$')
);
CREATE UNIQUE INDEX djen_monitors_org_oab_uq ON djen_monitors (organization_id, oab_uf, oab_number);
