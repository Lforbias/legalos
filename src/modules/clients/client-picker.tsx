"use client";

import { X } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/form";
import { formatDocument } from "@/lib/validation/br-documents";

type Item = { id: string; name: string; type: "PERSON" | "COMPANY"; document: string | null };

/** Seletor com busca de clientes do escritório (autocompletar via /api/clients/search). */
export function ClientPicker({
  id,
  value,
  label,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  label: string;
  onChange: (id: string, label: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<Item[]>([]);
  const [open, setOpen] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const search = React.useCallback(async (term: string, signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(term)}`, { signal });
      if (!res.ok) throw new Error(String(res.status));
      setItems(((await res.json()) as { items: Item[] }).items);
      setFailed(false);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFailed(true);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => void search(q, ctrl.signal), 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open, search]);

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
        {!disabled ? (
          <button type="button" aria-label="Remover cliente selecionado" onClick={() => onChange("", "")} className="ml-2 cursor-pointer text-muted hover:text-fg">
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div ref={ref} className="relative">
      <Input
        id={id}
        value={q}
        disabled={disabled}
        aria-invalid={invalid}
        autoComplete="off"
        placeholder="Buscar cliente pelo nome…"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-xl shadow-black/30">
          {failed ? <p className="px-2.5 py-2 text-sm text-muted">Não foi possível buscar agora.</p> : null}
          {!failed && items.length === 0 ? <p className="px-2.5 py-2 text-sm text-muted">Nenhum cliente encontrado.</p> : null}
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c.id, c.name);
                setOpen(false);
                setQ("");
              }}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
            >
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 text-xs text-muted">{c.document ? formatDocument(c.type, c.document) : c.type === "PERSON" ? "PF" : "PJ"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
