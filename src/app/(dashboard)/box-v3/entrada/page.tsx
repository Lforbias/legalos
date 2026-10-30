import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates/format";
import { ORIGIN_LABEL, type OriginKind } from "@/lib/judicial/contracts";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { requireTenant } from "@/server/session";
import { listBoxV3Notices, type BoxV3Folder } from "@/server/judicial/box-v3.service";
import { BoxV3SectionNav } from "@/modules/box-v3/section-nav";

export const metadata: Metadata = { title: "Caixa de entrada · LegalOS Box 3.0" };
type Search = { pasta?: string; q?: string; tipo?: string; origem?: string; leitura?: string; ciencia?: string; pagina?: string };

const folders: { key: BoxV3Folder; label: string }[] = [
  { key: "entrada", label: "Entrada" },
  { key: "abertas", label: "Em aberto" },
  { key: "acervo", label: "Acervo" },
  { key: "adormecidas", label: "Adormecidas" },
];
const statusLabel: Record<string, string> = { NEW: "Nova", DISTRIBUTED: "Distribuída", PROCESSED: "Tratada", DISCARDED: "Descartada" };
const originLabel = (origin: string | null) => origin ? ORIGIN_LABEL[origin as OriginKind] ?? "Outra origem" : "Registro manual ou importação";

export default async function BoxV3InboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!boxV3PreviewEnabled()) notFound();
  const { ctx } = await requireTenant();
  if (!ctx.permissions.has("inbox:read")) return <p className="text-sm text-muted">Você não tem acesso à área de intimações deste escritório.</p>;
  const sp = await searchParams;
  const folder = folders.some((item) => item.key === sp.pasta) ? (sp.pasta as BoxV3Folder) : "entrada";
  const q = sp.q?.trim().slice(0, 80) ?? "";
  const kind = ["INTIMACAO", "CITACAO", "DESPACHO", "DECISAO", "SENTENCA", "OUTRO"].includes(sp.tipo ?? "") ? sp.tipo : "";
  const origin = ["DJEN_PUBLICATION", "PRIVATE_COMMUNICATION", "PROCESS_MOVEMENT", "IMPORT", "MANUAL"].includes(sp.origem ?? "") ? sp.origem : "";
  const reading = sp.leitura === "vista" ? "seen" : sp.leitura === "nao-vista" ? "unseen" : undefined;
  const official = sp.ciencia === "confirmada" ? "confirmed" : sp.ciencia === "pendente" ? "pending" : sp.ciencia === "sem-ciencia" ? "none" : undefined;
  const requestedPage = /^\d{1,6}$/.test(sp.pagina ?? "") ? Number(sp.pagina) : 1;
  const data = await listBoxV3Notices(ctx, { folder, q, kind, origin, reading, official, page: requestedPage, take: 50 });
  const selectedFilters = { pasta: folder, ...(q ? { q } : {}), ...(kind ? { tipo: kind } : {}), ...(origin ? { origem: origin } : {}), ...(reading ? { leitura: reading === "seen" ? "vista" : "nao-vista" } : {}), ...(official ? { ciencia: official === "confirmed" ? "confirmada" : official === "pending" ? "pendente" : "sem-ciencia" } : {}) };
  const pageHref = (page: number) => `/box-v3/entrada?${new URLSearchParams({ ...selectedFilters, pagina: String(page) })}`;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="Caixa de entrada" description="Comunicações recebidas, com captura, leitura no LegalOS e ciência oficial exibidas separadamente." actions={<Link className={buttonVariants({ variant: "secondary" })} href="/box-v3">Visão geral</Link>} />
      <BoxV3SectionNav permissions={ctx.permissions} current="/box-v3/entrada" />
      <Alert tone="warning">Consulta da caixa e ações internas explícitas. Nenhuma sincronização ou ação processual é executada; abrir um item não registra ciência no tribunal.</Alert>

      <nav aria-label="Pastas da caixa" className="flex gap-1 overflow-x-auto border-b border-border">
        {folders.map((item) => (
          <Link key={item.key} href={`/box-v3/entrada?pasta=${item.key}`} aria-current={folder === item.key ? "page" : undefined} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${folder === item.key ? "border-primary font-medium" : "border-transparent text-muted hover:text-fg"}`}>
            {item.label}<span className="ml-1 rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{data.counts[item.key]}</span>
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-2" role="search" aria-label="Buscar e filtrar a caixa">
        <input type="hidden" name="pasta" value={folder} />
        <label htmlFor="box-v3-q" className="sr-only">Processo, órgão ou título</label>
        <Input id="box-v3-q" name="q" defaultValue={q} placeholder="Processo, órgão ou título" className="max-w-xl" />
        <label className="text-xs text-muted">Tipo<select name="tipo" defaultValue={kind} className="mt-1 block min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option value="">Todos</option><option value="INTIMACAO">Intimação</option><option value="CITACAO">Citação</option><option value="DESPACHO">Despacho</option><option value="DECISAO">Decisão</option><option value="SENTENCA">Sentença</option><option value="OUTRO">Outro</option></select></label>
        <label className="text-xs text-muted">Origem<select name="origem" defaultValue={origin} className="mt-1 block min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option value="">Todas</option><option value="DJEN_PUBLICATION">DJEN</option><option value="PRIVATE_COMMUNICATION">Intimação eletrônica</option><option value="PROCESS_MOVEMENT">Movimentação</option><option value="IMPORT">Importada</option><option value="MANUAL">Manual</option></select></label>
        <label className="text-xs text-muted">Leitura no LegalOS<select name="leitura" defaultValue={reading === "seen" ? "vista" : reading === "unseen" ? "nao-vista" : ""} className="mt-1 block min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option value="">Todas</option><option value="nao-vista">Não vista</option><option value="vista">Vista</option></select></label>
        <label className="text-xs text-muted">Ciência oficial<select name="ciencia" defaultValue={official === "confirmed" ? "confirmada" : official === "pending" ? "pendente" : official === "none" ? "sem-ciencia" : ""} className="mt-1 block min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option value="">Todas</option><option value="confirmada">Confirmada</option><option value="pendente">Pendente</option><option value="sem-ciencia">Sem ciência a registrar</option></select></label>
        <button className={buttonVariants({ variant: "secondary" })} type="submit">Buscar</button>
        {q || kind || origin || reading || official ? <Link className={buttonVariants({ variant: "ghost" })} href={`/box-v3/entrada?pasta=${folder}`}>Limpar filtros</Link> : null}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted"><span>{data.total} comunicação(ões) nesta pasta</span><span>Página {data.page} de {data.pageCount} · {data.items.length} itens nesta página</span></div>
      {!data.items.length ? <Card><CardBody className="py-12 text-center text-sm text-muted">Nenhuma comunicação encontrada.</CardBody></Card> : (
        <div className="space-y-2">
          {data.items.map((item) => (
            <Link key={item.id} href={`/box-v3/entrada/${item.id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Card className="transition-colors hover:border-primary/50"><CardBody className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-sm font-semibold">{item.title}</h2><Badge tone="neutral">{statusLabel[item.status] ?? item.status}</Badge><Badge tone="info">{originLabel(item.originKind)}</Badge></div>
                  <p className="mt-2 text-sm text-muted">{item.case?.title ?? item.caseNumber ?? "Sem processo vinculado"}{item.caseNumber && item.case?.title ? ` · ${item.caseNumber}` : ""}</p>
                  <p className="mt-1 text-xs text-muted">{item.court ?? item.courtCode ?? "Órgão não informado"}{item.assigneeName ? ` · Responsável: ${item.assigneeName}` : item.teamName ? ` · Equipe: ${item.teamName}` : ""}</p>
                  {item.tags.length ? <div className="mt-2 flex flex-wrap gap-1.5">{item.tags.map((tag) => <Badge key={tag} tone="neutral">{tag}</Badge>)}</div> : null}
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-1">
                  <div><dt className="text-muted">Recebida</dt><dd className="mt-0.5">{formatDateTime(item.receivedAt, ctx.timezone)}</dd></div>
                  <div><dt className="text-muted">Capturada</dt><dd className="mt-0.5">{item.capturedAt ? formatDateTime(item.capturedAt, ctx.timezone) : "Registro manual"}</dd></div>
                  <div><dt className="text-muted">Leitura interna registrada</dt><dd className="mt-0.5">{item.firstViewedAt ? formatDateTime(item.firstViewedAt, ctx.timezone) : "Sem registro"}</dd></div>
                  <div><dt className="text-muted">Ciência oficial</dt><dd className="mt-0.5">{item.officialAckAt ? "Confirmada pela fonte" : item.officialAckState === "NOT_APPLICABLE" ? "Não se aplica" : "Sem confirmação registrada"}</dd></div>
                  {item.snoozedUntil ? <div><dt className="text-muted">Retorna à caixa</dt><dd className="mt-0.5">{item.snoozedUntil.toISOString().slice(0, 10)}</dd></div> : null}
                </dl>
              </CardBody></Card>
            </Link>
          ))}
        </div>
      )}
      <nav aria-label="Paginação da caixa" className="flex flex-wrap items-center justify-between gap-3">
        {data.page > 1 ? <Link className={buttonVariants({ variant: "secondary" })} href={pageHref(data.page - 1)}>Página anterior</Link> : <span />}
        <span className="text-sm text-muted">Página {data.page} de {data.pageCount}</span>
        {data.page < data.pageCount ? <Link className={buttonVariants({ variant: "secondary" })} href={pageHref(data.page + 1)}>Próxima página</Link> : <span />}
      </nav>
    </div>
  );
}
