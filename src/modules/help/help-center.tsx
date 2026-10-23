"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, BookOpen, Search } from "lucide-react";
import type { HelpGuide } from "./guides";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function HelpCenter({ guides }: { guides: HelpGuide[] }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("Todos");
  const areas = ["Todos", ...new Set(guides.map(g => g.area))];
  const filtered = guides.filter(g => (area === "Todos" || g.area === area) && normalize([g.title, g.description, g.area, ...g.steps, g.note ?? ""].join(" ")).includes(normalize(query.trim())));
  return <div className="mx-auto max-w-5xl space-y-6 pb-16">
    <header className="space-y-2"><p className="flex items-center gap-2 text-sm text-primary-text"><BookOpen className="h-4 w-4" aria-hidden />Central de ajuda</p><h1 className="text-2xl font-semibold">Como podemos ajudar?</h1><p className="max-w-2xl text-sm text-muted">Conheça os caminhos do LegalOS e consulte o passo a passo para usar cada área. Se está começando, abra o guia Preparar o escritório.</p></header>
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <label className="relative block"><span className="sr-only">Buscar na ajuda</span><Search className="absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Busque por tarefa, certificado, WhatsApp…" className="h-10 w-full rounded-lg border border-border bg-surface-2 pl-10 pr-3 text-sm focus:outline-primary" /></label>
      <div role="group" aria-label="Filtrar ajuda por área" className="flex flex-wrap gap-2">{areas.map(a => <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)} className={`rounded-full border px-3 py-1.5 text-sm ${area === a ? "border-primary bg-primary/15 text-primary-text" : "border-border text-muted hover:bg-surface-2"}`}>{a}</button>)}</div>
    </div>
    <p role="status" className="text-sm text-muted">{filtered.length} {filtered.length === 1 ? "guia encontrado" : "guias encontrados"}</p>
    {filtered.length ? <div className="space-y-3">{filtered.map(g => <details key={g.id} className="group rounded-xl border border-border bg-surface" open={query.trim() ? true : undefined}>
      <summary className="cursor-pointer rounded-xl p-4 focus-visible:outline-primary"><span className="ml-1 text-xs text-primary-text">{g.area}</span><h2 className="mt-1 inline text-base font-semibold"> · {g.title}</h2><p className="mt-1 text-sm text-muted">{g.description}</p></summary>
      <div className="space-y-4 border-t border-border p-4"><ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">{g.steps.map(step => <li key={step}>{step}</li>)}</ol>{g.note ? <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted">{g.note}</p> : null}{g.links.length ? <div className="flex flex-wrap gap-2">{g.links.map(link => <Link key={link.href} href={link.href} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-primary-text hover:bg-surface-2">{link.label}<ArrowUpRight aria-hidden className="h-4 w-4" /></Link>)}</div> : null}</div>
    </details>)}</div> : <div className="rounded-xl border border-border p-6"><p className="font-medium">Nenhum guia encontrado</p><p className="mt-1 text-sm text-muted">Tente outra palavra ou consulte todas as áreas.</p><button type="button" onClick={() => { setQuery(""); setArea("Todos"); }} className="mt-3 text-sm text-primary-text underline">Limpar busca e filtros</button></div>}
  </div>;
}
