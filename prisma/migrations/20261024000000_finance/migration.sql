-- Fase 7 — Financeiro: contas, categorias, centros de custo, lançamentos (a receber/a pagar), baixas e estornos.
-- Dinheiro sempre em numeric(14,2). Lançamentos nunca são apagados: cancelam-se (sem baixas) e baixas se estornam.

CREATE TYPE "FinanceEntryKind" AS ENUM ('RECEIVABLE', 'PAYABLE');
CREATE TYPE "FinanceEntryStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELED');
CREATE TYPE "FinanceEntryType" AS ENUM ('FEE', 'EXPENSE', 'OTHER');
CREATE TYPE "FinanceAccountKind" AS ENUM ('CHECKING', 'CASH', 'OTHER');

CREATE TABLE finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  kind "FinanceAccountKind" NOT NULL DEFAULT 'CHECKING',
  initial_balance numeric(14,2) NOT NULL DEFAULT 0,
  opening_date date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT finance_accounts_id_org_key UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX finance_accounts_name_key ON finance_accounts (organization_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT finance_categories_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT finance_categories_color_chk CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
);
CREATE UNIQUE INDEX finance_categories_name_key ON finance_categories (organization_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3),
  CONSTRAINT cost_centers_id_org_key UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX cost_centers_name_key ON cost_centers (organization_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  kind "FinanceEntryKind" NOT NULL,
  type "FinanceEntryType" NOT NULL DEFAULT 'OTHER',
  status "FinanceEntryStatus" NOT NULL DEFAULT 'OPEN',
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  account_id uuid,
  category_id uuid,
  cost_center_id uuid,
  client_id uuid,
  case_id uuid,
  counterparty text,
  notes text,
  group_id uuid,
  installment_no integer,
  installment_total integer,
  canceled_at timestamptz(3),
  canceled_reason text,
  canceled_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT finance_entries_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT finance_entries_amount_pos CHECK (amount > 0),
  CONSTRAINT finance_entries_paid_range CHECK (paid_amount >= 0 AND paid_amount <= amount),
  CONSTRAINT finance_entries_status_consistent CHECK (
    (status = 'OPEN' AND paid_amount = 0)
    OR (status = 'PARTIAL' AND paid_amount > 0 AND paid_amount < amount)
    OR (status = 'PAID' AND paid_amount = amount)
    OR (status = 'CANCELED' AND paid_amount = 0 AND canceled_at IS NOT NULL)
  ),
  CONSTRAINT finance_entries_installment_chk CHECK (installment_no IS NULL OR (installment_no >= 1 AND installment_total >= installment_no)),
  FOREIGN KEY (account_id, organization_id) REFERENCES finance_accounts (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (category_id, organization_id) REFERENCES finance_categories (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (cost_center_id, organization_id) REFERENCES cost_centers (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (case_id, organization_id) REFERENCES cases (id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX finance_entries_org_due_idx ON finance_entries (organization_id, due_date);
CREATE INDEX finance_entries_org_status_idx ON finance_entries (organization_id, status);
CREATE INDEX finance_entries_client_idx ON finance_entries (organization_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX finance_entries_case_idx ON finance_entries (organization_id, case_id) WHERE case_id IS NOT NULL;

CREATE TABLE finance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  account_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  paid_on date NOT NULL,
  method text,
  note text,
  created_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  reversed_at timestamptz(3),
  reversed_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  reversal_reason text,
  CONSTRAINT finance_payments_amount_pos CHECK (amount > 0),
  CONSTRAINT finance_payments_reversal_chk CHECK ((reversed_at IS NULL) = (reversal_reason IS NULL)),
  FOREIGN KEY (entry_id, organization_id) REFERENCES finance_entries (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (account_id, organization_id) REFERENCES finance_accounts (id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX finance_payments_entry_idx ON finance_payments (entry_id);
CREATE INDEX finance_payments_org_date_idx ON finance_payments (organization_id, paid_on);

-- Nova permissão: cadastros (contas, categorias, centros de custo), cancelamento e estorno.
UPDATE roles SET permissions = array_append(permissions, 'finance:manage')
 WHERE is_system AND key IN ('OWNER', 'ADMIN', 'FINANCE') AND NOT ('finance:manage' = ANY(permissions));
