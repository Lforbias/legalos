-- Fase 8c: consulta DataJud/CNJ (opt-in por escritório) e chave de idempotência dos andamentos importados.
ALTER TABLE organizations ADD COLUMN datajud_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE cases ADD COLUMN datajud_synced_at timestamptz(3);
ALTER TABLE case_events ADD COLUMN external_key text;
CREATE UNIQUE INDEX case_events_case_external_key_uq ON case_events (case_id, external_key) WHERE external_key IS NOT NULL;
