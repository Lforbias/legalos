-- LegalOS Chat: interruptor da distribuição automática de conversas (as demais automações já tinham o seu).
ALTER TABLE whatsapp_accounts ADD COLUMN auto_assign_enabled boolean NOT NULL DEFAULT true;
