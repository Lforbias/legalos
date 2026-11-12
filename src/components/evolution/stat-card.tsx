import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: color ? `${color}18` : undefined }}>
          <Icon className="h-4 w-4" style={color ? { color } : undefined} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] text-muted">{label}</p>
          <p className="text-xl font-semibold tracking-tight">{value}</p>
          {detail && <p className="text-[11px] text-muted">{detail}</p>}
        </div>
      </div>
    </div>
  );
}
