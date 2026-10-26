import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { brl } from "@/lib/comercial/format";
import { OPEN_STAGES, STAGE_INFO, STAGE_KEYS } from "@/lib/comercial/stages";
import { ProjectionChart } from "@/modules/comercial/projection-chart";
import { requireComercial } from "@/server/comercial";
import { acquisitionSummary } from "@/server/audience/store";
import { dashboard } from "@/server/services/comercial.service";

export const metadata: Metadata = { title: "LegalOS Comercial — painel" };
export const dynamic = "force-dynamic";

function Kpi({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export default async function ComercialHome() {
  const { cx } = await requireComercial();
  const d = await dashboard(cx);
  const acquisition=await acquisitionSummary();
  const maxCount = Math.max(1, ...STAGE_KEYS.map((k) => d.byStage[k].count));
  const real = d.projection.series.find((s) => s.key === "realista")!;
  return (
    <div className="space-y-6">
      <PageHeader title="Painel comercial" description="Funil, receita já fechada e projeção. A projeção é uma estimativa a partir das premissas da aba Projeção; ela melhora conforme vocês registram o que acontece." />
      <Card><CardHeader title="Aquisição por conteúdo" description="Contas gratuitas, aceite opcional e demonstrações solicitadas; fechamento registrado no funil comercial."/><CardBody><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Origem</th><th>Cadastros</th><th>Novidades aceitas</th><th>Demonstrações</th><th>Escritórios ganhos</th></tr></thead><tbody>{acquisition.map(a=><tr key={a.origin}><td className="py-2">{a.origin}</td><td className="text-center">{a.signups}</td><td className="text-center">{a.optins}</td><td className="text-center">{a.demos}</td><td className="text-center">{a.won}</td></tr>)}</tbody></table></div></CardBody></Card>
      {d.total === 0 ? (
        <Card><CardBody>
          <p className="text-sm">Ainda não há escritórios. Comece por <Link className="underline" href="/comercial/importar">Importar</Link> (planilha com nome e CNPJ) ou <Link className="underline" href="/comercial/escritorios">adicione um escritório pelo CNPJ</Link>.</p>
        </CardBody></Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Receita mensal já fechada (MRR)" value={brl(d.wonMrrCents)} hint={`${brl(d.wonArrCents)} por ano`} />
        <Kpi label="Funil aberto (por mês)" value={brl(d.openValueCents)} hint={`${d.openCount} escritórios em andamento`} href="/comercial/funil" />
        <Kpi label="Funil ponderado" value={brl(d.weightedCents)} hint="valor × chance de fechar" />
        <Kpi label="Fechados / perdidos" value={d.conversionPct == null ? "—" : `${d.conversionPct}%`} hint={`${d.byStage.GANHO.count} ganhos · ${d.byStage.PERDIDO.count} perdidos`} />
        <Kpi label="Retornos atrasados" value={String(d.overdue)} hint="próxima ação já passou" href="/comercial/escritorios?overdue=1" />
        <Kpi label="Sem valor estimado" value={String(d.noValue)} hint="abertos sem preço previsto" href="/comercial/escritorios" />
        <Kpi label="Da lista dos 100" value={String(d.top100)} hint="com posição no ranking" href="/comercial/escritorios?top=1" />
        <Kpi label="Sem ponto no mapa" value={String(d.withoutMap)} hint="faltam endereço ou localização" href="/comercial/mapa" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Funil por etapa" description="Quantidade de escritórios e valor mensal previsto." />
          <CardBody className="space-y-2">
            {STAGE_KEYS.map((k) => {
              const s = d.byStage[k];
              return (
                <Link key={k} href={`/comercial/escritorios?stage=${k}`} className="block rounded-md p-1 hover:bg-surface-2">
                  <div className="flex items-center justify-between text-sm"><span>{STAGE_INFO[k].label}</span><span className="tabular-nums text-muted">{s.count} · {brl(s.valueCents)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-surface-3" aria-hidden><div className="h-2 rounded-full" style={{ width: `${(s.count / maxCount) * 100}%`, background: STAGE_INFO[k].color }} /></div>
                </Link>
              );
            })}
            <p className="pt-1 text-xs text-muted">Etapas abertas: {OPEN_STAGES.map((k) => STAGE_INFO[k].label).join(" → ")}.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Projeção de receita mensal" description={`Cenário realista: ${brl(real.mrrEndCents)}/mês daqui a 12 meses; ${brl(real.revenueTotalCents)} faturados no período.`} />
          <CardBody><ProjectionChart series={d.projection.series} months={d.projection.months} /></CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Equipe comercial" description="Registros dos últimos 7 dias e fechado neste mês." />
        <CardBody>
          {d.team.length === 0 ? <p className="text-sm text-muted">Nenhum vendedor cadastrado. Adicione em Equipe.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead><tr className="text-xs text-muted"><th className="py-1 pr-3 font-medium">Pessoa</th><th className="py-1 pr-3 font-medium">Contatos (7 dias)</th><th className="py-1 pr-3 font-medium">Fechado no mês</th><th className="py-1 font-medium">Meta mensal</th></tr></thead>
                <tbody>{d.team.map((m) => (
                  <tr key={m.userId} className="border-t border-border"><td className="py-1.5 pr-3">{m.name}</td><td className="py-1.5 pr-3 tabular-nums">{m.activities7d}</td><td className="py-1.5 pr-3 tabular-nums">{brl(m.wonThisMonthCents)}</td><td className="py-1.5 tabular-nums">{m.goalMonthlyCents ? `${brl(m.goalMonthlyCents)} (${Math.round((m.wonThisMonthCents / m.goalMonthlyCents) * 100)}%)` : "—"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
