import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { formatDate, formatDateTime } from "@/lib/dates/format";
import { CreditsControl, OrgSuspendControl, SubscriptionControl } from "@/modules/platform/admin-controls";
import { requirePlatform } from "@/server/platform";
import { platformCreditsSnapshot } from "@/server/services/credit.service";
import { listOrganizations, listPlans } from "@/server/services/platform.service";

export const metadata: Metadata = { title: "Administração — escritórios" };
export const dynamic = "force-dynamic";

export default async function OrgsPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string }> }) {
  const { pc } = await requirePlatform();
  const sp = await searchParams;
  const status = sp.situacao === "suspensos" ? "suspended" : sp.situacao === "ativos" ? "active" : undefined;
  const [r, plans] = await Promise.all([listOrganizations(pc, { q: sp.q, status }), listPlans(pc)]);
  const credits = await platformCreditsSnapshot(pc, r.items.map((o) => o.id));
  const STATUS: Record<string, string> = { TRIALING: "Em teste", ACTIVE: "Ativa", PAST_DUE: "Em atraso", CANCELED: "Cancelada" };
  return (
    <div>
      <PageHeader title="Escritórios" description="Suspender bloqueia o acesso de todos os membros e para as rotinas automáticas, mas preserva os dados. Fica registrado na auditoria." />
      <form method="get" className="mb-4 flex flex-wrap gap-2" role="search" aria-label="Filtrar escritórios">
        <label htmlFor="q" className="sr-only">Buscar</label>
        <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Nome ou identificador" className="w-64" />
        <label htmlFor="situacao" className="sr-only">Situação</label>
        <Select id="situacao" name="situacao" defaultValue={sp.situacao ?? ""} className="w-44">
          <option value="">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="suspensos">Suspensos</option>
        </Select>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Filtrar</button>
      </form>
      {r.total > r.items.length ? <p className="mb-2 text-xs text-warning">Mostrando {r.items.length} de {r.total}.</p> : null}
      {r.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">Nenhum escritório encontrado.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Escritórios</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Escritório</th>
                <th scope="col" className="px-3 py-2 font-medium">Membros (2FA)</th>
                <th scope="col" className="px-3 py-2 font-medium">Processos</th>
                <th scope="col" className="px-3 py-2 font-medium">Intimações abertas</th>
                <th scope="col" className="px-3 py-2 font-medium">IA 30 d (tokens)</th>
                <th scope="col" className="px-3 py-2 font-medium">Plano</th>
                <th scope="col" className="px-3 py-2 font-medium">Integrações</th>
                <th scope="col" className="px-3 py-2 font-medium">Última atividade</th>
                <th scope="col" className="px-3 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((o) => (
                <tr key={o.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{o.name}</p>
                    <p className="text-xs text-muted">{o.slug} · criado em {formatDate(o.createdAt)}</p>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{o.members} ({o.mfaMembers})</td>
                  <td className="px-3 py-2.5 tabular-nums">{o.cases}</td>
                  <td className="px-3 py-2.5 tabular-nums">{o.openNotices}</td>
                  <td className="px-3 py-2.5 tabular-nums">{o.ai30Tokens.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {o.plan ? (
                      <>
                        <p className="font-medium">{o.plan.name}</p>
                        <p className="text-muted">{STATUS[o.plan.status] ?? o.plan.status}{o.plan.status === "TRIALING" && o.plan.trialEndsAt ? ` até ${formatDate(o.plan.trialEndsAt)}` : ""}{o.plan.status === "ACTIVE" && o.plan.currentPeriodEnd ? ` até ${formatDate(o.plan.currentPeriodEnd)}` : ""}</p>
                        <p className="text-muted">{(o.storageBytes / 1048576).toFixed(1).replace(".", ",")} MB</p>
                      </>
                    ) : <span className="text-muted">Sem assinatura</span>}
                    <SubscriptionControl orgId={o.id} plans={plans} current={o.plan ? { planKey: o.plan.key, status: o.plan.status } : null} />
                    <CreditsControl orgId={o.id} enabled={credits.get(o.id)?.enabled ?? false} balance={credits.get(o.id)?.balance ?? 0} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">
                    {[o.aiEnabled ? "IA" : null, o.datajudEnabled ? "DataJud" : null, o.djenMonitors ? `DJEN ${o.djenMonitors}` : null, o.courtConnections ? `PJe ${o.courtConnections}` : null].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{o.lastActivity ? formatDateTime(o.lastActivity) : "—"}</td>
                  <td className="px-3 py-2.5">
                    {o.suspendedAt ? (
                      <div className="space-y-1">
                        <Badge tone="danger">Suspenso</Badge>
                        <p className="max-w-48 text-xs text-muted">{o.suspendedReason}</p>
                      </div>
                    ) : (
                      <Badge tone="success">Ativo</Badge>
                    )}
                    <div className="mt-2"><OrgSuspendControl orgId={o.id} suspended={Boolean(o.suspendedAt)} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
