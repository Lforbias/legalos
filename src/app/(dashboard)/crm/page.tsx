import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { formatYmd, dateToYmd } from "@/lib/dates/ymd";
import { formatMoneyBR } from "@/lib/validation/money";
import { LEAD_STAGES, LEAD_STAGE_LABEL, type LeadStageKey } from "@/modules/crm/schemas";
import { StageSelect } from "@/modules/crm/lead-controls";
import { can } from "@/server/context";
import { listLeads } from "@/server/services/crm.service";
import { listActiveMembers } from "@/server/services/members";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "CRM comercial" };

type SP = { q?: string; responsavel?: string };

export default async function CrmPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "crm:read")) return <AccessDenied />;
  const sp = await searchParams;
  const ownerId = sp.responsavel === "eu" ? ctx.userId : sp.responsavel;
  const [result, members] = await Promise.all([listLeads(ctx, { q: sp.q, ownerId }), listActiveMembers(ctx)]);
  const canWrite = can(ctx, "crm:write");
  const sums = new Map(result.summary.map((s) => [s.stage, { count: s._count._all, sum: s._sum.estimatedValue?.toString() ?? "0.00" }]));
  const byStage = (s: LeadStageKey) => result.items.filter((i) => i.stage === s);

  return (
    <div className="mx-auto max-w-[110rem]">
      <PageHeader
        title="CRM comercial"
        description="Funil de leads, propostas e conversão em cliente. Valores são estimativas do escritório, não receita realizada."
        actions={canWrite ? <Link href="/crm/novo" className={bv({})}><Plus className="h-4 w-4" aria-hidden /> Novo lead</Link> : undefined}
      />
      <form method="get" role="search" aria-label="Filtrar leads" className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="q" className="sr-only">Buscar</label>
        <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nome, e-mail ou interesse…" className="w-72" />
        <label htmlFor="responsavel" className="sr-only">Responsável</label>
        <Select id="responsavel" name="responsavel" defaultValue={sp.responsavel ?? ""} className="w-56">
          <option value="">Todos os responsáveis</option>
          <option value="eu">Meus leads</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
        <button type="submit" className={bv({ variant: "secondary" })}>Filtrar</button>
      </form>
      {result.truncated ? <p className="mb-2 text-xs text-warning">Mostrando os 300 leads mais recentes de {result.total}. Refine a busca.</p> : null}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {LEAD_STAGES.map((s) => {
          const items = byStage(s);
          const sum = sums.get(s);
          return (
            <section key={s} aria-label={LEAD_STAGE_LABEL[s]} role="region" className="min-w-0 rounded-lg border border-border bg-surface">
              <header className="border-b border-border px-3 py-2">
                <h2 className="text-sm font-semibold">{LEAD_STAGE_LABEL[s]} <span className="text-xs font-normal text-muted">({sum?.count ?? 0})</span></h2>
                <p className="text-xs text-muted">{formatMoneyBR(sum?.sum ?? "0.00")} estimados</p>
              </header>
              <ul className="space-y-2 p-2">
                {items.length === 0 ? <li className="px-1 py-3 text-xs text-muted">Nenhum lead.</li> : null}
                {items.map((l) => (
                  <li key={l.id} className="rounded-md border border-border bg-surface-2 p-2">
                    <Link href={`/crm/${l.id}`} className="block text-sm font-medium hover:underline">{l.name}</Link>
                    {l.interest ? <p className="truncate text-xs text-muted">{l.interest}</p> : null}
                    <p className="mt-1 text-xs text-muted">
                      {l.estimatedValue ? formatMoneyBR(l.estimatedValue.toString()) : "sem valor"}{l.ownerName ? ` · ${l.ownerName}` : ""}
                    </p>
                    {l.nextActionDate ? <p className="text-xs text-muted">Próximo contato: {formatYmd(dateToYmd(l.nextActionDate))}</p> : null}
                    {canWrite && s !== "WON" && s !== "LOST" ? <div className="mt-2"><StageSelect leadId={l.id} stage={l.stage} compact /></div> : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {result.total === 0 ? <Card className="mt-4 p-6 text-center text-sm text-muted">Nenhum lead cadastrado ainda.</Card> : null}
    </div>
  );
}
