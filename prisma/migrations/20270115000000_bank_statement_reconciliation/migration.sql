CREATE TYPE "BankStatementLineStatus" AS ENUM ('PENDING', 'MATCHED', 'IGNORED');

CREATE TABLE "bank_statement_imports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_count" INTEGER NOT NULL DEFAULT 0,
    "imported_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_statement_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "posted_on" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "direction" "FinanceEntryKind" NOT NULL,
    "status" "BankStatementLineStatus" NOT NULL DEFAULT 'PENDING',
    "matched_entry_id" UUID,
    "payment_id" UUID,
    "matched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_statement_lines_payment_id_key" ON "bank_statement_lines"("payment_id");
CREATE UNIQUE INDEX "bank_statement_lines_org_fingerprint_key" ON "bank_statement_lines"("organization_id", "fingerprint");
CREATE INDEX "bank_statement_imports_org_created_idx" ON "bank_statement_imports"("organization_id", "created_at" DESC);
CREATE INDEX "bank_statement_lines_org_status_date_idx" ON "bank_statement_lines"("organization_id", "status", "posted_on");
CREATE INDEX "bank_statement_lines_import_status_idx" ON "bank_statement_lines"("import_id", "status");

ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "bank_statement_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matched_entry_id_fkey" FOREIGN KEY ("matched_entry_id") REFERENCES "finance_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "finance_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
