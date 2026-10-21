-- LegalOS Chat, fase 3: etiquetas e campos personalizados nas conversas.
CREATE TABLE whatsapp_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#2563eb',
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_labels_color_chk CHECK (color ~ '^#[0-9a-fA-F]{6}$')
);
CREATE UNIQUE INDEX whatsapp_labels_org_name_key ON whatsapp_labels (organization_id, lower(name));

CREATE TABLE whatsapp_conversation_labels (
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES whatsapp_labels(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, label_id)
);
CREATE INDEX whatsapp_conversation_labels_label_idx ON whatsapp_conversation_labels (label_id);

CREATE TABLE whatsapp_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'TEXT',
  options text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_fields_kind_chk CHECK (kind IN ('TEXT', 'NUMBER', 'DATE', 'SELECT'))
);
CREATE UNIQUE INDEX whatsapp_fields_org_name_key ON whatsapp_fields (organization_id, lower(name));

CREATE TABLE whatsapp_field_values (
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES whatsapp_fields(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  value text NOT NULL,
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, field_id)
);
CREATE INDEX whatsapp_field_values_field_idx ON whatsapp_field_values (field_id);
