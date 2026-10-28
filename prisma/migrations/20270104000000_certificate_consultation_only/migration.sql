-- Preserve existing certificates' prior behavior; every new upload is explicitly read-only.
ALTER TABLE certificates ADD COLUMN consultation_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE certificates ALTER COLUMN consultation_only SET DEFAULT true;
