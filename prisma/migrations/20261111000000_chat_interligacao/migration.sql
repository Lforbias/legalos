-- LegalOS Chat: a conversa passa a se ligar a processo e a lead do CRM (além do cliente).
ALTER TABLE whatsapp_conversations
  ADD COLUMN case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  ADD COLUMN lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;
CREATE INDEX whatsapp_conversations_client_id_idx ON whatsapp_conversations (client_id);
CREATE INDEX whatsapp_conversations_case_id_idx ON whatsapp_conversations (case_id);
CREATE INDEX whatsapp_conversations_lead_id_idx ON whatsapp_conversations (lead_id);
