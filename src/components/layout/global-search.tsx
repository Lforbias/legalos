"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import * as React from "react";
import { NAV_ITEMS } from "@/config/navigation";

type MemberHit = { id: string; name: string; email: string; role: string };
type ClientHit = { id: string; name: string; document: string | null; type: "PERSON" | "COMPANY" };
type CaseHit = { id: string; title: string; number: string | null };

/** Busca global: páginas do sistema (permitidas), membros, clientes e processos. Amplia-se a cada módulo. */
export function GlobalSearch({ visibleKeys, idSuffix = "" }: { visibleKeys: string[]; idSuffix?: string }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [members, setMembers] = React.useState<MemberHit[]>([]);
  const [clients, setClients] = React.useState<ClientHit[]>([]);
  const [cases, setCases] = React.useState<CaseHit[]>([]);
  const [error, setError] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const pages = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 1) return [];
    return NAV_ITEMS.filter((n) => visibleKeys.includes(n.key) && n.label.toLowerCase().includes(term)).slice(0, 5);
  }, [q, visibleKeys]);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { members: MemberHit[]; clients: ClientHit[]; cases: CaseHit[] };
        setMembers(json.members);
        setClients(json.clients);
        setCases(json.cases);
        setError(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  const enough = q.trim().length >= 2;
  const shownMembers = enough ? members : [];
  const shownClients = enough ? clients : [];
  const shownCases = enough ? cases : [];
  const showPanel = open && q.trim().length > 0;
  return (
    <div ref={ref} className="relative w-full max-w-lg">
      <label htmlFor={`global-search${idSuffix}`} className="sr-only">
        Busca global
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        ref={inputRef}
        id={`global-search${idSuffix}`}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar clientes, processos, páginas…  (Ctrl/⌘ K)"
        autoComplete="off"
        className="h-10 w-full rounded-lg border border-border/80 bg-bg/50 pl-10 pr-3 text-sm transition-colors placeholder:text-muted/70 focus:border-primary focus:bg-surface"
      />
      {showPanel ? (
        <div className="lo-pop absolute left-0 right-0 z-50 mt-2 max-h-96 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl shadow-black/30">
          {pages.length ? (
            <div>
              <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">Páginas</p>
              {pages.map((p) => (
                <Link key={p.key} href={p.href} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-2">
                  <p.icon className="h-4 w-4 text-muted" aria-hidden /> {p.label}
                </Link>
              ))}
            </div>
          ) : null}
          {shownClients.length ? (
            <div>
              <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">Clientes</p>
              {shownClients.map((c) => (
                <Link key={c.id} href={`/clientes/${c.id}`} onClick={() => setOpen(false)} className="block rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-2">
                  {c.name} <span className="text-xs text-muted">· {c.type === "PERSON" ? "Pessoa física" : "Pessoa jurídica"}</span>
                </Link>
              ))}
            </div>
          ) : null}
          {shownCases.length ? (
            <div>
              <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">Processos</p>
              {shownCases.map((c) => (
                <Link key={c.id} href={`/processos/${c.id}`} onClick={() => setOpen(false)} className="block rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-2">
                  {c.title} {c.number ? <span className="text-xs text-muted">· {c.number}</span> : null}
                </Link>
              ))}
            </div>
          ) : null}
          {shownMembers.length ? (
            <div>
              <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">Equipe</p>
              {shownMembers.map((m) => (
                <Link
                  key={m.id}
                  href={`/configuracoes/equipe?q=${encodeURIComponent(m.email)}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-2"
                >
                  {m.name} <span className="text-xs text-muted">· {m.email} · {m.role}</span>
                </Link>
              ))}
            </div>
          ) : null}
          {!pages.length && !shownMembers.length && !shownClients.length && !shownCases.length ? (
            <p className="px-2.5 py-3 text-sm text-muted">{error ? "Não foi possível buscar agora." : "Nada encontrado. Documentos, tarefas e demais módulos serão pesquisáveis conforme forem liberados."}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
