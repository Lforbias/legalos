import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ValidationError } from "@/lib/permissions/check";
import { addDays, todayYmd } from "@/lib/dates/ymd";
import { ymdRange } from "@/lib/dates/range";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { chatReport, chatReportExtra, getReportSchedule } from "@/server/services/chat-report.service";
import { ReportSchedulePanel } from "@/modules/whatsapp/tools-ui";
import { npsReport } from "@/server/services/chat-extras.service";
import { listNumbers } from "@/server/services/whatsapp-numbers.service";

export const metadata: Metadata = { title: "Relatórios do Chat" };
export const dynamic = "force-dynamic";

const min = (m: number | null) => (m === null ? "—" : m < 60 ? `${m} min` : `${(m / 60).toFixed(1).replace(".", ",")} h`);

export default async function ChatReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "whatsapp:manage")) return <AccessDenied />;
  const sp = await searchParams;
  const today = todayYmd(ctx.timezone);
  const to = sp.to || today;
  const from = sp.from || addDays(to, -29);
  const range = ymdRange(from, to);
  let rep: Awaited<ReturnType<typeof chatReport>> | null = null;
  let nps: Awaited<ReturnType<typeof npsReport>> | null = null;
  let extra: Awaited<ReturnType<typeof chatReportExtra>> | null = null;
  let err: string | null = null;
  if (!range) err = "Datas inválidas.";
  else {
    try {
      [rep, nps, extra] = await Promise.all([chatReport(ctx, range), npsReport(ctx, range), chatReportExtra(ctx, range)]);
    } catch (e) {
      if (e instanceof ValidationError) err = e.message;
      else throw e;
    }
  }
  const numbers = await listNumbers(ctx);
  const schedule = await getReportSchedule(ctx);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4" data-testid="chat-reports">
      <PageHeader title="Relatórios do Chat" description="Números reais das conversas e mensagens do período." actions={<Link className="text-sm underline" href="/atendimento">Voltar às conversas</Link>} />
      <form className="flex flex-wrap items-end gap-2 text-sm" action="/atendimento/relatorios">
        <label className="space-y-1"><span className="block text-xs text-muted">De</span><input type="date" name="from" defaultValue={from} className="h-9 rounded-md border border-border bg-surface px-2" /></label>
        <label className="space-y-1"><span className="block text-xs text-muted">Até</span><input type="date" name="to" defaultValue={to} className="h-9 rounded-md border border-border bg-surface px-2" /></label>
        <button className="h-9 rounded-md bg-primary px-3 text-primary-fg">Atualizar</button>
        <a className="h-9 rounded-md border border-border px-3 leading-9 underline" href={`/api/chat/export?from=${from}&to=${to}`}>Exportar tudo (CSV)</a>
      </form>
      {err ? <Alert tone="error">{err}</Alert> : null}
      {rep ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Conversas", rep.totals.conversations], ["Mensagens recebidas", rep.totals.messagesIn], ["Mensagens enviadas", rep.totals.messagesOut], ["Sem resposta humana", rep.totals.unanswered]].map(([k, v]) => (
              <Card key={String(k)}><CardBody><div className="text-xs text-muted">{k}</div><div className="text-2xl font-semibold">{v}</div></CardBody></Card>
            ))}
          </div>
          <Card>
            <CardHeader title="Tempo até a primeira resposta" description="Só conta resposta de uma pessoa (não conta robô nem mensagem automática)." />
            <CardBody className="text-sm">Média {min(rep.firstResponse.avgMinutes)} · Mediana {min(rep.firstResponse.medianMinutes)} · {rep.firstResponse.count} conversa(s) respondida(s)</CardBody>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Por número" />
              <CardBody>
                {rep.byNumber.length === 0 ? <p className="text-sm text-muted">Sem movimento no período.</p> : (
                  <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th>Número</th><th>Conversas</th><th>Recebidas</th><th>Enviadas</th></tr></thead>
                    <tbody>{rep.byNumber.map((n) => <tr key={n.accountId}><td>{n.label}</td><td>{n.conversations}</td><td>{n.messagesIn}</td><td>{n.messagesOut}</td></tr>)}</tbody></table>
                )}
                {numbers.length > 1 ? <p className="mt-2 text-xs text-muted">Para exportar só um número, acrescente <code>&amp;num=ID</code> ao link de exportação.</p> : null}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Por atendente" description="Mensagens enviadas por pessoas nas conversas sob sua responsabilidade." />
              <CardBody>
                {rep.byAgent.length === 0 ? <p className="text-sm text-muted">Sem movimento no período.</p> : (
                  <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th>Atendente</th><th>Conversas</th><th>Enviadas</th></tr></thead>
                    <tbody>{rep.byAgent.map((a) => <tr key={a.userId ?? "none"}><td>{a.name}</td><td>{a.conversations}</td><td>{a.messagesOut}</td></tr>)}</tbody></table>
                )}
              </CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader title="Por dia" />
            <CardBody>
              {rep.byDay.length === 0 ? <p className="text-sm text-muted">Sem mensagens no período.</p> : (
                <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th>Dia (UTC)</th><th>Recebidas</th><th>Enviadas</th></tr></thead>
                  <tbody>{rep.byDay.map((d) => <tr key={d.day}><td>{d.day.split("-").reverse().join("/")}</td><td>{d.in}</td><td>{d.out}</td></tr>)}</tbody></table>
              )}
            </CardBody>
          </Card>
        </>
      ) : null}
      {extra ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Mensagens por status do chat" description="Etapa em que cada conversa do período está agora." />
              <CardBody>
                {extra.byStatus.length === 0 ? <p className="text-sm text-muted">Sem movimento no período.</p> : (
                  <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th>Status</th><th>Conversas</th><th>Mensagens</th></tr></thead>
                    <tbody>{extra.byStatus.map((x) => <tr key={x.statusId ?? "none"}><td>{x.name}</td><td>{x.conversations}</td><td>{x.messages}</td></tr>)}</tbody></table>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Chats adicionados" description="Conversas novas no período, por número." />
              <CardBody>
                <p className="mb-2 text-sm">Total: {extra.added.reduce((s, d) => s + d.count, 0)}</p>
                <table className="w-full text-sm"><tbody>{extra.addedByNumber.map((n) => <tr key={n.accountId}><td>{n.label}</td><td>{n.count}</td></tr>)}</tbody></table>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Tempo de resposta por usuário" description="Média até a primeira resposta humana, por quem respondeu." />
              <CardBody>
                {extra.responseByUser.length === 0 ? <p className="text-sm text-muted">Sem respostas no período.</p> : (
                  <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th>Usuário</th><th>Respostas</th><th>1ª resposta (média)</th></tr></thead>
                    <tbody>{extra.responseByUser.map((u) => <tr key={u.userId}><td>{u.name}</td><td>{u.replies}</td><td>{min(u.avgFirstResponseMinutes)}</td></tr>)}</tbody></table>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Acessos da equipe" description="Entradas no sistema no período." />
              <CardBody>
                {extra.logins.length === 0 ? <p className="text-sm text-muted">Nenhum acesso registrado.</p> : (
                  <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th>Usuário</th><th>Acessos</th><th>Último</th></tr></thead>
                    <tbody>{extra.logins.map((u) => <tr key={u.userId}><td>{u.name}</td><td>{u.logins}</td><td>{u.lastLoginAt ? u.lastLoginAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: ctx.timezone }) : "—"}</td></tr>)}</tbody></table>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}
      <Card>
        <CardHeader title="Resumo por e-mail" description="Receba os números do período anterior automaticamente." />
        <CardBody><ReportSchedulePanel s={{ enabled: schedule.enabled, frequency: schedule.frequency, recipients: schedule.recipients, lastSentAt: schedule.lastSentAt?.toISOString() ?? null }} /></CardBody>
      </Card>
      {nps ? (
        <Card>
          <CardHeader title="Satisfação (NPS)" />
          <CardBody className="text-sm">
            {nps.asked === 0 ? "Nenhuma pesquisa enviada no período." : `${nps.asked} enviada(s) · ${nps.answered} respondida(s) (${nps.responseRate}%) · Promotores ${nps.promoters} · Neutros ${nps.passives} · Detratores ${nps.detractors} · NPS ${nps.nps ?? "—"}`}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
