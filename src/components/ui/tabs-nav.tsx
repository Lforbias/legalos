import Link from "next/link";
import { cn } from "@/lib/utils";

/** Abas por URL (?aba=...). Renderizado no servidor: cada aba carrega apenas os dados de que precisa. */
export function TabsNav({ base, current, tabs }: { base: string; current: string; tabs: { key: string; label: string; count?: number }[] }) {
  return (
    <nav aria-label="Seções" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={`${base}?aba=${t.key}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
              active ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count != null ? <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
