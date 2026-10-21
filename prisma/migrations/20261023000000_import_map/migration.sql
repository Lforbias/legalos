-- Importação de dados de outros sistemas (Astrea): mapa de códigos externos → registros internos.
-- Permite reimportar sem duplicar (idempotência) e relacionar processo ↔ prazos/tarefas entre execuções.
CREATE TABLE import_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  source text NOT NULL,
  entity text NOT NULL,
  external_id text NOT NULL,
  internal_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT import_map_unique UNIQUE (organization_id, source, entity, external_id)
);
CREATE INDEX import_map_internal_idx ON import_map (organization_id, internal_id);
