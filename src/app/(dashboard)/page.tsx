import type { Metadata } from "next";
import Link from "next/link";
import { ActivityChart, RoleChart } from "@/components/dashboard/charts";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NAV_ITEMS } from "@/config/navigation";
import { relativeTime } from "@/lib/dates/format";
import { getDashboard } from "@/server/services/dashboard.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Visão geral" };

const ACTION_LABELS: Record<string, string> = {
  "organization.create": "Escritório criado",
  "organization.update": "Dados do escritório atualizados",
  "member.role_change": "Perfil de membro alterado",
  "member.suspend": "Membro suspenso",
  "member.reactivate": "Membro reativado",
  "member.remove": "Membro removido",
  "invitation.create": "Convite criado",
  "invitation.revoke": "Convite revogado",
  "invitation.accept": "Convite aceito",
  "role.create": "Perfil de acesso criado",
  "role.update": "Perfil de acesso alterado",
  "role.delete": "Perfil de acesso excluído",
  "client.create": "Cliente cadastrado",
  "client.update": "Cliente atualizado",
  "client.delete": "Cliente excluído",
  "client.contact_add": "Contato de cliente adicionado",
  "client.contact_update": "Contato de cliente atualizado",
  "client.contact_delete": "Contato de cliente excluído",
  "case.create": "Processo cadastrado",
  "case.update": "Processo atualizado",
  "case.status_change": "Situação de processo alterada",
  "case.delete": "Processo excluído",
  "case.party_add": "Parte adicionada a processo",
  "case.party_remove": "Parte removida de processo",
  "case.member_add": "Equipe de processo alterada",
  "case.member_remove": "Membro removido de processo",
  "case.note_add": "Anotação em processo",
  "task.create": "Tarefa criada",
  "task.update": "Tarefa atualizada",
  "task.status": "Situação de tarefa alterada",
  "task.delete": "Tarefa excluída",
  "deadline.create": "Prazo cadastrado",
  "deadline.update": "Prazo atualizado",
  "deadline.validate": "Prazo validado",
  "deadline.fulfill": "Prazo cumprido",
  "deadline.cancel": "Prazo cancelado",
  "agenda.create": "Compromisso agendado",
  "agenda.update": "Compromisso atualizado",
  "agenda.delete": "Compromisso excluído",
  "notice.create": "Intimação registrada",
  "notice.assign": "Intimação distribuída",
  "notice.link_case": "Intimação vinculada a processo",
  "notice.process": "Intimação tratada",
  "notice.discard": "Intimação descartada",
  "notice.reopen": "Intimação reaberta",
  "notice.delete": "Intimação excluída",
  "time.create": "Horas registradas",
  "time.delete": "Lançamento de horas excluído",
  "document.upload": "Documento enviado",
  "document.download": "Documento baixado",
  "document.delete": "Documento excluído",
};

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </CardBody>
    </Card>
  );
}

export default async function OverviewPage() {
  const { ctx, session, organization } = await requireTenant();
  const d = await getDashboard(ctx);
  const trialDays = d.plan?.trialDaysLeft ?? null;
  const upcoming = NAV_ITEMS.filter((n) => !n.implemented);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Olá, ${session.user.name.split(" ")[0]}`} description={`Visão geral de ${organization.name}. Os indicadores abaixo são calculados a partir dos dados persistidos.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Membros ativos" value={d.members.active} hint={d.members.suspended ? `${d.members.suspended} suspenso(s)` : undefined} />
        <Kpi label="Convites pendentes" value={d.pendingInvitations} />
        <Kpi
          label="Usuários do plano"
          value={d.plan ? `${d.plan.usedUsers}${d.plan.maxUsers != null ? ` / ${d.plan.maxUsers}` : ""}` : "—"}
          hint={d.plan?.maxUsers == null ? "Sem limite" : undefined}
        />
        <Kpi
          label="Plano"
          value={d.plan?.name ?? "—"}
          hint={d.plan?.status === "TRIALING" && trialDays != null ? `Teste gratuito: ${trialDays} dia(s) restantes` : d.plan?.status}
        />
      </div>

      {d.legal.activeClients !== null || d.legal.activeCases !== null ? (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {d.legal.activeClients !== null ? <Kpi label="Clientes ativos" value={d.legal.activeClients} /> : null}
          {d.legal.activeCases !== null ? <Kpi label="Processos em andamento" value={d.legal.activeCases} hint={d.legal.suspendedCases ? `${d.legal.suspendedCases} suspenso(s)` : undefined} /> : null}
        </div>
      ) : null}

      {d.work.deadlines || d.work.myTasks || d.work.notices ? (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {d.work.deadlines ? (
            <>
              <Link href="/prazos"><Kpi label="Prazos em aberto" value={d.work.deadlines.open} hint={`${d.work.deadlines.next7} nos próximos 7 dias`} /></Link>
              <Link href="/prazos?atrasados=1"><Kpi label="Prazos vencidos" value={d.work.deadlines.overdue} hint={d.work.deadlines.draft ? `${d.work.deadlines.draft} aguardando validação` : undefined} /></Link>
            </>
          ) : null}
          {d.work.notices ? (
            <Link href="/box" data-testid="func-to-box">
              <Kpi label="LegalOS Box" value={d.work.notices.new} hint={`intimação(ões) nova(s) · ${d.work.notices.mine} para mim — abrir o Box`} />
            </Link>
          ) : null}
          {d.work.myTasks ? (
            <>
              <Link href="/tarefas?responsavel=eu"><Kpi label="Minhas tarefas abertas" value={d.work.myTasks.open} /></Link>
              <Link href="/tarefas?responsavel=eu&atrasadas=1"><Kpi label="Minhas tarefas atrasadas" value={d.work.myTasks.overdue} /></Link>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Atividade do escritório (14 dias)" description="Eventos registrados na trilha de auditoria." />
          <CardBody>
            {d.activityByDay.length ? (
              <ActivityChart data={d.activityByDay.map((a) => ({ label: a.day.slice(8, 10) + "/" + a.day.slice(5, 7), value: a.count }))} />
            ) : (
              <p className="py-10 text-center text-sm text-muted">Seu perfil não inclui acesso à trilha de auditoria.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Membros por perfil" />
          <CardBody>
            {d.roleDistribution.length ? (
              <RoleChart data={d.roleDistribution.map((r) => ({ label: r.name, value: r.count }))} />
            ) : (
              <p className="py-8 text-center text-sm text-muted">Sem membros.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Atividades recentes" />
          {d.recentActivity === null ? (
            <CardBody>
              <p className="text-sm text-muted">Seu perfil não inclui acesso à trilha de auditoria.</p>
            </CardBody>
          ) : d.recentActivity.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">Nenhuma atividade registrada ainda.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {d.recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{ACTION_LABELS[a.action] ?? a.action}</span>
                    <span className="block text-xs text-muted">{a.actorName ?? "Sistema"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{relativeTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Módulos em implantação"
            description="Estes indicadores aparecerão aqui quando cada módulo for entregue — sem números fictícios no lugar."
          />
          <ul className="divide-y divide-border">
            {upcoming
              .filter((n) => n.key !== "settings")
              .slice(0, 7)
              .map((n) => (
                <li key={n.key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span>{n.label}</span>
                  <Badge tone="neutral">Fase {n.phase}</Badge>
                </li>
              ))}
          </ul>
          <div className="border-t border-border px-4 py-2.5 text-xs">
            <Link href="/modulos/ajuda" className="text-primary-text hover:underline">
              Ver roadmap completo
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
