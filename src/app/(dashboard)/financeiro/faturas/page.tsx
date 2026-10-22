import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatYmd } from "@/lib/dates/ymd";
import { formatMoneyBR } from "@/lib/validation/money";
import { CancelInvoiceButton, ToBillList } from "@/modules/finance/invoice-ui";
import { FinanceNav } from "@/modules/finance/finance-nav";
import { can } from "@/server/context";
import { listInvoices, listOpenBoletos, listToBill } from "@/server/services/fee-invoice.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Faturas" };

const STATE = { ISSUED: { label: "Emitida", tone: "info" }, PARTIAL: { label: "Parcialmente paga", tone: "warning" }, PAID: { label: "Paga", tone: "success" }, CANCELED: { label: "Cancelada", tone: "neutral" } } as const;
const ymd = (d: Date) => formatYmd(d.toISOString().slice(0, 10));

export default async function InvoicesPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:read")) return <AccessDenied />;
  const canWrite = can(ctx, "finance:write");
  const [toBill, invoices, boletos] = await Promise.all([listToBill(ctx), listInvoices(ctx), listOpenBoletos(ctx)]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Faturas" description="Honorários a faturar, faturas emitidas e boletos em aberto." />
      <FinanceNav current="faturas" />
      <Card>
        <CardHeader title="A faturar" description="Honorários a receber, de clientes, que ainda não estão em nenhuma fatura. Marque os itens de um cliente e emita." />
        <ToBillList canWrite={canWrite} groups={toBill.map((g) => ({ ...g, items: g.items.map((i) => ({ id: i.id, description: i.description, amount: i.amount, due: ymd(i.dueDate), installment: i.installment })) }))} />
      </Card>

      <Card className="mt-4">
        <CardHeader title="Faturas emitidas" />
        {invoices.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhuma fatura emitida.</p> : null}
        <ul className="divide-y divide-border">
          {invoices.map((i) => (
            <li key={i.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">Fatura nº {i.number}</span> · {i.clientName} · emitida em {ymd(i.issuedOn)}
                  {i.notes ? <p className="text-xs text-muted">{i.notes}</p> : null}
                  {i.canceledReason ? <p className="text-xs text-muted">Motivo: {i.canceledReason}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATE[i.state].tone}>{STATE[i.state].label}</Badge>
                  <span className="tabular-nums">{formatMoneyBR(i.total)}</span>
                </div>
              </div>
              {i.state !== "CANCELED" ? (
                <ul className="space-y-1 text-xs text-muted">
                  {i.entries.map((e) => (
                    <li key={e.id}>
                      <Link className="text-primary-text hover:underline" href={`/financeiro/lancamentos/${e.id}`}>{e.description}</Link> · vence {ymd(e.dueDate)} · {formatMoneyBR(e.amount)}
                      {e.boletoUrl ? <> · <a className="text-primary-text hover:underline" href={e.boletoUrl} target="_blank" rel="noopener noreferrer">boleto</a></> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {canWrite && i.state === "ISSUED" ? <CancelInvoiceButton id={i.id} /> : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Boletos em aberto" description="Lançamentos a receber com boleto guardado, ainda não pagos." />
        {boletos.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhum boleto em aberto.</p> : null}
        <ul className="divide-y divide-border">
          {boletos.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <Link href={`/financeiro/lancamentos/${b.id}`} className="font-medium text-primary-text hover:underline">{b.description}</Link>
                <p className="break-all text-xs text-muted">vence {ymd(b.dueDate)}{b.boletoCode ? ` · ${b.boletoCode}` : ""}</p>
              </div>
              <span className="tabular-nums">{formatMoneyBR(b.remaining)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
