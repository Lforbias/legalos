import Link from "next/link";
import { Activity, CircleDollarSign, Files, GitBranch, LayoutDashboard, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

type CaseTab = { key: string; label: string; count?: number };

const GROUPS = [
  { label: "Visão geral", icon: LayoutDashboard, keys: ["resumo", "partes", "equipe"] },
  { label: "Atividade", icon: Activity, keys: ["andamentos", "notas", "historico"] },
  { label: "Prazos e tarefas", icon: ListChecks, keys: ["prazos", "tarefas", "intimacoes"] },
  { label: "Documentos", icon: Files, keys: ["documentos", "peticoes"] },
  { label: "Financeiro", icon: CircleDollarSign, keys: ["honorarios", "valores"] },
  { label: "Vínculos", icon: GitBranch, keys: ["portal", "recursos"] },
] as const;

export function CaseSectionsNav({ base, current, tabs }: { base: string; current: string; tabs: CaseTab[] }) {
  const available = new Map(tabs.map((tab) => [tab.key, tab]));
  const groups = GROUPS.map((group) => ({ ...group, tabs: group.keys.flatMap((key) => available.has(key) ? [available.get(key)!] : []) }))
    .filter((group) => group.tabs.length > 0);
  const activeGroup = groups.find((group) => group.tabs.some((tab) => tab.key === current)) ?? groups[0];
  if (!activeGroup) return null;

  return (
    <nav aria-label="Seções do processo" className="mb-6 rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-label="Categorias do processo">
        {groups.map((group) => {
          const active = group === activeGroup;
          const Icon = group.icon;
          const defaultTab = group.tabs[0]!;
          return (
            <Link
              key={group.label}
              href={`${base}?aba=${defaultTab.key}`}
              aria-current={current === defaultTab.key ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-w-36",
                active ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-surface-2 text-muted hover:border-primary/30 hover:text-fg",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span>{group.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3" aria-label={`Seções: ${activeGroup.label}`}>
        {activeGroup.tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <Link
              key={tab.key}
              href={`${base}?aba=${tab.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                active ? "bg-primary text-white" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {tab.label}
              {tab.count != null ? <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20 text-white" : "bg-surface-2 text-muted")}>{tab.count}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
