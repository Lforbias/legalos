import type { LucideIcon } from "lucide-react";
import * as React from "react";

export function DepartmentHeader({
  icon: Icon,
  color,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-5">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
          <Icon className="h-5 w-5" style={{ color }} aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-[28px]">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
