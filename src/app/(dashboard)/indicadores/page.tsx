import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatMoneyBR } from "@/lib/validation/money";
import { getIndicators } from "@/server/services/insights.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Indicadores" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Ativos", SUSPENDED: "Suspensos", ARCHIVED: "Arquivados", CLOSED: "Encerrados" };

/** Barra horizontal simples (série única, uma cor); o valor sempre aparece em texto. */
function Bar({ value, max, label, testId }: { value: number; max: number; label: string; testId?: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-sm" data-testid={testId}>
      <span className="w-28 shrink-0 truncate text-xs text-muted sm:w-40">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-surface-2" aria-hidden><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <span className="w-10 shrink-0 text-right tabular-nums">{value}</span>
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: number | null; href?: string; tone?: "danger" }) {
  if (value === null) return null;
  const inner = (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className={`text-2xl font-semibold tabular-nums ${tone === "danger" && value > 0 ? "text-danger" : ""}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
}

export default async function IndicatorsPage() {
  const { ctx } = await requireTenant();
  const d = await getIndicators(ctx);
  const m = d.mine;
  const hasMine = Object.values(m).some((v) => v !== null);
  const maxMonth = Math.max(1, ...(d.evolution?.months.map((x) => x.cases) ?? [0]));
  const maxPer = Math.max(1, ...(d.perClient?.map((x) => x.cases) ?? [0]));
  return (
    <div className="mx-auto max-w-5xl space-y-4" data-testid="indicators-page">
      <PageHeader title="Indicadores" description="Números reais do escritório, calculados agora. Você só vê o que o seu perfil permite." actions={<Link href="/alertas" className="text-sm underline">Central de alertas</Link>} />

      {hasMine ? (
        <Card>
          <CardHeader title="Os seus números" description="Só o que está com você." />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="ind-mine">
              <Stat label="Tarefas em aberto" value={m.tasksOpen} href="/tarefas" />
              <Stat label="Tarefas atrasadas" value={m.tasksOverdue} href="/tarefas" tone="danger" />
              <Stat label="Prazos sob sua responsabilidade" value={m.deadlinesOpen} href="/prazos" />
              <Stat label="Prazos vencidos" value={m.deadlinesOverdue} href="/prazos" tone="danger" />
              <Stat label="Prazos nos próximos 7 dias" value={m.deadlinesNext7} href="/prazos" />
              <Stat label="Publicações distribuídas a você" value={m.notices} href="/caixa-de-entrada" />
              <Stat label="Processos ativos em que você atua" value={m.cases} href="/processos" />
            </div>
          </CardBody>
        </Card>
      ) : null}

      {d.overdue.length ? (
        <Card>
          <CardHeader title="Atrasados por tipo" description="O que já passou da data e continua em aberto, em todo o escritório." />
          <CardBody>
            <ul className="divide-y divide-border text-sm" data-testid="ind-overdue">
              {d.overdue.map((o) => (
                <li key={o.key} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`ind-overdue-${o.key}`}>
                  <span>{o.label}</span>
                  <span className="flex items-center gap-3">
                    <span className={`font-semibold tabular-nums ${o.count > 0 ? "text-danger" : ""}`}>{o.count}</span>
                    {o.amount !== undefined && o.count > 0 ? <span className="text-xs text-muted">saldo {formatMoneyBR(o.amount)}</span> : null}
                    <Link href={o.href} className="text-xs underline">Ver</Link>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {d.movement ? (
        <Card>
          <CardHeader title="Movimentação dos processos ativos" description={`De ${d.movement.total} processo(s) ativo(s), quantos tiveram andamento no período.`} />
          <CardBody className="space-y-2">
            <div data-testid="ind-movement" className="space-y-2">
              {d.movement.windows.map((w) => <Bar key={w.days} label={`Últimos ${w.days} dias`} value={w.withMovement} max={d.movement!.total} testId={`ind-mov-${w.days}`} />)}
            </div>
            <p className="text-xs text-muted">Sem movimento em 90 dias: <strong>{d.movement.windows.find((w) => w.days === 90)?.without ?? 0}</strong>. Os processos parados aparecem na aba “Processos” da <Link href="/alertas?aba=processos" className="underline">Central de alertas</Link>.</p>
          </CardBody>
        </Card>
      ) : null}

      {d.evolution ? (
        <Card>
          <CardHeader title="Evolução da carteira" description="Processos cadastrados por mês (últimos 12 meses) e o total acumulado." />
          <CardBody className="space-y-3">
            <div className="space-y-1.5" data-testid="ind-evolution">
              {d.evolution.months.map((x) => <Bar key={x.label} label={`${x.label} · total ${x.casesTotal}`} value={x.cases} max={maxMonth} />)}
            </div>
            {d.evolution.months.some((x) => x.clients !== null) ? <p className="text-xs text-muted">Clientes novos nos 12 meses: <strong>{d.evolution.months.reduce((a, x) => a + (x.clients ?? 0), 0)}</strong>.</p> : null}
            <div className="flex flex-wrap gap-3 text-xs text-muted" data-testid="ind-status">
              {d.evolution.byStatus.map((g) => <span key={g.status}>{STATUS_LABEL[g.status] ?? g.status}: <strong className="text-fg">{g.count}</strong></span>)}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {d.perClient ? (
        <Card>
          <CardHeader title="Processos ativos por cliente" description="Os 10 clientes com mais processos ativos." />
          <CardBody>
            {d.perClient.length === 0 ? <p className="text-sm text-muted">Nenhum processo ativo com cliente vinculado.</p> : (
              <div className="space-y-1.5" data-testid="ind-per-client">
                {d.perClient.map((c) => (
                  <Link key={c.id} href={`/clientes/${c.id}`} className="block hover:opacity-90"><Bar label={c.name} value={c.cases} max={maxPer} /></Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
