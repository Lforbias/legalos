import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/dates/format";
import { BillingPanel } from "@/modules/billing/billing-panel";
import { can } from "@/server/context";
import { billingAvailable, getBillingOverview } from "@/server/services/billing.service";
import { getEntitlements, getUsage, type PlanState } from "@/server/services/plan.service";
import { getOrganization } from "@/server/services/organization.service";
import { MAX_NUMBERS } from "@/server/services/whatsapp-numbers.service";
import { requireTenant } from "@/server/session";
import { LEGALOS_PLANS, formatBRL } from "@/config/pricing";

export const metadata: Metadata = { title: "Plano e uso" };

const STATE_LABEL: Record<PlanState, string> = { ok: "Em dia", trial_ending: "Teste terminando", trial_expired: "Teste encerrado", past_due: "Pagamento em atraso", canceled: "Cancelada", none: "Sem assinatura" };
const STATE_TONE: Record<PlanState, "success" | "info" | "warning" | "danger" | "neutral"> = { ok: "success", trial_ending: "warning", trial_expired: "danger", past_due: "warning", canceled: "danger", none: "neutral" };
const mb = (n: number) => `${(n / 1048576).toFixed(1).replace(".", ",")} MB`;

function Meter({ label, used, limit, fmt, none }: { label: string; used: number; limit: number | null; fmt: (n: number) => string; none?: string }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">{none ?? `${fmt(used)} / ${limit == null ? "ilimitado" : fmt(limit)}`}</span>
      </div>
      {limit != null && limit > 0 ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : pct >= 85 ? "bg-warning" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export default async function PlanSettingsPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const params = await searchParams;
  const selectedPlan = LEGALOS_PLANS.find((plan) => plan.id === params.checkout);
  const { ctx } = await requireTenant();
  const org = await getOrganization(ctx);
  const [ent, usage] = await Promise.all([getEntitlements(ctx.organizationId), getUsage(ctx.organizationId)]);
  const billing = can(ctx, "billing:manage") ? await getBillingOverview(ctx) : null;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {selectedPlan ? (
        <Card>
          <CardHeader title={`Plano selecionado: ${selectedPlan.name}`} />
          <CardBody className="space-y-2 text-sm">
            <p>{formatBRL(selectedPlan.price)}/mês · até {selectedPlan.users} usuários e {selectedPlan.processes.toLocaleString("pt-BR")} processos{selectedPlan.whatsappNumbers ? ` · ${selectedPlan.whatsappNumbers} número(s) de WhatsApp` : ""}.</p>
            <p className="text-muted">Nenhuma contratação ou cobrança foi iniciada. Confira os dados de cobrança e use o botão de contratação somente quando quiser prosseguir. Sua avaliação gratuita não será convertida automaticamente.</p>
          </CardBody>
        </Card>
      ) : null}
      <Card data-testid="plan-card">
        <CardHeader title="Plano e uso" />
        <CardBody className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Plano</span>
            <strong>{ent.planName ?? "—"}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Situação</span>
            <Badge tone={STATE_TONE[ent.state]}>{STATE_LABEL[ent.state]}</Badge>
          </div>
          {ent.status === "TRIALING" && ent.trialEndsAt ? (
            <div className="flex items-center justify-between"><span className="text-muted">Teste até</span><span>{formatDate(ent.trialEndsAt, org.timezone)}</span></div>
          ) : null}
          {ent.status === "ACTIVE" && ent.currentPeriodEnd ? (
            <div className="flex items-center justify-between"><span className="text-muted">Período pago até</span><span>{formatDate(ent.currentPeriodEnd, org.timezone)}</span></div>
          ) : null}
          <Meter label="Usuários (com convites pendentes)" used={usage.users + usage.pendingInvites} limit={ent.limits.maxUsers} fmt={(n) => String(n)} />
          <Meter label="Processos e casos cadastrados" used={usage.processes} limit={ent.limits.maxProcesses} fmt={(n) => n.toLocaleString("pt-BR")} />
          <Meter label="Números de WhatsApp" used={usage.whatsappNumbers} limit={ent.limits.maxWhatsappNumbers ?? MAX_NUMBERS} fmt={(n) => String(n)} />
          <Meter label="Armazenamento" used={usage.storageBytes} limit={ent.limits.maxStorageMb == null ? null : ent.limits.maxStorageMb * 1048576} fmt={mb} />
          <Meter label="IA neste mês (tokens)" used={usage.aiTokensMonth} limit={ent.limits.maxAiTokensMonth == null ? null : ent.limits.maxAiTokensMonth} fmt={(n) => n.toLocaleString("pt-BR")} none={ent.limits.maxAiTokensMonth === 0 ? "Não incluída no plano" : undefined} />
          <p className="pt-1 text-xs text-muted">
            {billingAvailable() ? "A assinatura e as faturas ficam no cartão abaixo." : "A cobrança ainda é combinada diretamente com a administração da plataforma."} Dados nunca são apagados ou bloqueados para consulta e download por falta de plano; apenas novos envios, uso de IA e convites podem ser recusados.
          </p>
        </CardBody>
      </Card>
      {billing ? (
        <Card className="lg:col-span-3" data-testid="billing-card">
          <CardHeader title="Assinatura e faturas" />
          <CardBody>
            <BillingPanel
              data={{
                available: billing.available,
                sandbox: billing.sandbox,
                checkoutAllowed: billing.checkoutAllowed,
                checkoutState: billing.checkoutState,
                plans: billing.plans,
                current: billing.current,
                automatic: billing.automatic,
                cancelRequestedAt: billing.cancelRequestedAt ? billing.cancelRequestedAt.toISOString() : null,
                profile: billing.profile,
                invoices: billing.invoices.map((i) => ({ id: i.id, status: i.status, valueCents: i.valueCents, dueDate: i.dueDate.toISOString(), paidAt: i.paidAt ? i.paidAt.toISOString() : null, invoiceUrl: i.invoiceUrl })),
              }}
              selectedPlanKey={selectedPlan?.id}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
