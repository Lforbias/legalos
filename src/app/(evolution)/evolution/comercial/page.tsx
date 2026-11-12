import Link from "next/link";
import { ArrowUpRight, Briefcase, Globe, TrendingUp } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { EmptyState } from "@/components/evolution/empty-state";
import { DataError } from "@/components/evolution/data-error";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { listLeads } from "@/server/services/crm.service";
import { LEAD_STAGE_LABEL, type LeadStageKey } from "@/modules/crm/schemas";
import { formatMoneyBR } from "@/lib/validation/money";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";

export default async function ComercialPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.comercial;
  const hasCrm = can(ctx, "crm:read");
  const hasPortalTeam = can(ctx, "clients:read");
  const canWriteCrm = can(ctx, "crm:write");
  const [leads, leadsErr] = hasCrm
    ? await listLeads(ctx).then((result) => [result, false] as const).catch(() => [null, true] as const)
    : [null, false] as const;
  const leadCounts = new Map((leads?.summary ?? []).map((stage) => [stage.stage, stage._count._all]));
  const openCount = (["NEW", "CONTACTED", "MEETING", "PROPOSAL"] as LeadStageKey[]).reduce((sum, stage) => sum + (leadCounts.get(stage) ?? 0), 0);

  if (!hasCrm && !hasPortalTeam) {
    return (
      <>
        <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />
        <EmptyState icon={TrendingUp} title="Sem acesso ao Comercial" description="Seu perfil não tem permissão para o CRM ou portal. Solicite acesso ao administrador." />
      </>
    );
  }

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />

      {leadsErr && <DataError message="Não foi possível carregar os indicadores do CRM" />}
      {hasCrm && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Briefcase} label="Leads em andamento" value={leadsErr ? "—" : openCount} color={dept.color} />
            <StatCard icon={TrendingUp} label="Propostas" value={leadsErr ? "—" : leadCounts.get("PROPOSAL") ?? 0} detail="leads na etapa de proposta" color="#f59e0b" />
            <StatCard icon={Briefcase} label="Convertidos" value={leadsErr ? "—" : leadCounts.get("WON") ?? 0} detail="clientes ganhos" color="#10b981" />
            <StatCard icon={Briefcase} label="Total de leads" value={leadsErr ? "—" : leads?.total ?? 0} color="#6366f1" />
          </div>

          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Leads atualizados recentemente</h2>
                <p className="mt-1 text-sm text-muted">Acompanhe a etapa e a próxima ação registrada.</p>
              </div>
              <div className="flex items-center gap-2">
                {canWriteCrm && <Link href="/crm/novo" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg transition hover:bg-primary-hover">Novo lead</Link>}
                <Link href="/crm" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm transition hover:bg-surface-2">Abrir funil <ArrowUpRight className="h-4 w-4" aria-hidden /></Link>
              </div>
            </div>
            {leadsErr ? null : leads?.items.length ? (
              <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                {leads.items.slice(0, 6).map((lead) => (
                  <Link key={lead.id} href={`/crm/${lead.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium hover:text-primary">{lead.name}</p>
                      <p className="mt-1 truncate text-xs text-muted">{lead.interest ?? "Interesse ainda não informado"}{lead.ownerName ? ` · ${lead.ownerName}` : ""}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      <span>{LEAD_STAGE_LABEL[lead.stage as LeadStageKey]}</span>
                      <span>{lead.estimatedValue ? formatMoneyBR(lead.estimatedValue.toString()) : "Sem valor"}</span>
                      {lead.nextActionDate && <span>Próxima ação: {formatYmd(dateToYmd(lead.nextActionDate))}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            ) : <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">Nenhum lead cadastrado ainda.</p>}
          </section>
        </>
      )}

      <h2 className="mb-4 text-base font-semibold">Estações de trabalho</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hasCrm && (
          <Link href="/crm" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Briefcase className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">CRM / Leads</p>
              <p className="text-[12px] text-muted">Funil de leads, propostas e conversão em cliente</p>
            </div>
          </Link>
        )}
        {hasPortalTeam && (
          <Link href="/portal-equipe" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Globe className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Mensagens do portal</p>
              <p className="text-[12px] text-muted">Solicitações e mensagens dos clientes pelo portal</p>
            </div>
          </Link>
        )}
      </div>

      <div className="mt-8 rounded-xl border border-border/60 bg-surface-2/50 p-5">
        <p className="text-sm text-muted">
          <strong className="text-fg">Nota:</strong> Este é o Comercial do escritório — captação de clientes e funil de vendas.
          Ele é diferente do módulo <code className="rounded bg-surface-3 px-1 text-[12px]">/comercial</code> interno do LegalOS (planos e assinatura), que continua em Administração.
        </p>
      </div>
    </>
  );
}
