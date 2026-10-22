-- 2.0-F4: faturas de honorários (a faturar / emitidas) e boleto por lançamento.
CREATE TABLE "fee_invoices" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "client_id" UUID NOT NULL,
  "issued_on" DATE NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  "notes" TEXT,
  "canceled_at" TIMESTAMPTZ(3),
  "canceled_reason" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fee_invoices_organization_id_number_key" ON "fee_invoices"("organization_id", "number");
CREATE INDEX "fee_invoices_organization_id_client_id_idx" ON "fee_invoices"("organization_id", "client_id");
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance_entries" ADD COLUMN "boleto_code" TEXT, ADD COLUMN "boleto_url" TEXT, ADD COLUMN "invoice_id" UUID;
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "finance_entries_invoice_id_idx" ON "finance_entries"("invoice_id");
