import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { ExportLinks } from "@/modules/export/export-links";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { formatPhone } from "@/lib/format/phone";
import { formatDocument } from "@/lib/validation/br-documents";
import { CLIENT_STATUS_LABEL, CLIENT_STATUSES, CLIENT_TYPE_LABEL, CLIENT_TYPES } from "@/modules/clients/schemas";
import { can } from "@/server/context";
import { listClients, listClientTags } from "@/server/services/client.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Clientes" };

type SP = { q?: string; status?: string; tipo?: string; etiqueta?: string; pagina?: string };

const TONE = { ACTIVE: "success", PROSPECT: "info", INACTIVE: "neutral" } as const;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "clients:read")) return <AccessDenied />;
  const sp = await searchParams;
  const status = (CLIENT_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof CLIENT_STATUSES)[number]) : undefined;
  const type = (CLIENT_TYPES as readonly string[]).includes(sp.tipo ?? "") ? (sp.tipo as (typeof CLIENT_TYPES)[number]) : undefined;
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const [result, tags] = await Promise.all([listClients(ctx, { q: sp.q, status, type, tag: sp.etiqueta, page }), listClientTags(ctx)]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Clientes"
        description="Pessoas físicas e jurídicas do escritório."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportLinks kind="clientes" />
            {can(ctx, "clients:write") ? (
              <Link href="/clientes/novo" className={buttonVariants({})}>
                <Plus className="h-4 w-4" aria-hidden /> Novo cliente
              </Link>
            ) : null}
          </div>
        }
      />

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_170px_190px_190px_auto]" role="search" aria-label="Filtrar clientes">
        <div className="relative">
          <label htmlFor="q" className="sr-only">
            Buscar por nome, documento, e-mail ou telefone
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Nome, CPF/CNPJ, e-mail ou telefone" className="pl-9" />
        </div>
        <div>
          <label htmlFor="tipo" className="sr-only">
            Tipo de pessoa
          </label>
          <Select id="tipo" name="tipo" defaultValue={type ?? ""}>
            <option value="">Todos os tipos</option>
            {CLIENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CLIENT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="status" className="sr-only">
            Situação
          </label>
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">Todas as situações</option>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="etiqueta" className="sr-only">
            Etiqueta
          </label>
          <Select id="etiqueta" name="etiqueta" defaultValue={sp.etiqueta ?? ""}>
            <option value="">Todas as etiquetas</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          Filtrar
        </button>
      </form>

      <Card className="overflow-hidden">
        {result.items.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            {sp.q || status || type || sp.etiqueta ? "Nenhum cliente encontrado com esses filtros." : "Nenhum cliente cadastrado ainda."}
            {can(ctx, "clients:write") && !(sp.q || status || type || sp.etiqueta) ? (
              <div className="mt-3">
                <Link href="/clientes/novo" className={buttonVariants({ variant: "secondary" })}>
                  Cadastrar o primeiro cliente
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Lista de clientes</caption>
              <thead className="border-b border-border bg-surface-2/60 text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Nome</th>
                  <th scope="col" className="px-4 py-2 font-medium">Documento</th>
                  <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">Contato</th>
                  <th scope="col" className="px-4 py-2 font-medium">Situação</th>
                  <th scope="col" className="hidden px-4 py-2 font-medium lg:table-cell">Etiquetas</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Processos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.items.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted">{CLIENT_TYPE_LABEL[c.type]}</p>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted">{c.document ? formatDocument(c.type, c.document) : "—"}</td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted md:table-cell">
                      {c.email ?? "—"}
                      {c.phone ? <p>{formatPhone(c.phone)}</p> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={TONE[c.status]}>{CLIENT_STATUS_LABEL[c.status]}</Badge>
                    </td>
                    <td className="hidden px-4 py-2.5 lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c._count.parties}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pagination basePath="/clientes" params={{ q: sp.q, status, tipo: type, etiqueta: sp.etiqueta }} page={result.page} pages={result.pages} total={result.total} />
    </div>
  );
}
