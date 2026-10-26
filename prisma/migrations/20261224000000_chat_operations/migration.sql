ALTER TABLE whatsapp_accounts ADD COLUMN auto_status_enabled boolean NOT NULL DEFAULT true, ADD COLUMN reopen_after_minutes integer NOT NULL DEFAULT 30 CHECK(reopen_after_minutes BETWEEN 1 AND 10080), ADD COLUMN reassign_on_reopen boolean NOT NULL DEFAULT true;
ALTER TABLE whatsapp_conversations ADD COLUMN service_status text NOT NULL DEFAULT 'OPEN' CHECK(service_status IN ('OPEN','IN_SERVICE','WAITING','RESOLVED','CLOSED','UNDEFINED')), ADD COLUMN closed_at timestamptz(3);
UPDATE whatsapp_conversations SET service_status='CLOSED',closed_at=last_message_at WHERE status='CLOSED';
CREATE INDEX whatsapp_conversations_service_idx ON whatsapp_conversations(organization_id,service_status,last_message_at);
ALTER TABLE whatsapp_campaigns ADD COLUMN last_batch_at timestamptz(3);
ALTER TABLE whatsapp_campaign_recipients ADD COLUMN claimed_at timestamptz(3);

ALTER TABLE whatsapp_messages ADD COLUMN call_data jsonb;

-- Compatibilidade com rotinas legadas que ainda usam OPEN/CLOSED: as duas representações permanecem coerentes.
CREATE FUNCTION sync_chat_service_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status='CLOSED' AND NEW.service_status='OPEN' THEN NEW.service_status='CLOSED'; END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.service_status IS NOT DISTINCT FROM OLD.service_status THEN
    NEW.service_status=CASE WHEN NEW.status='CLOSED' THEN 'CLOSED' ELSE 'OPEN' END;
  END IF;
  NEW.status=CASE WHEN NEW.service_status IN ('CLOSED','RESOLVED') THEN 'CLOSED' ELSE 'OPEN' END;
  IF NEW.status='CLOSED' THEN NEW.closed_at=coalesce(NEW.closed_at,CURRENT_TIMESTAMP);
  ELSE NEW.closed_at=NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER whatsapp_service_status_sync BEFORE INSERT OR UPDATE OF status,service_status ON whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION sync_chat_service_status();
