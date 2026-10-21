import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/dates/format";
import { CREDIT_ACTIONS } from "@/lib/credits";
import { LowThresholdForm } from "@/modules/billing/credits-threshold";
import { can } from "@/server/context";
import { getCreditsOverview, runCreditsCheck } from "@/server/services/credit.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Créditos" };

export default async function CreditsPage() {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "billing:manage")) return <AccessDenied />;
  await runCreditsCheck(ctx.organizationId).catch(() => 0);
  const o = await getCreditsOverview(ctx);
  const tz = organization.timezone;
  return (
    <div className="space-y-4">
      {!o.enabled ? <Alert tone="info">A cobrança por créditos não está ligada neste escritório: nenhuma ação consome créditos. Quem liga e concede créditos é o administrador do sistema.</Alert> : null}
      <Card>
        <CardHeader title="Saldo" description="Créditos válidos hoje. Cada ação consome do lote que vence primeiro." />
        <CardBody className="space-y-3">
          <p className="text-3xl font-semibold tabular-nums" data-testid="credits-balance">{o.balance.toLocaleString("pt-BR")}</p>
          {o.enabled ? <LowThresholdForm initial={o.lowThreshold} /> : null}
          <ul className="divide-y divide-border text-sm">
            {o.grants.length === 0 ? <li className="py-2 text-muted">Nenhum lote com saldo.</li> : null}
            {o.grants.map((g) => (
              <li key={g.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{g.remaining.toLocaleString("pt-BR")} de {g.amount.toLocaleString("pt-BR")}{g.note ? ` — ${g.note}` : ""}</span>
                <span className="text-xs text-muted">{g.expiresAt ? `vence em ${formatDate(g.expiresAt, tz)}` : "sem validade"}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Custo por ação" />
        <CardBody>
          <ul className="text-sm">
            {o.costs.map((c) => (
              <li key={c.key} className="flex justify-between py-1"><span>{c.label}</span><span className="tabular-nums">{c.cost} créditos</span></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Protocolo de demonstração não cobra. A cobrança acontece só depois do protocolo concluído.</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Extrato (últimos 30 usos)" />
        <CardBody>
          {o.usage.length === 0 ? <p className="text-sm text-muted">Nenhum uso ainda.</p> : null}
          <ul className="divide-y divide-border text-sm">
            {o.usage.map((u) => (
              <li key={u.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{CREDIT_ACTIONS[u.action as keyof typeof CREDIT_ACTIONS]?.label ?? u.action}</span>
                <span className="text-xs text-muted">−{u.cost} · {formatDateTime(u.createdAt, tz)}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
