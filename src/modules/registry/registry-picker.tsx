"use client";

import { X } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/form";
import { searchRegistryAction } from "@/modules/cases/extras-actions";
import { formatDocument } from "@/lib/validation/br-documents";
import { REGISTRY_KIND_LABEL, type REGISTRY_KINDS } from "./schemas";

type Item = { id: string; name: string; document: string | null; kind: string; profession: string | null };

/** Seletor com busca do cadastro único de partes. */
export function RegistryPicker({ id, value, label, onChange }: { id: string; value: string; label: string; onChange: (id: string, label: string) => void }) {
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<Item[]>([]);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open || q.trim().length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      const res = await searchRegistryAction(q);
      if (alive && res.ok) setItems(res.data ?? []);
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open]);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between rounded-md border border-border bg-surface-2 px-3 text-sm">
        <span className="truncate">{label}</span>
        <button type="button" aria-label="Remover parte selecionada" onClick={() => onChange("", "")} className="ml-2 cursor-pointer text-muted hover:text-fg">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div ref={ref} className="relative">
      <Input id={id} value={q} autoComplete="off" placeholder="Buscar no cadastro de partes…" onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && q.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-xl shadow-black/30">
          {items.length === 0 ? <p className="px-2.5 py-2 text-sm text-muted">Nenhuma parte encontrada.</p> : null}
          {items.map((p) => (
            <button key={p.id} type="button" onClick={() => { onChange(p.id, p.name); setOpen(false); setQ(""); }} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2">
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {p.document && (p.document.length === 11 || p.document.length === 14) ? formatDocument(p.document.length === 11 ? "PERSON" : "COMPANY", p.document) : REGISTRY_KIND_LABEL[p.kind as (typeof REGISTRY_KINDS)[number]]}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
