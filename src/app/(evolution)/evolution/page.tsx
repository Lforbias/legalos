import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DEPARTMENTS, departmentItems, type Department } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";

const DEPT_ORDER: Department[] = ["juridico", "controladoria", "atendimento", "comercial", "financeiro", "administracao"];

export default async function EvolutionLobby() {
  const { ctx } = await requireTenant();
  return (
    <>
      <DepartmentHeader
        icon={DEPARTMENTS.lobby.icon}
        color="hsl(var(--primary))"
        title="Meu Escritório"
        description="Bem-vindo ao LegalOS Evolution. Escolha um departamento para começar."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEPT_ORDER.map((dept) => {
          const info = DEPARTMENTS[dept];
          const items = departmentItems(dept);
          const visibleItems = items.filter((n) => !n.permission || can(ctx, n.permission));
          const Icon = info.icon;
          return (
            <Link
              key={dept}
              href={`/evolution/${dept}`}
              className="group relative overflow-hidden rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${info.color}18` }}>
                  <Icon className="h-5 w-5" style={{ color: info.color }} aria-hidden />
                </span>
                <h2 className="text-base font-semibold">{info.name}</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">{info.summary}</p>
              {visibleItems.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {visibleItems.slice(0, 4).map((item) => (
                    <span key={item.key} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{item.label}</span>
                  ))}
                </div>
              )}
              <ArrowRight className="absolute right-4 top-5 h-4 w-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-border/60 bg-surface-2/50 p-5">
        <h3 className="text-sm font-semibold">Sobre a Evolution 1.0</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Esta é a nova experiência departamental do LegalOS. As funcionalidades existentes continuam disponíveis — os departamentos reorganizam o acesso em torno da rotina do escritório. Você pode voltar ao Ethos a qualquer momento pelo menu lateral.
        </p>
      </div>
    </>
  );
}
