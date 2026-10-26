"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Search, Building2, ListChecks, Plug, ShieldCheck, CreditCard } from "lucide-react";
import { SETTINGS_GROUPS, type SettingsItem } from "@/config/settings";
const icons = [Building2, ListChecks, Plug, ShieldCheck, CreditCard];
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function SettingsDirectory({ items }: { items: SettingsItem[] }) {
  const [q, setQ] = React.useState("");
  const filtered = items.filter(i => normalize(`${i.label} ${i.description} ${SETTINGS_GROUPS.find(g => g.key === i.group)?.title}`).includes(normalize(q.trim())));
  return <div className="space-y-7">
    <div className="relative max-w-xl"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden /><input aria-label="Buscar configurações" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="O que você quer configurar?" className="h-10 w-full rounded-xl border border-border bg-surface py-2 pl-10 pr-3 text-sm outline-none focus:border-primary" /></div>
    <div className="grid gap-5 lg:grid-cols-2">{SETTINGS_GROUPS.map((group, index) => {
      const links = filtered.filter(i => i.group === group.key); if (!links.length) return null;
      const Icon = icons[index] ?? Building2;
      return <section key={group.key} aria-labelledby={`settings-${group.key}`} className="rounded-xl border border-border bg-surface"><div className="flex items-start gap-3 px-5 pb-3 pt-5"><span className="rounded-lg bg-surface-2 p-2 text-muted"><Icon className="h-4 w-4" aria-hidden /></span><div><h2 id={`settings-${group.key}`} className="text-sm font-semibold">{group.title}</h2><p className="mt-1 text-xs text-muted">{group.description}</p></div></div><div className="px-2 pb-2">{links.map(item => <Link key={item.href} href={item.href} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"><div className="min-w-0 flex-1"><span className="text-sm font-medium">{item.label}</span><p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p></div><ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden /></Link>)}</div></section>;
    })}</div>
    {!filtered.length ? <p role="status" className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Nenhuma configuração encontrada para “{q}”.</p> : null}
  </div>;
}
