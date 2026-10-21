import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, LayoutTemplate } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { formatDateTime } from "@/lib/dates/format";
import { formatBytes } from "@/lib/format/phone";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL, type DocumentCategory } from "@/modules/documents/schemas";
import { can } from "@/server/context";
import { listRepository } from "@/server/services/document.service";
import { searchDocumentContent } from "@/server/services/document-text.service";
import { ExtractPendingButton } from "@/modules/documents/text-panel";
import { ValidationError } from "@/lib/permissions/check";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Documentos" };

type SP = { q?: string; categoria?: string; origem?: string; conteudo?: string };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "documents:read")) return <AccessDenied />;
  const sp = await searchParams;
  const scope = sp.origem === "case" || sp.origem === "client" ? sp.origem : undefined;
  const result = await listRepository(ctx, { q: sp.q, category: sp.categoria, scope });
  const content = sp.conteudo?.trim() ? await searchDocumentContent(ctx, sp.conteudo).then((hits) => ({ hits, error: null as string | null })).catch((e) => (e instanceof ValidationError ? { hits: [], error: e.message } : Promise.reject(e))) : null;
  const canWrite = can(ctx, "documents:write");
  const canTemplates = can(ctx, "templates:manage");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Documentos"
        description="Repositório privado do escritório. Para enviar arquivos, abra o processo ou o cliente; documentos de processos sigilosos só aparecem para quem pode ver o processo."
        actions={
          <div className="flex gap-2">
            <Link href="/documentos/modelos" className={bv({ variant: "secondary" })}>
              <LayoutTemplate className="h-4 w-4" aria-hidden /> {canTemplates ? "Modelos" : "Ver modelos"}
            </Link>
            {canWrite ? (
              <Link href="/documentos/gerar" className={bv({})}>
                <FilePlus2 className="h-4 w-4" aria-hidden /> Gerar de modelo
              </Link>
            ) : null}
          </div>
        }
      />
      <form method="get" role="search" aria-label="Filtrar documentos" className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="q" className="sr-only">Buscar pelo nome</label>
        <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar pelo nome…" className="w-64" />
        <label htmlFor="categoria" className="sr-only">Categoria</label>
        <Select id="categoria" name="categoria" defaultValue={sp.categoria ?? ""} className="w-52">
          <option value="">Todas as categorias</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>
          ))}
        </Select>
        <label htmlFor="origem" className="sr-only">Origem</label>
        <Select id="origem" name="origem" defaultValue={scope ?? ""} className="w-44">
          <option value="">Processos e clientes</option>
          <option value="case">Só de processos</option>
          <option value="client">Só de clientes</option>
        </Select>
        <button type="submit" className={bv({ variant: "secondary" })}>Filtrar</button>
      </form>
      <form method="get" role="search" aria-label="Buscar no conteúdo" className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="conteudo" className="sr-only">Buscar no conteúdo dos documentos</label>
        <Input id="conteudo" name="conteudo" defaultValue={sp.conteudo ?? ""} placeholder="Buscar dentro dos documentos…" className="w-64" />
        <button type="submit" className={bv({ variant: "secondary" })}>Buscar no conteúdo</button>
        {canWrite ? <ExtractPendingButton /> : null}
      </form>
      {content ? (
        <Card className="mb-4">
          <div className="border-b border-border px-4 py-2.5 text-sm font-medium" data-testid="content-count">{content.error ?? `${content.hits.length} documento(s) com “${sp.conteudo}”`}</div>
          {!content.error && content.hits.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nada encontrado. Só documentos com texto extraído entram na busca; use “Extrair texto dos pendentes”.</p> : null}
          <ul className="divide-y divide-border">
            {content.hits.map((h) => (
              <li key={h.id} className="px-4 py-3">
                <Link href={`/documentos/${h.id}`} className="text-sm font-medium text-primary-text hover:underline">{h.name}</Link>
                <p className="text-xs text-muted">{h.caseTitle ? `Processo: ${h.caseTitle}` : h.clientName ? `Cliente: ${h.clientName}` : ""}</p>
                <p className="mt-1 text-xs">{h.snippet}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {result.truncated ? <p className="mb-2 text-xs text-warning">Mostrando os 200 mais recentes de {result.total} documentos. Refine a busca.</p> : null}
      {result.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">Nenhum documento encontrado.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Lista de documentos</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Documento</th>
                <th scope="col" className="px-3 py-2 font-medium">Vinculado a</th>
                <th scope="col" className="px-3 py-2 font-medium">Categoria</th>
                <th scope="col" className="px-3 py-2 font-medium">Versão</th>
                <th scope="col" className="px-3 py-2 font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/documentos/${d.id}`} className="font-medium text-primary-text hover:underline">{d.name}</Link>
                    <p className="text-xs text-muted">{formatBytes(d.sizeBytes)}</p>
                  </td>
                  <td className="px-3 py-2">
                    {d.case ? <Link href={`/processos/${d.case.id}`} className="hover:underline">{d.case.title}</Link> : d.client ? <Link href={`/clientes/${d.client.id}`} className="hover:underline">{d.client.name}</Link> : "—"}
                  </td>
                  <td className="px-3 py-2">{d.category ? <Badge>{DOCUMENT_CATEGORY_LABEL[d.category as DocumentCategory] ?? d.category}</Badge> : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2">v{d.currentVersion}</td>
                  <td className="px-3 py-2 text-xs text-muted">{formatDateTime(d.updatedAt, organization.timezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
