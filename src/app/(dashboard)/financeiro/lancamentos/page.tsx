import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { ExportLinks } from "@/modules/export/export-links";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants as bv } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { todayYmd, formatYmd } from "@/lib/dates/ymd";
import { formatMoneyBR } from "@/lib/validation/money";
import { fromCents, toCents } from "@/lib/finance/money";
import { FinanceNav } from "@/modules/finance/finance-nav";
import { ENTRY_STATUS_LABEL, ENTRY_TYPE_LABEL } from "@/modules/finance/schemas";
import { can } from "@/server/context";
import { listCategories, listEntries } from "@/server/services/finance.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Lançamentos" };

type SP = { tipo?: string; status?: string; q?: string; de?: string; ate?: string; cliente?: string; processo?: string; categoria?: string; pagina?: string };

export default async function EntriesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:read")) return <AccessDenied />;
  const sp = await searchParams;
  const kind = sp.tipo === "receber" ? "RECEIVABLE" : sp.tipo === "pagar" ? "PAYABLE" : undefined;
  const status = sp.status ?? "aberto";
  const [res, categories] = await Promise.all([
    listEntries(ctx, { kind, status, q: sp.q, from: sp.de, to: sp.ate, clientId: sp.cliente, caseId: sp.processo, categoryId: sp.categoria, page: Number(sp.pagina) || 1 }),
    listCategories(ctx, { includeInactive: true }),
  ]);
  const today = todayYmd(ctx.timezone);
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v && k !== "pagina") params[k] = v;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Lançamentos" actions={<div className="flex flex-wrap items-center gap-2"><ExportLinks kind="lancamentos" />{can(ctx, "finance:write") ? <Link href="/financeiro/lancamentos/novo" className={bv({})}><Plus className="h-4 w-4" aria-hidden /> Novo lançamento</Link> : null}</div>} />
      <FinanceNav current="lancamentos" />
      <form method="get" className="mb-4 grid gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filtros">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar descrição ou parte" aria-label="Buscar" className="lg:col-span-2" />
        <Select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo">
          <option value="">A receber e a pagar</option>
          <option value="receber">A receber</option>
          <option value="pagar">A pagar</option>
        </Select>
        <Select name="status" defaultValue={status} aria-label="Situação">
          <option value="aberto">Em aberto</option>
          <option value="vencido">Vencidos</option>
          <option value="pago">Pagos</option>
          <option value="cancelado">Cancelados</option>
          <option value="todos">Todos</option>
        </Select>
        <Select name="categoria" defaultValue={sp.categoria ?? ""} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <div className="flex gap-2">
          <Input type="date" name="de" defaultValue={sp.de ?? ""} aria-label="Vencimento de" />
          <Input type="date" name="ate" defaultValue={sp.ate ?? ""} aria-label="Vencimento até" />
        </div>
        <div className="sm:col-span-2 lg:col-span-6"><Button type="submit" size="sm">Filtrar</Button></div>
      </form>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-sm">
          <span data-testid="entries-count">{res.total} lançamento(s)</span>
          <span className="tabular-nums text-muted">Total {formatMoneyBR(res.totalAmount)} · Saldo em aberto {formatMoneyBR(res.totalRemaining)}</span>
        </div>
        {res.items.length === 0 ? <p className="p-8 text-center text-sm text-muted">Nenhum lançamento encontrado com estes filtros.</p> : null}
        <ul className="divide-y divide-border">
          {res.items.map((e) => {
            const due = e.dueDate.toISOString().slice(0, 10);
            const overdue = (e.status === "OPEN" || e.status === "PARTIAL") && due < today;
            const remaining = fromCents((toCents(e.amount.toString()) ?? 0n) - (toCents(e.paidAmount.toString()) ?? 0n));
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <Link href={`/financeiro/lancamentos/${e.id}`} className="text-primary-text hover:underline">{e.description}</Link>{" "}
                    <Badge tone={e.status === "PAID" ? "success" : e.status === "CANCELED" ? "neutral" : overdue ? "danger" : e.status === "PARTIAL" ? "warning" : "info"}>
                      {overdue ? "Vencido" : ENTRY_STATUS_LABEL[e.status]}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted">
                    {e.kind === "RECEIVABLE" ? "A receber" : "A pagar"} · {ENTRY_TYPE_LABEL[e.type]} · vence {formatYmd(due)}
                    {e.installmentTotal && e.installmentTotal > 1 ? ` · parcela ${e.installmentNo}/${e.installmentTotal}` : ""}
                    {e.clientName ? ` · ${e.clientName}` : ""}
                    {e.caseTitle ? ` · ${e.caseTitle}` : ""}
                  </p>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <p>{formatMoneyBR(e.amount.toString())}</p>
                  {e.status === "PARTIAL" ? <p className="text-xs text-muted">restam {formatMoneyBR(remaining)}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <Pagination basePath="/financeiro/lancamentos" params={params} page={res.page} pages={pages} total={res.total} />
    </div>
  );
}
