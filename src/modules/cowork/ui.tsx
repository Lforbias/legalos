"use client";

import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { avatarColor, initials } from "./constants";

/** Avatar de iniciais: o LegalOS não guarda foto de perfil, então não inventamos uma. */
export function PersonAvatar({ id, name, size = 32, className }: { id: string | null; name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)), background: id ? avatarColor(id) : "var(--muted)" }}
    >
      {initials(name)}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fechar" className="absolute inset-0 cursor-default bg-black/55" onClick={onClose} />
      <div ref={ref} className={cn("lo-pop relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 shadow-xl sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label="Fechar" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function newNonce(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Hoje";
  if (same(d, y)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1).replace(".", ",")} MB`;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error(data.error ?? `Falha (${res.status}).`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}
