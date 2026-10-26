import { ChevronDown, SlidersHorizontal } from "lucide-react";

export function FilterPanel({ label, activeCount = 0, children }: {
  label: string;
  activeCount?: number;
  children: React.ReactNode;
}) {
  return (
    <details open={activeCount > 0} className="group rounded-xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="h-4 w-4 text-muted" aria-hidden />
        {label}
        {activeCount > 0 ? <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted">{activeCount} ativo(s)</span> : null}
        <ChevronDown className="ml-auto h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}
