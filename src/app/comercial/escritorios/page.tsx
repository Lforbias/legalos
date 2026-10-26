import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { brl, dateBR } from "@/lib/comercial/format";
import { isStageKey, STAGE_INFO, STAGE_KEYS } from "@/lib/comercial/stages";
import { NewProspect } from "@/modules/comercial/new-prospect";
import { requireComercial } from "@/server/comercial";
import { listProspects, ownersForSelect } from "@/server/services/comercial.service";

export const metadata: Metadata = { title: "LegalOS Comercial — escritórios" };
export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; stage?: string; owner?: string; top?: string; overdue?: string; page?: string }>;

export default async function ProspectsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { cx } = await requireComercial();
  const stage = isStageKey(sp.stage) ? sp.stage : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [owners, list] = await Promise.all([ownersForSelect(cx), listProspects(cx, { q: sp.q, stage, ownerId: sp.owner, top: sp.top === "1", overdue: sp.overdue === "1", page, pageSize: 25 })]);
  const name = new Map(owners.map((o) => [o.id, o.name]));
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const qs = (p: number) => { const u = new URLSearchParams(); if (sp.q) u.set("q", sp.q); if (stage) u.set("stage", stage); if (sp.owner) u.set("owner", sp.owner); if (sp.top === "1") u.set("top", "1"); if (sp.overdue === "1") u.set("overdue", "1"); u.set("page", String(p)); return `?${u.toString()}`; };
  return (
    <div className="space-y-4">
      <PageHeader title="Escritórios" description="Todos os escritórios que vocês acompanham. Clique para ver contatos, histórico, proposta e localização." />
      <Card><CardHeader title="Adicionar escritório" description="Pelo CNPJ, só com o nome ou escolhendo da base da Receita." /><CardBody className="space-y-3"><NewProspect /><p className="text-sm">Quer escolher entre os escritórios já importados? <Link className="underline" href="/comercial/base">Abrir a base da Receita</Link>.</p></CardBody></Card>
      <form className="grid gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-5" role="search">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nome, bairro, CNPJ ou telefone" aria-label="Buscar" className="lg:col-span-2" />
        <Select name="stage" defaultValue={stage ?? ""} aria-label="Etapa"><option value="">Todas as etapas</option>{STAGE_KEYS.map((k) => <option key={k} value={k}>{STAGE_INFO[k].label}</option>)}</Select>
        <Select name="owner" defaultValue={sp.owner ?? ""} aria-label="Responsável"><option value="">Qualquer responsável</option><option value="none">Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
        <div className="flex items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" name="top" value="1" defaultChecked={sp.top === "1"} /> Lista dos 100</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" name="overdue" value="1" defaultChecked={sp.overdue === "1"} /> Atrasados</label>
          <Button type="submit" size="sm">Filtrar</Button>
        </div>
      </form>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-surface-2 text-xs text-muted"><tr><th className="p-2 font-medium">#</th><th className="p-2 font-medium">Escritório</th><th className="p-2 font-medium">Contato</th><th className="p-2 font-medium">Bairro</th><th className="p-2 font-medium">Etapa</th><th className="p-2 font-medium">Responsável</th><th className="p-2 font-medium">Valor/mês</th><th className="p-2 font-medium">Retorno</th></tr></thead>
          <tbody>
            {list.rows.length === 0 ? <tr><td colSpan={8} className="p-4 text-muted">Nenhum escritório encontrado.</td></tr> : null}
            {list.rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 tabular-nums text-muted">{r.rankingPosition ?? ""}</td>
                <td className="p-2"><Link href={`/comercial/escritorios/${r.id}`} className="font-medium hover:underline">{r.name}</Link> {r.doNotContact ? <Badge tone="danger">não contatar</Badge> : null}{r.lat == null ? <span className="ml-1 text-[11px] text-muted" title="Sem ponto no mapa">(sem mapa)</span> : null}</td>
                <td className="p-2 text-xs">{r.phone ?? "—"}<br /><span className="text-muted">{r.email ?? ""}</span></td>
                <td className="p-2 text-xs">{r.district ?? "—"}</td>
                <td className="p-2"><Badge>{STAGE_INFO[r.stage].label}</Badge></td>
                <td className="p-2 text-xs">{r.ownerId ? name.get(r.ownerId) ?? "—" : "—"}</td>
                <td className="p-2 tabular-nums">{brl(r.expectedMonthlyCents)}</td>
                <td className="p-2 text-xs">{dateBR(r.nextActionAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="flex items-center justify-between text-sm" aria-label="Páginas">
        <span className="text-muted">{list.total} escritórios · página {page} de {pages}</span>
        <span className="flex gap-3">{page > 1 ? <Link className="underline" href={qs(page - 1)}>Anterior</Link> : null}{page < pages ? <Link className="underline" href={qs(page + 1)}>Próxima</Link> : null}</span>
      </nav>
    </div>
  );
}
