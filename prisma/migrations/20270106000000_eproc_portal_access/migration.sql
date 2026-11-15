ALTER TABLE portal_accesses
  DROP CONSTRAINT portal_accesses_system_check;

ALTER TABLE portal_accesses
  ADD CONSTRAINT portal_accesses_system_check
  CHECK (system IN ('pje', 'eproc-portal'));
