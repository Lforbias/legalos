import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import { uuidSchema } from "@/lib/validation/common";
import { NotFoundError } from "@/lib/permissions/check";
import { getCase } from "@/server/services/case.service";
import { listCaseAutos } from "@/server/services/autos.service";
import { getDocument } from "@/server/services/document.service";
import { connectionForCase } from "@/server/services/mni.service";
import { MniAutosButton } from "@/modules/mni/mni-ui";
import { BookmarkButton } from "@/modules/documents/bookmark-button";
import { formatDateTime } from "@/lib/dates/format";
import { formatBytes } from "@/lib/format/phone";
export const metadata: Metadata = { title: "Autos digitais" };
export default async function AutosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ documento?: string; q?: string; favoritos?: string; pagina?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "documents:read") || !can(ctx, "cases:read")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const c = await getCase(ctx, id.data).catch(e => e instanceof NotFoundError ? null : Promise.reject(e));
  if (!c) notFound();
  const sp = await searchParams;
  const data = await listCaseAutos(ctx, c.id, { q: sp.q, favorites: sp.favoritos === "1", page: /^\d{1,6}$/.test(sp.pagina ?? "") ? Number(sp.pagina) : 1 });
  const selectedId = data.items.find(d => d.id === sp.documento)?.id ?? data.items[0]?.id;
  const selected = selectedId ? (await getDocument(ctx, selectedId)).doc : null;
  const connection = can(ctx, "cases:write") && can(ctx, "documents:write") && !c.confidential ? await connectionForCase(ctx, c.id).catch(() => null) : null;
  const href = (doc?: string, page = data.page) => {
    const q = new URLSearchParams({ pagina: String(page) });
    if (sp.q) q.set("q", sp.q.slice(0, 150));
    if (sp.favoritos === "1") q.set("favoritos", "1");
    if (doc) q.set("documento", doc);
    return `/processos/${c.id}/autos?${q}`;
  };
  return <div className="mx-auto max-w-[1600px]">
    <PageHeader title="Autos digitais" description={`${c.title} · ${c.number ?? "Sem número"}`} actions={<div className="flex gap-2"><Link className={buttonVariants({ variant: "secondary" })} href={`/processos/${c.id}?aba=documentos`}>Documentos do processo</Link>{connection ? <MniAutosButton caseId={c.id} label={connection.label} /> : null}</div>} />
    <p className="mb-3 text-sm text-muted">{data.lastSync ? `${data.lastSync.action.endsWith("failed") ? "Última tentativa falhou; arquivos já recebidos foram preservados" : "Última sincronização concluída"}: ${formatDateTime(data.lastSync.createdAt, ctx.timezone)}.` : "Nenhuma sincronização dos autos registrada."} {!connection ? "Para sincronizar, configure uma conexão compatível em Integrações." : "A sincronização importa até 25 arquivos por execução; repita se houver pendências."}</p>
    <form method="get" className="mb-4 flex flex-wrap gap-3 items-center"><label className="flex-1 text-sm">Buscar nos autos<Input name="q" defaultValue={sp.q ?? ""} maxLength={150} placeholder="Nome, descrição ou texto extraído (inclui versões anteriores)" /></label><label className="text-sm"><input name="favoritos" type="checkbox" value="1" defaultChecked={sp.favoritos === "1"} /> Só meus favoritos</label><button className={buttonVariants({ variant: "secondary" })}>Buscar</button></form>
    <p className="mb-3 text-sm">{data.total} documento(s) · página {data.page} de {data.pageCount}</p>
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <nav aria-label="Índice dos autos" className="space-y-2 lg:max-h-[75vh] lg:overflow-y-auto">{data.items.map(d => <Card key={d.id} className={`p-3 ${d.id === selectedId ? "border-primary" : ""}`}><div className="flex items-start gap-2"><BookmarkButton id={d.id} favorite={d.favorite} /><Link scroll={false} aria-current={d.id === selectedId ? "true" : undefined} href={href(d.id)} className="text-sm font-medium hover:underline">{d.name}</Link></div><p className="mt-1 text-xs text-muted">v{d.currentVersion} · {formatBytes(d.sizeBytes)} · {d.externalKey?.startsWith("mni:") ? "Tribunal" : "Anexado ao processo"}</p></Card>)}{!data.items.length ? <Card className="p-6 text-sm">Nenhum documento encontrado.</Card> : null}</nav>
      <Card className="min-w-0 p-4">{selected ? <><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">{selected.name}</h2><div className="flex gap-3 text-sm"><a className="underline" href={`/api/documents/${selected.id}`}>Baixar</a><Link className="underline" href={`/documentos/${selected.id}`}>Versões e texto extraído</Link></div></div>{["application/pdf", "image/png", "image/jpeg"].includes(selected.mimeType) ? <iframe key={`${selected.id}:${selected.currentVersion}`} title={`Visualização de ${selected.name}`} className="h-[72vh] w-full rounded border border-border" src={`/api/documents/${selected.id}?inline=1&v=${selected.currentVersion}`} /> : <p className="text-sm text-muted">Baixe este formato para abri-lo no aplicativo correspondente.</p>}</> : <p className="text-sm text-muted">Selecione um documento no índice.</p>}</Card>
    </div>
    <nav aria-label="Paginação dos autos" className="mt-4 flex justify-between">{data.page > 1 ? <Link className="underline" href={href(undefined, data.page - 1)}>Anterior</Link> : <span />}{data.page < data.pageCount ? <Link className="underline" href={href(undefined, data.page + 1)}>Próxima</Link> : null}</nav>
  </div>;
}
