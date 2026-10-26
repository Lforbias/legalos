import type { Metadata } from "next";
import Link from "next/link";
import { Folder, ArrowUpRight, Search, ArrowRight } from "lucide-react";
import { requireTenant } from "@/server/session";
import { formatDocument } from "@/lib/validation/br-documents";
import { listWorkspaceFolders } from "@/server/services/workspace.service";
export const metadata: Metadata = { title: "LegalOS Desktop" };
export default async function Desktop({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await requireTenant();
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0,80) ?? "";
  const result = q ? await listWorkspaceFolders(ctx, { q, page: Math.min(10000, Math.max(1, Math.floor(Number(sp.page)) || 1)) }) : null;
  const pageHref = (page: number) => `/area-de-trabalho?${new URLSearchParams({ q, page: String(page) })}`;
  return <div>
    <section className={`mx-auto max-w-[760px] text-center ${result ? "pt-12 pb-12" : "pt-[17vh] pb-16"}`}>
      <p className="mb-5 text-[10px] font-medium uppercase tracking-[0.3em] text-muted">Seu espaço. Seu foco.</p>
      <h1 className="text-5xl font-medium tracking-[-0.055em]">Qual cliente vamos abrir?</h1>
      <form aria-label="Buscar pastas" className="mt-10 flex h-[72px] items-center gap-4 rounded-2xl border border-border bg-surface px-5 shadow-sm transition focus-within:border-fg/25 focus-within:shadow-lg">
        <Search className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.5} />
        <label htmlFor="desktop-search" className="sr-only">Nome, CPF ou processo</label>
        <input autoFocus id="desktop-search" name="q" defaultValue={q} maxLength={80} placeholder="Nome do cliente, CPF ou processo" autoComplete="off" className="h-full min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted/70" />
        <button type="submit" aria-label="Buscar cliente" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fg text-surface transition hover:opacity-80"><ArrowRight className="h-4 w-4" /></button>
      </form>
      <p className="mt-4 text-xs text-muted">Digite e pressione Enter para encontrar a pasta.</p>
    </section>
    {result ? <section aria-label="Resultados da busca" className="mx-auto max-w-[1200px] pb-10">
      <div className="mb-5 flex items-center justify-between text-xs text-muted"><p>{result.total} pasta(s) encontrada(s)</p><Link href="/area-de-trabalho" className="transition hover:text-fg">Limpar busca</Link></div>
      <div className="grid grid-cols-3 gap-5">{result.items.map(c => <Link key={c.id} href={`/area-de-trabalho/${c.id}`} className="desktop-folder group min-w-0 rounded-2xl border border-border bg-surface p-6 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <div className="mb-8 flex items-start justify-between"><Folder className="h-10 w-10 text-primary-text" strokeWidth={1.1} /><ArrowUpRight className="h-4 w-4 text-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" /></div>
        <h2 className="break-words text-lg font-medium tracking-tight">{c.name}</h2>
        <p className="mt-2 text-xs text-muted">{c.document ? `${c.type === "PERSON" ? "CPF" : "CNPJ"} · ${formatDocument(c.type, c.document)}` : "Documento não informado"}</p>
        <div className="mt-5 space-y-2 border-t border-border pt-4">{c.cases.length ? c.cases.map(p => <div key={p.id}><p className="truncate text-xs text-muted">{p.number ?? p.title}</p></div>) : <p className="text-xs text-muted">Abrir pasta do cliente</p>}</div>
      </Link>)}</div>
      {!result.items.length ? <div className="py-16 text-center"><p className="text-lg font-medium">Nenhuma pasta encontrada.</p><p className="mt-3 text-sm text-muted">Tente outro nome, CPF ou número de processo.</p></div> : null}
      {result.pages > 1 ? <nav aria-label="Paginação das pastas" className="mt-8 flex justify-between text-xs text-muted">{result.page > 1 ? <Link href={pageHref(result.page-1)}>Anterior</Link> : <span />}<span>{result.page} / {result.pages}</span>{result.page < result.pages ? <Link href={pageHref(result.page+1)}>Próxima</Link> : <span />}</nav> : null}
    </section> : null}
  </div>;
}
