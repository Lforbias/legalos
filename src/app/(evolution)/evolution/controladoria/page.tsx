import Link from "next/link";
import { Inbox, Bell } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { alertCounts } from "@/server/services/insights.service";
import { countNewNotices } from "@/server/services/box.service";
import { BOX_AVAILABLE } from "@/lib/box-retirement";

export default async function ControladoriaPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.controladoria;
  const alerts = await alertCounts(ctx).catch(() => ({} as Record<string, number>));
  const totalAlerts = Object.values(alerts).reduce((a, b) => a + b, 0);
  const noticeCount = can(ctx, "inbox:read") && BOX_AVAILABLE ? await countNewNotices(ctx).catch(() => 0) : 0;

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Bell} label="Alertas pendentes" value={totalAlerts} color={dept.color} />
        {BOX_AVAILABLE && <StatCard icon={Inbox} label="Intimações novas" value={noticeCount} color="#f59e0b" />}
      </div>

      <h2 className="mt-8 mb-4 text-base font-semibold">Estações de trabalho</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/alertas" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
          <Bell className="h-5 w-5 text-muted" aria-hidden />
          <div>
            <p className="text-sm font-medium group-hover:text-primary">Central de alertas</p>
            <p className="text-[12px] text-muted">Publicações, andamentos, processos parados e prazos</p>
          </div>
        </Link>

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
