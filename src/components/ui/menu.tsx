"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Menu suspenso acessível mínimo: abre por clique, fecha com Esc/clique fora, foco retorna ao gatilho. */
export function Menu({
  trigger,
  label,
  children,
  align = "right",
  panelClassName,
}: {
  trigger: React.ReactNode;
  label: string;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const btn = React.useRef<HTMLButtonElement>(null);
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "lo-pop absolute z-50 mt-2 min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-2xl shadow-black/20",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  disabled,
  hint,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={hint}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent",
        className,
      )}
    >
      {children}
    </button>
  );
}
