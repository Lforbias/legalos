"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

type Group = { name: string; condition: string | null; features: { id: string; label: string }[] };
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function FeatureCatalogue({ groups }: { groups: Group[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const filtered = useMemo(() => groups.filter(g => category === "all" || g.name === category).map(g => ({ ...g, features: g.features.filter(f => normalize(`${g.name} ${f.label}`).includes(normalize(query.trim()))) })).filter(g => g.features.length), [groups, query, category]);
  const count = filtered.reduce((sum, g) => sum + g.features.length, 0);
  return <div className="mt-10" data-testid="pricing-catalogue">
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 md:flex-row">
      <label className="relative flex-1"><span className="sr-only">Buscar recurso</span><Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-muted" aria-hidden /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="O que seu escritório precisa?" className="h-11 w-full rounded-xl border border-border bg-bg pl-11 pr-4 text-sm" /></label>
      <label><span className="sr-only">Filtrar área de recursos</span><select value={category} onChange={e => setCategory(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm md:w-72"><option value="all">Todas as áreas</option>{groups.map(g => <option key={g.name}>{g.name}</option>)}</select></label>
    </div>
    <p role="status" className="my-5 text-sm text-muted">{count} de {groups.reduce((sum, g) => sum + g.features.length, 0)} recursos e operações</p>
    {filtered.length ? <div className="grid items-start gap-3 lg:grid-cols-2">{filtered.map(g => <details key={`${g.name}-${query ? "search" : "browse"}-${category}`} open={Boolean(query.trim()) || category !== "all"} className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-sm font-medium [&::-webkit-details-marker]:hidden"><span>{g.name} <span className="ml-2 text-xs font-normal text-muted">{g.features.length}</span></span><ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" aria-hidden /></summary>
      <div className="border-t border-border px-5 pb-5 pt-4">{g.condition && <p className="mb-4 text-xs leading-relaxed text-muted">{g.condition}</p>}<ul className="space-y-3">{g.features.map(f => <li key={f.id} className="flex items-start gap-3 text-sm"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden /><span>{f.label}</span></li>)}</ul></div>
    </details>)}</div> : <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">Nenhum recurso encontrado. Tente outra busca ou área.</p>}
  </div>;
}
