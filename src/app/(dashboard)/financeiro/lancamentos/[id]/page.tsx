import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { formatYmd, todayYmd } from "@/lib/dates/ymd";
import { fromCents, toCents } from "@/lib/finance/money";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { formatMoneyBR } from "@/lib/validation/money";
import { BoletoForm } from "@/modules/finance/invoice-ui";
import { PaymentForm } from "@/modules/finance/payment-form";
import { CancelEntryButton, ReversePaymentButton } from "@/modules/finance/reason-action";
import { ENTRY_KIND_LABEL, ENTRY_STATUS_LABEL, ENTRY_TYPE_LABEL } from "@/modules/finance/schemas";
import { can } from "@/server/context";
import { billingAvailability, billingHistoryForEntry } from "@/server/services/chat-billing.service";
import { getEntry, listAccounts } from "@/server/services/finance.service";
import { BillNowButton } from "@/modules/whatsapp/billing-ui";
import { ChargesCard } from "@/modules/finance/fee-ui";
import { listFeeCharges } from "@/server/services/fee-charge.service";
import { db } from "@/lib/db/client";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Lançamento" };

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:read")) return <AccessDenied />;
  const { id } = await params;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) notFound();
  let data;
  try {
    data = await getEntry(ctx, parsed.data);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { entry, client, caseTitle, caseHidden, accountName, categoryName, costCenterName, names, paymentAccounts } = data;
  const today = todayYmd(ctx.timezone);
  const due = entry.dueDate.toISOString().slice(0, 10);
  const remainingCents = (toCents(entry.amount.toString()) ?? 0n) - (toCents(entry.paidAmount.toString()) ?? 0n);
  const remaining = fromCents(remainingCents);
  const open = entry.status === "OPEN" || entry.status === "PARTIAL";
  const overdue = open && due < today;
  const canWrite = can(ctx, "finance:write");
  const canManage = can(ctx, "finance:manage");
  const accounts = canWrite && open ? await listAccounts(ctx) : [];
  const livePayments = entry.payments.filter((p) => !p.reversedAt);
  const showBilling = entry.kind === "RECEIVABLE" && entry.type === "FEE" && open;
  const canBill = canWrite && can(ctx, "whatsapp:write");
  const [billAv, billHist] = showBilling ? await Promise.all([billingAvailability(ctx, entry.id), billingHistoryForEntry(ctx, entry.id)]) : [null, []];
  const feeCfg = entry.kind === "RECEIVABLE" ? await db.feeAsaasConfig.findUnique({ where: { organizationId: ctx.organizationId }, select: { enabled: true } }) : null;
  const charges = entry.kind === "RECEIVABLE" ? await listFeeCharges(ctx, entry.id) : [];
  const sign = entry.kind === "RECEIVABLE" ? "Recebido" : "Pago";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={entry.description}
        description={`${ENTRY_KIND_LABEL[entry.kind]} · ${ENTRY_TYPE_LABEL[entry.type]}${entry.installmentTotal && entry.installmentTotal > 1 ? ` · parcela ${entry.installmentNo}/${entry.installmentTotal}` : ""}`}
        actions={canWrite && entry.status !== "CANCELED" ? <Link href={`/financeiro/lancamentos/${entry.id}/editar`} className={bv({ variant: "secondary" })}><Pencil className="h-4 w-4" aria-hidden /> Editar</Link> : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/financeiro/lancamentos" className="text-primary-text hover:underline">← Lançamentos</Link>
        <Badge tone={entry.status === "PAID" ? "success" : entry.status === "CANCELED" ? "neutral" : overdue ? "danger" : entry.status === "PARTIAL" ? "warning" : "info"} data-testid="entry-status">
          {overdue ? "Vencido" : ENTRY_STATUS_LABEL[entry.status]}
        </Badge>
      </div>
      {entry.status === "CANCELED" ? (
        <Alert tone="warning" className="mb-4">
          Cancelado em {entry.canceledAt ? formatDateTime(entry.canceledAt, ctx.timezone) : "—"}{entry.canceledById ? ` por ${names.get(entry.canceledById) ?? "—"}` : ""}. Motivo: {entry.canceledReason}
        </Alert>
      ) : null}

      <Card>
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Item label="Valor"><span className="font-semibold tabular-nums" data-testid="entry-amount">{formatMoneyBR(entry.amount.toString())}</span></Item>
            <Item label={sign}><span className="tabular-nums" data-testid="entry-paid">{formatMoneyBR(entry.paidAmount.toString())}</span></Item>
            <Item label="Saldo em aberto"><span className="tabular-nums" data-testid="entry-remaining">{formatMoneyBR(entry.status === "CANCELED" ? "0" : remaining)}</span></Item>
            <Item label="Emissão">{formatYmd(entry.issueDate.toISOString().slice(0, 10))}</Item>
            <Item label="Vencimento">{formatYmd(due)}</Item>
            <Item label="Conta">{accountName ?? "—"}</Item>
            <Item label="Categoria">{categoryName ?? "—"}</Item>
            <Item label="Centro de custo">{costCenterName ?? "—"}</Item>
            <Item label={entry.kind === "RECEIVABLE" ? "Pagador" : "Fornecedor"}>{entry.counterparty ?? "—"}</Item>
            <Item label="Cliente">{client ? <Link href={`/clientes/${client.id}`} className="text-primary-text hover:underline">{client.name}</Link> : "—"}</Item>
            <Item label="Processo">
              {caseHidden ? <span className="text-muted">Processo restrito</span> : caseTitle && entry.caseId ? <Link href={`/processos/${entry.caseId}`} className="text-primary-text hover:underline">{caseTitle}</Link> : "—"}
            </Item>
            <Item label="Lançado por">{entry.createdById ? (names.get(entry.createdById) ?? "—") : "Importação"}</Item>
          </dl>
          {entry.notes ? <p className="mt-4 whitespace-pre-wrap border-t border-border pt-3 text-sm">{entry.notes}</p> : null}
        </CardBody>
      </Card>

      {open && canWrite ? (
        <Card className="mt-4">
          <CardHeader title={entry.kind === "RECEIVABLE" ? "Registrar recebimento" : "Registrar pagamento"} description="A baixa pode ser parcial. O valor não pode passar do saldo em aberto." />
          <CardBody>
            <PaymentForm entryId={entry.id} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} defaultAccountId={entry.accountId ?? ""} remaining={remaining} today={today} />
          </CardBody>
        </Card>
      ) : null}

      {entry.kind === "RECEIVABLE" && entry.status !== "CANCELED" && (open || charges.length > 0) ? (
        <Card className="mt-4">
          <CardHeader title="Cobrança por Pix e boleto" description="Gerada na conta Asaas do escritório. A baixa é automática quando o cliente paga." />
          <CardBody><ChargesCard entryId={entry.id} enabled={!!feeCfg?.enabled && open} canWrite={canWrite} rows={charges.map((c) => ({ id: c.id, billingType: c.billingType, value: c.value, status: c.status, invoiceUrl: c.invoiceUrl, boletoUrl: c.boletoUrl, pixPayload: c.pixPayload, pixImage: c.pixImage }))} /></CardBody>
        </Card>
      ) : null}

      {entry.kind === "RECEIVABLE" && entry.status !== "CANCELED" && canWrite ? (
        <Card className="mt-4">
          <CardHeader title="Boleto" description="Dados do boleto gerado fora do sistema." />
          <CardBody>
            <BoletoForm entryId={entry.id} code={entry.boletoCode ?? ""} url={entry.boletoUrl ?? ""} />
          </CardBody>
        </Card>
      ) : null}

      {showBilling && billAv ? (
        <Card className="mt-4">
          <CardHeader title="Cobrança pelo WhatsApp" description="Envia agora o lembrete ao cliente pelo número conectado do Chat. Os envios automáticos também aparecem aqui." />
          <CardBody>
            <BillNowButton
              entryId={entry.id}
              available={canBill && billAv.ok}
              reason={!canBill ? "Você não tem permissão para enviar mensagens pelo WhatsApp." : billAv.reason}
              history={billHist.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() }))}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader title="Baixas" description="Estornos ficam no histórico; nada é apagado." />
        {entry.payments.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhuma baixa registrada.</p> : null}
        <ul className="divide-y divide-border">
          {entry.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm" data-testid="payment-row">
              <div className="min-w-0">
                <p className={p.reversedAt ? "text-muted line-through" : "font-medium"}>
                  {formatMoneyBR(p.amount.toString())} · {formatYmd(p.paidOn.toISOString().slice(0, 10))}
                </p>
                <p className="text-xs text-muted">
                  {paymentAccounts.get(p.accountId) ?? "Conta"}{p.method ? ` · ${p.method}` : ""}{p.createdById ? ` · por ${names.get(p.createdById) ?? "—"}` : ""}{p.note ? ` · ${p.note}` : ""}
                </p>
                {p.reversedAt ? (
                  <p className="mt-1 text-xs text-danger">
                    Estornada em {formatDateTime(p.reversedAt, ctx.timezone)}{p.reversedById ? ` por ${names.get(p.reversedById) ?? "—"}` : ""}. Motivo: {p.reversalReason}
                  </p>
                ) : null}
              </div>
              {!p.reversedAt && canManage ? (
                <ReversePaymentButton paymentId={p.id} entryId={entry.id} />
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {canManage && entry.status !== "CANCELED" ? (
        <Card className="mt-4">
          <CardHeader title="Cancelar lançamento" description={livePayments.length ? "Há baixas ativas: estorne-as antes de cancelar." : "O lançamento fica no histórico como cancelado."} />
          <CardBody>
            {livePayments.length === 0 ? <CancelEntryButton entryId={entry.id} /> : <p className="text-sm text-muted">Cancelamento indisponível enquanto houver baixas não estornadas.</p>}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
