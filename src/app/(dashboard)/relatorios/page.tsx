import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { ReportBars, RankList } from "@/components/reports/report-charts";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ValidationError } from "@/lib/permissions/check";
import { formatMoneyBR } from "@/lib/validation/money";
import { cn } from "@/lib/utils";
import { casesReport, deadlinesReport, availableReports, financeReport, noticesReport, REPORT_TYPES, resolvePeriod, teamReport, type Period, type ReportType } from "@/server/services/report.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Relatórios e BI" };

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const ml = (m: string) => `${MONTH_LABELS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const STATUS_LABEL: Record<string, string> = { NEW: "Nova", DISTRIBUTED: "Distribuída", PROCESSED: "Tratada", DISCARDED: "Descartada", ACTIVE: "Ativo", SUSPENDED: "Suspenso", ARCHIVED: "Arquivado", CLOSED: "Encerrado" };
const KIND_LABEL: Record<string, string> = { INTIMACAO: "Intimação", CITACAO: "Citação", DESPACHO: "Despacho", DECISAO: "Decisão", SENTENCA: "Sentença", OUTRO: "Outro" };
const SOURCE_LABEL: Record<string, string> = { MANUAL: "Manual", PASTED: "Texto colado", FILE: "Arquivo", IMPORTED: "Importada (API/DJEN/MNI)" };

function Stat({ label, value, hint, tone, id }: { label: string; value: string; hint?: string; tone?: "danger" | "success"; id?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs text-muted">{label}</p>
        <p data-testid={id} className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "danger" && "text-danger", tone === "success" && "text-success")}>{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </CardBody>
    </Card>
  );
}

const num = (s: string) => Number(s);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ aba?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { ctx } = await requireTenant();
  const avail = availableReports(ctx);
  if (avail.length === 0) return <AccessDenied />;
  const tab: ReportType = avail.includes(sp.aba as ReportType) ? (sp.aba as ReportType) : avail[0]!;

  let period: Period | null = null;
  let periodError: string | null = null;
  try {
    period = resolvePeriod(ctx, sp.from, sp.to);
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    periodError = Object.values(e.fieldErrors ?? {})[0]?.[0] ?? e.message;
    period = resolvePeriod(ctx);
  }
  const qs = (aba: string) => `?aba=${aba}&from=${period!.from}&to=${period!.to}`;
  const exportHref = `/api/reports/export?tipo=${tab}&from=${period.from}&to=${period.to}`;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Relatórios e BI"
        description="Números calculados dos seus próprios dados, no fuso do escritório. Processos sigilosos só entram para quem tem acesso a eles."
        actions={
          <span className="inline-flex items-center gap-2">
            <a href={`${exportHref}&formato=xlsx`} className={cn(buttonVariants({ variant: "secondary" }), "gap-2")} data-testid="export-xlsx">
              <Download className="h-4 w-4" aria-hidden /> Exportar Excel
            </a>
            <a href={exportHref} className={cn(buttonVariants({ variant: "secondary" }), "gap-2")} data-testid="export-csv">
              <Download className="h-4 w-4" aria-hidden /> Exportar planilha (CSV)
            </a>
          </span>
        }
      />
      <nav aria-label="Relatórios" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {avail.map((t) => (
          <Link key={t} href={`/relatorios${qs(t)}`} aria-current={t === tab ? "page" : undefined} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors", t === tab ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg")}>
            {REPORT_TYPES[t].label}
          </Link>
        ))}
      </nav>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="aba" value={tab} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">De</span>
          <input type="date" name="from" defaultValue={period.from} className="rounded-md border border-border bg-surface px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Até</span>
          <input type="date" name="to" defaultValue={period.to} className="rounded-md border border-border bg-surface px-2 py-1.5" />
        </label>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Aplicar período</button>
        <span className="text-xs text-muted">Até 366 dias. {tab === "processos" ? "A carteira mostra a situação de hoje; o período vale para os cadastros novos." : tab === "equipe" ? "Tarefas abertas e atrasadas são a situação de hoje." : tab === "financeiro" ? "Os saldos em aberto e vencidos são a situação de hoje." : ""}</span>
      </form>
      {periodError ? <Alert tone="error">{periodError} Mostrando os últimos 90 dias.</Alert> : null}
      {tab === "prazos" ? <DeadlinesTab p={period} /> : null}
      {tab === "intimacoes" ? <NoticesTab p={period} /> : null}
      {tab === "processos" ? <CasesTab p={period} /> : null}
      {tab === "equipe" ? <TeamTab p={period} /> : null}
      {tab === "financeiro" ? <FinanceTab p={period} /> : null}
    </div>
  );
}

async function ctxOf() {
  return (await requireTenant()).ctx;
}

function Truncated({ on }: { on: boolean }) {
  return on ? <Alert tone="warning">Há mais registros do que o limite de leitura (50.000): este relatório está incompleto. Reduza o período.</Alert> : null;
}

async function DeadlinesTab({ p }: { p: Period }) {
  const { data: d, truncated } = await deadlinesReport(await ctxOf(), p);
  return (
    <div className="space-y-4">
      <Truncated on={truncated} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat id="r-total" label="Prazos com vencimento no período" value={String(d.total)} hint={d.canceled ? `${d.canceled} cancelado(s) fora da conta` : undefined} />
        <Stat id="r-rate" label="Taxa de cumprimento" value={d.complianceRate === null ? "—" : `${d.complianceRate}%`} hint="no prazo ÷ (cumpridos + vencidos sem cumprir)" tone={d.complianceRate !== null && d.complianceRate < 90 ? "danger" : "success"} />
        <Stat id="r-late" label="Cumpridos fora do prazo" value={String(d.late)} />
        <Stat id="r-overdue" label="Vencidos sem cumprimento" value={String(d.openOverdue)} tone={d.openOverdue > 0 ? "danger" : undefined} hint={d.draft ? `${d.draft} ainda em rascunho (não validados)` : undefined} />
      </div>
      <Card>
        <CardHeader title="Prazos por mês de vencimento" />
        <CardBody>
          <ReportBars title="Mês" data={d.byMonth.map((m) => ({ label: ml(m.month), total: m.total, onTime: m.onTime, missed: m.missed }))} series={[{ key: "onTime", label: "Cumpridos no prazo", color: "primary" }, { key: "missed", label: "Fora do prazo ou vencidos", color: "danger" }]} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Por responsável" />
        <CardBody>
          {d.byResponsible.length === 0 ? <p className="text-sm text-muted">Sem prazos no período.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium">Responsável</th><th className="text-right font-medium">Total</th><th className="text-right font-medium">No prazo</th><th className="text-right font-medium">Fora do prazo</th><th className="text-right font-medium">Vencidos</th></tr></thead>
              <tbody>{d.byResponsible.map((r) => <tr key={r.name} className="border-t border-border"><td className="py-1.5">{r.name}</td><td className="text-right tabular-nums">{r.total}</td><td className="text-right tabular-nums">{r.onTime}</td><td className="text-right tabular-nums">{r.late}</td><td className="text-right tabular-nums">{r.openOverdue}</td></tr>)}</tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

async function NoticesTab({ p }: { p: Period }) {
  const { data: d, truncated } = await noticesReport(await ctxOf(), p);
  return (
    <div className="space-y-4">
      <Truncated on={truncated} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat id="r-total" label="Intimações recebidas" value={String(d.total)} />
        <Stat id="r-processed" label="Tratadas" value={String(d.processed)} hint={d.total ? `${Math.round((d.processed / d.total) * 100)}% do total` : undefined} />
        <Stat id="r-avg" label="Tempo médio até tratar" value={d.avgHoursToProcess === null ? "—" : `${d.avgHoursToProcess} h`} hint={d.medianHoursToProcess === null ? undefined : `mediana ${d.medianHoursToProcess} h`} />
        <Stat id="r-stale" label="Novas há mais de 3 dias" value={String(d.stale)} tone={d.stale > 0 ? "danger" : undefined} hint="ainda sem distribuir" />
      </div>
      <Card>
        <CardHeader title="Recebidas e tratadas por mês" />
        <CardBody>
          <ReportBars title="Mês" data={d.byMonth.map((m) => ({ label: ml(m.month), received: m.received, processed: m.processed }))} series={[{ key: "received", label: "Recebidas", color: "primary" }, { key: "processed", label: "Tratadas", color: "accent" }]} />
        </CardBody>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader title="Por situação" /><CardBody><RankList items={Object.entries(d.byStatus).map(([k, v]) => ({ label: STATUS_LABEL[k] ?? k, value: v }))} /></CardBody></Card>
        <Card><CardHeader title="Por tipo" /><CardBody><RankList items={d.byKind.map((k) => ({ label: KIND_LABEL[k.kind] ?? k.kind, value: k.count }))} /></CardBody></Card>
        <Card><CardHeader title="Por origem" /><CardBody><RankList items={d.bySource.map((k) => ({ label: SOURCE_LABEL[k.source] ?? k.source, value: k.count }))} /></CardBody></Card>
      </div>
    </div>
  );
}

async function CasesTab({ p }: { p: Period }) {
  const { data: d, truncated } = await casesReport(await ctxOf(), p);
  return (
    <div className="space-y-4">
      <Truncated on={truncated} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat id="r-total" label="Processos na carteira (visíveis a você)" value={String(d.visibleTotal)} />
        <Stat id="r-active" label="Ativos" value={String(d.byStatus.ACTIVE ?? 0)} />
        <Stat id="r-closed" label="Encerrados ou arquivados" value={String((d.byStatus.CLOSED ?? 0) + (d.byStatus.ARCHIVED ?? 0))} />
        <Stat id="r-new" label="Cadastrados no período" value={String(d.createdInPeriod)} />
      </div>
      <Card>
        <CardHeader title="Processos cadastrados por mês" />
        <CardBody><ReportBars title="Mês" data={d.byMonthCreated.map((m) => ({ label: ml(m.month), count: m.count }))} series={[{ key: "count", label: "Cadastrados", color: "primary" }]} /></CardBody>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader title="Por área" /><CardBody><RankList items={d.byArea.map((a) => ({ label: a.label, value: a.count }))} /></CardBody></Card>
        <Card><CardHeader title="Por órgão (10 maiores)" /><CardBody><RankList items={d.byCourt.map((a) => ({ label: a.label, value: a.count }))} /></CardBody></Card>
      </div>
    </div>
  );
}

async function TeamTab({ p }: { p: Period }) {
  const { data: d, truncated } = await teamReport(await ctxOf(), p);
  return (
    <div className="space-y-4">
      <Truncated on={truncated} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat id="r-done" label="Tarefas concluídas" value={String(d.totals.tasksDone)} />
        <Stat id="r-dl" label="Prazos cumpridos" value={String(d.totals.deadlinesFulfilled)} />
        <Stat id="r-hours" label="Horas registradas" value={`${d.totals.hours} h`} />
      </div>
      <Card>
        <CardHeader title="Por membro" />
        <CardBody>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium">Membro</th><th className="text-right font-medium">Tarefas concluídas</th><th className="text-right font-medium">Abertas hoje</th><th className="text-right font-medium">Atrasadas hoje</th><th className="text-right font-medium">Horas</th><th className="text-right font-medium">Prazos cumpridos</th></tr></thead>
            <tbody>{d.members.map((m) => <tr key={m.name} className="border-t border-border"><td className="py-1.5">{m.name}</td><td className="text-right tabular-nums">{m.tasksDone}</td><td className="text-right tabular-nums">{m.tasksOpen}</td><td className={cn("text-right tabular-nums", m.tasksOverdue > 0 && "text-danger")}>{m.tasksOverdue}</td><td className="text-right tabular-nums">{m.hours}</td><td className="text-right tabular-nums">{m.deadlinesFulfilled}</td></tr>)}</tbody>
          </table>
          <p className="mt-3 text-xs text-muted">Números de produção são indicadores de apoio à gestão; não medem a qualidade nem a complexidade do trabalho.</p>
        </CardBody>
      </Card>
    </div>
  );
}

async function FinanceTab({ p }: { p: Period }) {
  const { data: d, truncated } = await financeReport(await ctxOf(), p);
  return (
    <div className="space-y-4">
      <Truncated on={truncated} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat id="r-received" label="Recebido no período" value={formatMoneyBR(d.received)} tone="success" />
        <Stat id="r-paid" label="Pago no período" value={formatMoneyBR(d.paid)} />
        <Stat id="r-net" label="Resultado (recebido − pago)" value={formatMoneyBR(d.net)} tone={num(d.net) < 0 ? "danger" : "success"} />
        <Stat id="r-overdue" label="A receber vencido (hoje)" value={formatMoneyBR(d.receivableOverdue)} tone={num(d.receivableOverdue) > 0 ? "danger" : undefined} hint={`em aberto no total: ${formatMoneyBR(d.receivableOpen)}`} />
      </div>
      <Card>
        <CardHeader title="Recebido e pago por mês" />
        <CardBody>
          <ReportBars title="Mês" data={d.byMonth.map((m) => ({ label: ml(m.month), received: num(m.received), paid: num(m.paid) }))} series={[{ key: "received", label: "Recebido", color: "primary" }, { key: "paid", label: "Pago", color: "accent" }]} unit="money" />
        </CardBody>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader title="Receitas por categoria" /><CardBody><RankList items={d.incomeByCategory.map((c) => ({ label: c.label, value: num(c.amount) }))} unit="money" /></CardBody></Card>
        <Card><CardHeader title="Despesas por categoria" /><CardBody><RankList items={d.expenseByCategory.map((c) => ({ label: c.label, value: num(c.amount) }))} unit="money" /></CardBody></Card>
        <Card><CardHeader title="Clientes que mais pagaram" /><CardBody><RankList items={d.topClients.map((c) => ({ label: c.label, value: num(c.amount) }))} unit="money" /></CardBody></Card>
        <Card><CardHeader title="Inadimplência: a receber vencido por faixa de atraso" /><CardBody><RankList items={d.aging.map((c) => ({ label: c.label, value: num(c.amount) }))} unit="money" empty="Nada vencido." /></CardBody></Card>
      </div>
      <p className="text-xs text-muted">Lançamentos de processos sigilosos aos quais você não tem acesso ficam fora destes números.</p>
    </div>
  );
}
