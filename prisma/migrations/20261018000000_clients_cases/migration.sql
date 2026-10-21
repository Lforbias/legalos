-- LegalOS: Fase 2 — clientes, contatos, processos, partes, equipe do processo, andamentos e documentos.
-- Mantida em sincronia manual com prisma/schema.prisma.
-- Integridade multi-tenant em profundidade: chaves estrangeiras COMPOSTAS (id, organization_id) impedem, no
-- próprio banco, que um registro de um escritório referencie registros de outro.

CREATE TYPE "ClientType" AS ENUM ('PERSON', 'COMPANY');
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED', 'CLOSED');
CREATE TYPE "PartyRole" AS ENUM ('PLAINTIFF', 'DEFENDANT', 'THIRD_PARTY', 'OTHER');
CREATE TYPE "CaseMemberRole" AS ENUM ('RESPONSIBLE', 'COLLABORATOR');
CREATE TYPE "EventSource" AS ENUM ('IMPORTED', 'INTERNAL', 'AUTOMATIC');

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  type "ClientType" NOT NULL,
  status "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
  name text NOT NULL,
  trade_name text,
  document text,
  email text,
  phone text,
  birth_date date,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  address_zip text,
  address_street text,
  address_number text,
  address_complement text,
  address_district text,
  address_city text,
  address_state text,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT clients_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT clients_email_lowercase CHECK (email IS NULL OR email = lower(email)),
  CONSTRAINT clients_document_format CHECK (document IS NULL OR document ~ '^[0-9A-Z]{11,14}$')
);
CREATE UNIQUE INDEX clients_org_document_key ON clients (organization_id, document) WHERE document IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX clients_org_status_idx ON clients (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX clients_org_name_idx ON clients (organization_id, lower(name));

CREATE TABLE client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  name text NOT NULL,
  role text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT client_contacts_email_lowercase CHECK (email IS NULL OR email = lower(email))
);
CREATE INDEX client_contacts_client_idx ON client_contacts (client_id);
CREATE INDEX client_contacts_org_idx ON client_contacts (organization_id);

CREATE TABLE cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  number text,
  legacy_number text,
  title text NOT NULL,
  area text,
  court text,
  court_unit text,
  court_state text,
  subject text,
  claim_value numeric(14,2),
  status "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
  phase text,
  distributed_at date,
  confidential boolean NOT NULL DEFAULT false,
  notes text,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT cases_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT cases_number_format CHECK (number IS NULL OR number ~ '^[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}$'),
  CONSTRAINT cases_claim_value_nonneg CHECK (claim_value IS NULL OR claim_value >= 0)
);
CREATE UNIQUE INDEX cases_org_number_key ON cases (organization_id, number) WHERE number IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX cases_org_status_idx ON cases (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX cases_org_created_idx ON cases (organization_id, created_at DESC);

CREATE TABLE case_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  case_id uuid NOT NULL,
  client_id uuid,
  role "PartyRole" NOT NULL,
  name text NOT NULL,
  document text,
  lawyer_name text,
  is_our_client boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT case_parties_client_implies_ours CHECK (client_id IS NULL OR is_our_client)
);
CREATE INDEX case_parties_case_idx ON case_parties (case_id);
CREATE INDEX case_parties_client_idx ON case_parties (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX case_parties_org_idx ON case_parties (organization_id);

CREATE TABLE case_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  case_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role "CaseMemberRole" NOT NULL DEFAULT 'COLLABORATOR',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT case_members_case_user_key UNIQUE (case_id, user_id)
);
CREATE UNIQUE INDEX case_members_one_responsible ON case_members (case_id) WHERE role = 'RESPONSIBLE';
CREATE INDEX case_members_user_idx ON case_members (user_id);
CREATE INDEX case_members_org_idx ON case_members (organization_id);

CREATE TABLE case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  case_id uuid NOT NULL,
  source "EventSource" NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  description text,
  occurred_at timestamptz(3) NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX case_events_case_idx ON case_events (case_id, occurred_at DESC);
CREATE INDEX case_events_org_idx ON case_events (organization_id);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  case_id uuid,
  client_id uuid,
  name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  storage_key text NOT NULL,
  uploaded_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT documents_has_owner CHECK (case_id IS NOT NULL OR client_id IS NOT NULL),
  CONSTRAINT documents_size_positive CHECK (size_bytes > 0)
);
CREATE UNIQUE INDEX documents_storage_key_key ON documents (storage_key);
CREATE INDEX documents_case_idx ON documents (case_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_client_idx ON documents (client_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_org_idx ON documents (organization_id);
