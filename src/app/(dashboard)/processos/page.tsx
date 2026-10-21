import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Lock, Plus, Rows3, Search } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { ExportLinks } from "@/modules/export/export-links";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { formatMoneyBR } from "@/lib/validation/money";
import { CASE_AREAS, CASE_STATUS_LABEL, CASE_STATUSES } from "@/modules/cases/schemas";
import { StatusControl } from "@/modules/cases/case-panels";
import { can } from "@/server/context";
import { listAssignableMembers, listCases } from "@/server/services/case.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Processos" };

type SP = { q?: string; status?: string; area?: string; responsavel?: string; visao?: string; pagina?: string };

const TONE = { ACTIVE: "success", SUSPENDED: "warning", ARCHIVED: "neutral", CLOSED: "neutral" } as const;

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const sp = await searchParams;
  const board = sp.visao === "quadro";
  const status = (CASE_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof CASE_STATUSES)[number]) : undefined;
  const area = (CASE_AREAS as readonly string[]).includes(sp.area ?? "") ? sp.area : undefined;
  const responsibleId = /^[0-9a-f-]{36}$/i.test(sp.responsavel ?? "") ? sp.responsavel : undefined;
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const [result, members] = await Promise.all([
    listCases(ctx, { q: sp.q, status, area, responsibleId, page, board }),
    listAssignableMembers(ctx),
  ]);
  const canWrite = can(ctx, "cases:write");
  const filtered = Boolean(sp.q || status || area || responsibleId);
  const viewHref = (v: "tabela" | "quadro") => {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries({ q: sp.q, status, area, responsavel: responsibleId })) if (val) q.set(k, val);
    if (v === "quadro") q.set("visao", "quadro");
    const qs = q.toString();
    return qs ? `/processos?${qs}` : "/processos";
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Processos"
        description="Carteira de processos do escritório. Processos sigilosos só aparecem para a equipe do processo e administradores."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportLinks kind="processos" />
            <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Modo de visualização">
              <Link href={viewHref("tabela")} aria-current={!board ? "page" : undefined} className={cn("flex h-8 items-center gap-1.5 rounded px-2.5 text-xs", !board ? "bg-surface-3 font-medium" : "text-muted hover:text-fg")}>
                <Rows3 className="h-3.5 w-3.5" aria-hidden /> Tabela
              </Link>
              <Link href={viewHref("quadro")} aria-current={board ? "page" : undefined} className={cn("flex h-8 items-center gap-1.5 rounded px-2.5 text-xs", board ? "bg-surface-3 font-medium" : "text-muted hover:text-fg")}>
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Quadro
              </Link>
            </div>
            {canWrite ? (
              <Link href="/processos/novo" className={buttonVariants({})}>
                <Plus className="h-4 w-4" aria-hidden /> Novo processo
              </Link>
            ) : null}
          </div>
        }
      />

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_190px_170px_200px_auto]" role="search" aria-label="Filtrar processos">
        {board ? <input type="hidden" name="visao" value="quadro" /> : null}
        <div className="relative">
          <label htmlFor="q" className="sr-only">
            Buscar por número, título ou parte
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Número, título, parte ou cliente" className="pl-9" />
        </div>
        <div>
          <label htmlFor="status" className="sr-only">Situação</label>
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">Todas as situações</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="area" className="sr-only">Área</label>
          <Select id="area" name="area" defaultValue={area ?? ""}>
            <option value="">Todas as áreas</option>
            {CASE_AREAS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="responsavel" className="sr-only">Responsável</label>
          <Select id="responsavel" name="responsavel" defaultValue={responsibleId ?? ""}>
            <option value="">Todos os responsáveis</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Filtrar</button>
      </form>

      {result.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          {filtered ? "Nenhum processo encontrado com esses filtros." : "Nenhum processo cadastrado ainda."}
          {canWrite && !filtered ? (
            <div className="mt-3">
              <Link href="/processos/novo" className={buttonVariants({ variant: "secondary" })}>Cadastrar o primeiro processo</Link>
            </div>
          ) : null}
        </Card>
      ) : board ? (
        <>
          {result.truncated ? <p className="mb-2 text-xs text-warning">Mostrando os 200 processos mais recentemente atualizados. Use os filtros para refinar.</p> : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {CASE_STATUSES.map((s) => {
              const col = result.items.filter((c) => c.status === s);
              return (
                <section key={s} aria-label={CASE_STATUS_LABEL[s]} className="rounded-lg border border-border bg-surface-2/40 p-2">
                  <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
                    {CASE_STATUS_LABEL[s]} <span className="rounded-full bg-surface-3 px-1.5 text-[11px] text-muted">{col.length}</span>
                  </h2>
                  <div className="space-y-2">
                    {col.map((c) => (
                      <article key={c.id} className="rounded-md border border-border bg-surface p-2.5">
                        <Link href={`/processos/${c.id}`} className="block text-sm font-medium hover:underline">
                          {c.confidential ? <Lock className="mr-1 inline h-3 w-3 text-warning" aria-label="Sigiloso" /> : null}
                          {c.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">{c.number ?? c.legacyNumber ?? "Sem número"}</p>
                        <p className="mt-1 truncate text-xs text-muted">{c.parties.map((p) => p.client?.name ?? p.name).join(", ") || "Sem cliente vinculado"}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-muted">{c.responsible?.name ?? "Sem responsável"}</span>
                          <StatusControl caseId={c.id} status={c.status} canWrite={canWrite} />
                        </div>
                      </article>
                    ))}
                    {col.length === 0 ? <p className="px-1 py-3 text-xs text-muted">Nenhum processo.</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Lista de processos</caption>
                <thead className="border-b border-border bg-surface-2/60 text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">Processo</th>
                    <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">Cliente(s)</th>
                    <th scope="col" className="hidden px-4 py-2 font-medium lg:table-cell">Área / órgão</th>
                    <th scope="col" className="hidden px-4 py-2 font-medium lg:table-cell">Responsável</th>
                    <th scope="col" className="px-4 py-2 font-medium">Situação</th>
                    <th scope="col" className="hidden px-4 py-2 text-right font-medium xl:table-cell">Valor da causa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.items.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-2/40">
                      <td className="px-4 py-2.5">
                        <Link href={`/processos/${c.id}`} className="font-medium hover:underline">
                          {c.confidential ? <Lock className="mr-1 inline h-3.5 w-3.5 text-warning" aria-label="Sigiloso" /> : null}
                          {c.title}
                        </Link>
                        <p className="text-xs tabular-nums text-muted">{c.number ?? c.legacyNumber ?? "Sem número"}</p>
                      </td>
                      <td className="hidden px-4 py-2.5 text-xs text-muted md:table-cell">{c.parties.map((p) => p.client?.name ?? p.name).join(", ") || "—"}</td>
                      <td className="hidden px-4 py-2.5 text-xs text-muted lg:table-cell">
                        {c.area ?? "—"}
                        {c.court ? <p>{c.court}</p> : null}
                      </td>
                      <td className="hidden px-4 py-2.5 text-xs text-muted lg:table-cell">{c.responsible?.name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={TONE[c.status]}>{CASE_STATUS_LABEL[c.status]}</Badge>
                      </td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums text-muted xl:table-cell">{c.claimValue ? formatMoneyBR(c.claimValue.toString()) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination basePath="/processos" params={{ q: sp.q, status, area, responsavel: responsibleId }} page={result.page} pages={result.pages} total={result.total} />
        </>
      )}
    </div>
  );
}
