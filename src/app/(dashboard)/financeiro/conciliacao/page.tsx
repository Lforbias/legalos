import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { uuidSchema } from "@/lib/validation/common";
import { FinanceNav } from "@/modules/finance/finance-nav";
import { StatementImportForm } from "@/modules/finance/statement-import-form";
import { StatementLines } from "@/modules/finance/statement-lines";
import { can } from "@/server/context";
import { getStatementImport, listStatementImports } from "@/server/services/bank-reconciliation.service";
import { listAccounts } from "@/server/services/finance.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Conciliação bancária" };

export default async function BankReconciliationPage({ searchParams }: { searchParams: Promise<{ importacao?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:read")) return <AccessDenied />;
  const sp = await searchParams;
  const importId = sp.importacao && uuidSchema.safeParse(sp.importacao).success ? sp.importacao : null;
  const [accounts, imports, selected] = await Promise.all([
    listAccounts(ctx),
    listStatementImports(ctx),
    importId ? getStatementImport(ctx, importId).catch(() => null) : Promise.resolve(null),
  ]);
  if (importId && !selected) notFound();
  const lines = selected?.lines.map((line) => ({
    id: line.id,
    postedOn: line.postedOn.toISOString().slice(0, 10),
    description: line.description,
    amount: line.amount.toString(),
    direction: line.direction,
    status: line.status,
    candidates: line.candidates.map((candidate) => ({
      id: candidate.id,
      description: candidate.description,
      amount: candidate.amount.toString(),
      paidAmount: candidate.paidAmount.toString(),
      dueDate: candidate.dueDate.toISOString().slice(0, 10),
      counterparty: candidate.counterparty,
    })),
  })) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Conciliação bancária" description="Compare linhas do extrato com lançamentos existentes. As baixas só são registradas quando você confirma a conciliação." />
      <FinanceNav current="conciliacao" />
      {selected ? (
        <>
          <Card>
            <CardHeader title={selected.statement.fileName} description={`${selected.statement.account.name} · importado ${formatDateTime(selected.statement.createdAt, ctx.timezone)}`} />
            <CardBody className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <span>{selected.statement.rowCount} linhas importadas</span>
              <span>{selected.statement.duplicateCount} duplicadas ignoradas</span>
              <span>{selected.statement.invalidCount} inválidas descartadas</span>
              <span>{lines.filter((line) => line.status === "MATCHED").length} conciliadas</span>
              <span>{lines.filter((line) => line.status === "PENDING").length} pendentes na tela</span>
              <Link className="text-primary-text underline" href="/financeiro/conciliacao">Voltar à conciliação</Link>
            </CardBody>
            {selected.statement.rowCount > lines.length ? <div className="px-4 pb-3"><Alert tone="warning">Mostrando {lines.length} de {selected.statement.rowCount} linhas. Importe extratos maiores em arquivos menores para revisar todos os itens desta tela.</Alert></div> : null}
            <StatementLines importId={selected.statement.id} lines={lines} canWrite={can(ctx, "finance:write")} />
          </Card>
          {can(ctx, "finance:write") ? <StatementImportForm accounts={accounts.map((account) => ({ id: account.id, name: account.name }))} /> : null}
        </>
      ) : (
        <>
          {can(ctx, "finance:write") ? <StatementImportForm accounts={accounts.map((account) => ({ id: account.id, name: account.name }))} /> : null}
          <Card>
            <CardHeader title="Extratos importados" />
            {imports.length ? (
              <ul className="divide-y divide-border">
                {imports.map((statement) => (
                  <li key={statement.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div><Link className="font-medium text-primary-text hover:underline" href={`/financeiro/conciliacao?importacao=${statement.id}`}>{statement.fileName}</Link><p className="text-xs text-muted">{statement.account.name} · {formatDateTime(statement.createdAt, ctx.timezone)}</p></div>
                    <span className="text-xs text-muted">{statement.rowCount} linhas · {statement.duplicateCount} duplicadas · {statement.invalidCount} inválidas</span>
                  </li>
                ))}
              </ul>
            ) : <CardBody><p className="text-sm text-muted">Nenhum extrato importado.</p></CardBody>}
          </Card>
        </>
      )}
    </div>
  );
}
