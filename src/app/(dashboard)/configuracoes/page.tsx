import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/dates/format";
import { BillingPanel } from "@/modules/billing/billing-panel";
import { RequireMfaCard } from "@/modules/organizations/require-mfa-card";
import { OrganizationForm } from "@/modules/organizations/organization-form";
import { can } from "@/server/context";
import { billingAvailable, getBillingOverview } from "@/server/services/billing.service";
import { getEntitlements, getUsage, type PlanState } from "@/server/services/plan.service";
import { getOrganization, mfaCoverage } from "@/server/services/organization.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Escritório" };

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

export default async function OrganizationSettingsPage() {
  const { ctx } = await requireTenant();
  const org = await getOrganization(ctx);
  const [ent, usage] = await Promise.all([getEntitlements(ctx.organizationId), getUsage(ctx.organizationId)]);
  const mfa = can(ctx, "organization:manage") ? await mfaCoverage(ctx) : null;
  const billing = can(ctx, "billing:manage") ? await getBillingOverview(ctx) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Dados do escritório" />
        <CardBody>
          <OrganizationForm
            canEdit={can(ctx, "organization:manage")}
            initial={{ name: org.name, legalName: org.legalName ?? "", document: org.document ?? "", timezone: org.timezone }}
          />
        </CardBody>
      </Card>
      {mfa ? (
        <Card className="lg:col-span-3">
          <CardHeader title="Segurança" description="Exigir a verificação em duas etapas de todos os membros da equipe." />
          <CardBody><RequireMfaCard required={org.requireMfa} total={mfa.total} withMfa={mfa.withMfa} canEdit /></CardBody>
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
                plans: billing.plans.map((p) => ({ key: p.key, name: p.name, description: p.description, priceCents: p.priceCents })),
                current: billing.current,
                automatic: billing.automatic,
                cancelRequestedAt: billing.cancelRequestedAt ? billing.cancelRequestedAt.toISOString() : null,
                profile: billing.profile,
                invoices: billing.invoices.map((i) => ({ id: i.id, status: i.status, valueCents: i.valueCents, dueDate: i.dueDate.toISOString(), paidAt: i.paidAt ? i.paidAt.toISOString() : null, invoiceUrl: i.invoiceUrl })),
              }}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
