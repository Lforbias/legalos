-- Códigos de tipo de documento do tribunal usados no protocolo pelo MNI (variam por tribunal; só o tribunal informa).
ALTER TABLE court_connections ADD COLUMN petition_types jsonb NOT NULL DEFAULT '{}'::jsonb;
