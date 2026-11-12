import { TasksWorkspace, type TaskSearchParams } from "@/modules/tasks/tasks-workspace";
import Link from "next/link";
import { Inbox, Bell } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { DataError } from "@/components/evolution/data-error";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { alertCounts, availableAlertTabs } from "@/server/services/insights.service";
import { BOX_AVAILABLE } from "@/lib/box-retirement";

export default async function ControladoriaPage({ searchParams }: { searchParams: Promise<TaskSearchParams> }) {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.controladoria;
  const attentionTabs = availableAlertTabs(ctx).filter((tab) => tab.key !== "aniversarios" && (BOX_AVAILABLE || tab.key !== "publicacoes"));
  const [alerts, alertsErr] = await alertCounts(ctx).then((r) => [r, false] as const).catch(() => [null, true] as const);
  const totalAlerts = alerts
    ? attentionTabs.reduce((total, tab) => total + (alerts[tab.key] ?? 0), 0)
    : null;

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />

      {alertsErr && <DataError message="Não foi possível carregar os indicadores da Controladoria" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Bell} label="Pendências operacionais" value={alertsErr ? "—" : totalAlerts ?? 0} detail="nos módulos disponíveis para seu perfil" color={dept.color} />
      </div>

      <h2 className="mt-8 mb-3 text-base font-semibold">Atenção por área</h2>
      <p className="mb-4 text-sm text-muted">Cada contador usa dados do escritório e abre a lista correspondente para tratamento.</p>
      {attentionTabs.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {attentionTabs.map((tab) => (
            <Link key={tab.key} href={`/alertas?aba=${tab.key}`} className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 transition hover:border-primary/40 hover:bg-surface-2">
              <span className="text-sm font-medium group-hover:text-primary">{tab.label}</span>
              <span className="text-xl font-semibold tabular-nums">{alertsErr ? "—" : alerts?.[tab.key] ?? 0}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">Seu perfil não tem módulos com pendências de controladoria disponíveis.</p>
      )}

      {can(ctx, "tasks:read") && <section className="mt-8" aria-label="Mesa de controle operacional"><TasksWorkspace searchParams={searchParams} basePath="/evolution/controladoria" embedded /></section>}

      <h2 className="mt-8 mb-4 text-base font-semibold">Estações de trabalho</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {attentionTabs.length > 0 && (
          <Link href="/alertas" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:bg-surface-2">
            <Bell className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Central de alertas</p>
              <p className="text-[12px] text-muted">Pendências com link direto para tratar cada item</p>
            </div>
          </Link>
        )}

        {can(ctx, "inbox:read") && BOX_AVAILABLE ? (
          <Link href="/caixa-de-entrada" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Inbox className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Caixa de entrada</p>
              <p className="text-[12px] text-muted">Intimações, distribuição e triagem</p>
            </div>
          </Link>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-4 opacity-60">
            <div className="flex items-center gap-3">
              <Inbox className="h-5 w-5 text-muted" aria-hidden />
              <div>
                <p className="text-sm font-medium">Caixa de entrada</p>
                <p className="text-[12px] text-muted">O Box está temporariamente desativado para reconstrução</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
