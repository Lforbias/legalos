import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { AnnouncementForm } from "@/modules/platform/announcement-form";
import { RetryButton, RunJobButton, SwitchOffButton, TestButton } from "@/modules/platform/developer-controls";
import { PHASES_2, PHASES_3, PHASES_4, PHASES_5, PHASES_6, RELEASES, TEAM_TODO, type Phase } from "@/lib/updates";
import { requirePlatform } from "@/server/platform";
import { listAnnouncements } from "@/server/services/announcement.service";
import { listOrganizations } from "@/server/services/platform.service";
import { INTEGRATION_TESTS, SWITCH_LABELS, apiOverview, errorsOverview, jobsOverview, recentJobRuns, switchesOverview, systemOverview, type JobState, type SwitchKeyP } from "@/server/services/developer.service";

export const metadata: Metadata = { title: "Administração — developer" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "saude", label: "Saúde e rotinas" },
  { key: "api", label: "API, chaves e webhooks" },
  { key: "erros", label: "Auditoria e erros" },
  { key: "testes", label: "Integrações e interruptores" },
  { key: "comunicados", label: "Comunicados" },
  { key: "novidades", label: "Novidades e andamento" },
] as const;

const STATE: Record<JobState, { tone: "success" | "danger" | "warning" | "neutral" | "info"; label: string }> = {
  ok: { tone: "success", label: "em dia" },
  error: { tone: "danger", label: "falhou" },
  stale: { tone: "warning", label: "atrasada" },
  never: { tone: "neutral", label: "nunca rodou" },
  running: { tone: "info", label: "rodando" },
};

const Th = ({ children }: { children: React.ReactNode }) => <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted">{children}</th>;
const when = (d: Date | null) => (d ? formatDateTime(d) : "—");

export default async function DeveloperPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { pc } = await requirePlatform();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.aba)?.key ?? "saude";
  return (
    <div className="space-y-6">
      <PageHeader title="Painel do developer" description="Visão técnica da plataforma, só para o dono. Mostra estados, contagens e mensagens técnicas curtas — nunca conteúdo dos escritórios, chaves ou segredos." />
      <nav aria-label="Seções do painel" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/developer?aba=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={`border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}>{t.label}</Link>
        ))}
      </nav>
      {tab === "saude" ? <Saude pc={pc} /> : null}
      {tab === "api" ? <Api pc={pc} /> : null}
      {tab === "erros" ? <Erros pc={pc} /> : null}
      {tab === "testes" ? <Testes pc={pc} /> : null}
      {tab === "comunicados" ? <Comunicados pc={pc} /> : null}
      {tab === "novidades" ? <Novidades /> : null}
    </div>
  );
}

type PC = Awaited<ReturnType<typeof requirePlatform>>["pc"];

const AUD = { ALL: "Todos", ORG: "Um escritório", USER: "Uma pessoa" } as const;
const KIND = { INFO: "Novidade", MAINTENANCE: "Manutenção", ALERT: "Alerta" } as const;

async function Comunicados({ pc }: { pc: PC }) {
  const [orgs, hist] = await Promise.all([listOrganizations(pc, {}), listAnnouncements(pc, 20)]);
  return (
    <>
      <Card>
        <CardHeader title="Novo comunicado" description="Novidade, manutenção ou alerta, no sino do sistema e/ou no celular. Você confere quantas pessoas recebem antes de enviar." />
        <CardBody><AnnouncementForm orgs={orgs.items.map((o) => ({ id: o.id, name: o.name }))} /></CardBody>
      </Card>
      <Card>
        <CardHeader title="Enviados" description="Máximo de 5 por hora. Quem desligou os comunicados no celular não recebe push; o sino continua." />
        <CardBody>
          {hist.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="ann-history">
                <thead><tr><Th>Quando</Th><Th>Tipo</Th><Th>Título</Th><Th>Público</Th><Th>Pessoas</Th><Th>Sistema</Th><Th>Celular</Th></tr></thead>
                <tbody>
                  {hist.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">{when(a.createdAt)}</td>
                      <td className="px-3 py-2">{KIND[a.kind as keyof typeof KIND] ?? a.kind}</td>
                      <td className="px-3 py-2">{a.title}</td>
                      <td className="px-3 py-2">{a.audience === "ORG" ? a.organization?.name ?? "Escritório" : AUD[a.audience as keyof typeof AUD] ?? a.audience}</td>
                      <td className="px-3 py-2">{a.recipients}</td>
                      <td className="px-3 py-2">{a.viaInApp ? a.inAppCount : "—"}</td>
                      <td className="px-3 py-2">{a.viaPush ? `${a.pushSent}${a.pushFailed ? ` (${a.pushFailed} falha)` : ""}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted">Nenhum comunicado enviado ainda.</p>}
        </CardBody>
      </Card>
    </>
  );
}

async function Saude({ pc }: { pc: PC }) {
  const [sys, jobs, runs] = await Promise.all([systemOverview(pc), jobsOverview(pc), recentJobRuns(pc, undefined, 25)]);
  return (
    <>
      <Card>
        <CardHeader title="Sistema" description="Estado do servidor e das configurações (só “configurado ou ausente”, nunca o valor)." />
        <CardBody className="space-y-3 text-sm">
          <p className="flex flex-wrap gap-x-6 gap-y-1">
            <span>Banco: {sys.database ? <Badge tone="success">responde</Badge> : <Badge tone="danger">fora do ar</Badge>}</span>
            <span>Migrações: {sys.migrations ? <Badge tone="success">aplicadas</Badge> : <Badge tone="danger">pendentes</Badge>}</span>
            <span>Agendador: {jobs.cronConfigured ? <Badge tone="success">CRON_SECRET definido</Badge> : <Badge tone="danger">CRON_SECRET ausente — rotinas paradas</Badge>}</span>
          </p>
          <p className="text-muted">Node {sys.runtime.node} · ambiente {sys.runtime.env} · no ar há {sys.runtime.uptimeMin} min · memória {sys.runtime.rssMb} MB · {sys.orgs} escritório(s) · fila de e-mails: {sys.queueMail} · fila de webhooks: {sys.queueHooks}</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {sys.flags.map((f) => <li key={f.name}>{f.configured ? <Badge tone="success">configurado</Badge> : <Badge tone="warning">ausente</Badge>} <span className="ml-1">{f.name}</span></li>)}
          </ul>
        </CardBody>
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Rotinas automáticas" description="O que o agendador do servidor executa. “Atrasada” = passou de 3× o intervalo esperado sem rodar." />
        <table className="w-full text-sm">
          <caption className="sr-only">Rotinas automáticas</caption>
          <thead><tr className="border-b border-border"><Th>Rotina</Th><Th>Situação</Th><Th>Última execução</Th><Th>Duração</Th><Th>24 h (erros/total)</Th><Th>Último resultado</Th><Th>Ação</Th></tr></thead>
          <tbody>
            {jobs.jobs.map((j) => (
              <tr key={j.key} className="border-b border-border align-top last:border-0">
                <td className="px-3 py-2"><div className="font-medium">{j.label}</div><div className="text-xs text-muted">a cada {j.everyMin} min</div></td>
                <td className="px-3 py-2"><Badge tone={STATE[j.state].tone}>{STATE[j.state].label}</Badge></td>
                <td className="px-3 py-2 text-muted">{when(j.lastStartedAt)}</td>
                <td className="px-3 py-2 text-muted">{j.lastDurationMs != null ? `${j.lastDurationMs} ms` : "—"}</td>
                <td className="px-3 py-2">{j.errors24}/{j.runs24}</td>
                <td className="px-3 py-2 text-xs text-muted">{j.lastError ?? (j.lastSummary ? Object.entries(j.lastSummary).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : "—")}</td>
                <td className="px-3 py-2">{j.manual ? <RunJobButton job={j.key} /> : <span className="text-xs text-muted">só pelo agendador</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-2 text-xs text-muted">Cobrança (assinaturas e lembretes no WhatsApp) não tem botão de disparo: segue só o agendador e as chaves do escritório.</p>
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Últimas execuções" />
        {runs.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhuma execução registrada ainda.</p> : (
          <table className="w-full text-sm">
            <caption className="sr-only">Histórico de execuções</caption>
            <thead><tr className="border-b border-border"><Th>Quando</Th><Th>Rotina</Th><Th>Origem</Th><Th>Resultado</Th><Th>Duração</Th><Th>Detalhe</Th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-muted">{formatDateTime(r.startedAt)}</td>
                  <td className="px-3 py-2">{r.job}</td>
                  <td className="px-3 py-2">{r.trigger === "MANUAL" ? "manual" : "agendador"}</td>
                  <td className="px-3 py-2">{r.status === "OK" ? <Badge tone="success">ok</Badge> : r.status === "ERROR" ? <Badge tone="danger">erro</Badge> : <Badge tone="info">rodando</Badge>}</td>
                  <td className="px-3 py-2 text-muted">{r.durationMs != null ? `${r.durationMs} ms` : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted">{r.error ?? (r.summary ? Object.entries(r.summary as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

async function Api({ pc }: { pc: PC }) {
  const a = await apiOverview(pc);
  return (
    <>
      <Card>
        <CardHeader title="Chaves de API" description="Contagens em todos os escritórios. Nenhuma chave (nem prefixo) é exibida." />
        <CardBody className="space-y-3 text-sm">
          <p className="flex flex-wrap gap-6"><span>Ativas: <strong>{a.keys.active}</strong></span><span>Revogadas: <strong>{a.keys.revoked}</strong></span><span>Vencidas: <strong>{a.keys.expired}</strong></span><span>Ativas sem uso há 30 dias: <strong>{a.keys.unused30}</strong></span></p>
          {a.keys.byOrg.length ? (
            <ul className="grid gap-1 sm:grid-cols-2">{a.keys.byOrg.map((o, i) => <li key={i}>{o.organization}: <strong>{o.active}</strong> ativa(s) · último uso {when(o.lastUsedAt)}</li>)}</ul>
          ) : <p className="text-muted">Nenhum escritório com chave ativa.</p>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Webhooks" description="Endereços de saída dos escritórios e a fila de entregas." />
        <CardBody className="space-y-3 text-sm">
          <p className="flex flex-wrap gap-6"><span>Endereços: <strong>{a.webhooks.endpoints}</strong> ({a.webhooks.disabled} desligado(s))</span><span>Entregues (7 d): <strong>{a.webhooks.delivered7}</strong></span><span>Falhas (7 d): <strong>{a.webhooks.failed7}</strong></span><span>Na fila: <strong>{a.webhooks.pending}</strong>{a.webhooks.overdue ? <> · <Badge tone="warning">{a.webhooks.overdue} atrasada(s)</Badge></> : null}</span></p>
          {a.webhooks.problems.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">Webhooks com problema</caption>
                <thead><tr className="border-b border-border"><Th>Escritório</Th><Th>Nome</Th><Th>Servidor</Th><Th>Situação</Th><Th>Falhas seguidas</Th><Th>Último sucesso</Th></tr></thead>
                <tbody>{a.webhooks.problems.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{p.organization}</td><td className="px-3 py-2">{p.name}</td><td className="px-3 py-2 text-muted">{p.host}</td>
                    <td className="px-3 py-2">{p.enabled ? <Badge tone="warning">instável</Badge> : <Badge tone="danger">desligado</Badge>} {p.disabledReason ? <span className="text-xs text-muted">{p.disabledReason}</span> : null}</td>
                    <td className="px-3 py-2">{p.failures}</td><td className="px-3 py-2 text-muted">{when(p.lastSuccessAt)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          ) : <p className="text-muted">Nenhum webhook com problema.</p>}
        </CardBody>
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Entregas que falharam" description="Reenviar recoloca na fila (só se o webhook do escritório estiver ligado)." />
        {a.webhooks.failedDeliveries.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhuma entrega com falha.</p> : (
          <table className="w-full text-sm">
            <caption className="sr-only">Entregas com falha</caption>
            <thead><tr className="border-b border-border"><Th>Quando</Th><Th>Escritório</Th><Th>Evento</Th><Th>Tentativas</Th><Th>Resposta</Th><Th>Ação</Th></tr></thead>
            <tbody>{a.webhooks.failedDeliveries.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted">{formatDateTime(f.createdAt)}</td><td className="px-3 py-2">{f.organization}</td><td className="px-3 py-2">{f.eventType}</td><td className="px-3 py-2">{f.attempts}</td>
                <td className="px-3 py-2 text-xs text-muted">{f.statusCode ? `HTTP ${f.statusCode} ` : ""}{f.error ?? ""}</td>
                <td className="px-3 py-2">{f.retryable ? <RetryButton id={f.id} kind="delivery" /> : <span className="text-xs text-muted">webhook desligado</span>}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Fila de e-mails" description="Só situação e tipo. Destinatário, assunto e texto não aparecem aqui." />
        <CardBody className="text-sm"><p className="flex flex-wrap gap-6">{Object.entries(a.mail.byStatus).length ? Object.entries(a.mail.byStatus).map(([s, n]) => <span key={s}>{s}: <strong>{n}</strong></span>) : <span className="text-muted">Fila vazia.</span>}</p></CardBody>
        {a.mail.failed.length ? (
          <table className="w-full text-sm">
            <caption className="sr-only">E-mails com falha</caption>
            <thead><tr className="border-b border-border"><Th>Quando</Th><Th>Tipo</Th><Th>Tentativas</Th><Th>Erro</Th><Th>Ação</Th></tr></thead>
            <tbody>{a.mail.failed.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0"><td className="px-3 py-2 text-muted">{formatDateTime(m.createdAt)}</td><td className="px-3 py-2">{m.kind}</td><td className="px-3 py-2">{m.attempts}</td><td className="px-3 py-2 text-xs text-muted">{m.error ?? ""}</td><td className="px-3 py-2"><RetryButton id={m.id} kind="mail" /></td></tr>))}</tbody>
          </table>
        ) : null}
      </Card>
    </>
  );
}

async function Erros({ pc }: { pc: PC }) {
  const e = await errorsOverview(pc);
  return (
    <>
      <Card>
        <CardHeader title="Erros inesperados" description="Falhas que o sistema não soube tratar (ações e rotinas). A mensagem é mascarada; não há pilha nem dados do escritório. O código de referência (ref.) é o mesmo que o usuário vê na tela." />
        <CardBody className="space-y-4 text-sm">
          <p className="flex gap-6"><span>Últimas 24 h: <strong>{e.total24}</strong></span><span>Últimos 7 dias: <strong>{e.total7}</strong></span></p>
          {e.groups.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">Erros mais frequentes</caption>
                <thead><tr className="border-b border-border"><Th>Vezes</Th><Th>Origem</Th><Th>Mensagem</Th><Th>Última</Th></tr></thead>
                <tbody>{e.groups.map((g, i) => <tr key={i} className="border-b border-border last:border-0"><td className="px-3 py-2 font-medium">{g.count}</td><td className="px-3 py-2">{g.source}</td><td className="px-3 py-2 text-xs">{g.message}</td><td className="px-3 py-2 text-muted">{when(g.lastAt)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="text-muted">Nenhum erro nos últimos 7 dias.</p>}
        </CardBody>
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Erros recentes" />
        {e.recent.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nada registrado.</p> : (
          <table className="w-full text-sm">
            <caption className="sr-only">Erros recentes</caption>
            <thead><tr className="border-b border-border"><Th>Quando</Th><Th>Origem</Th><Th>Ref.</Th><Th>Mensagem</Th></tr></thead>
            <tbody>{e.recent.map((r) => <tr key={r.id} className="border-b border-border last:border-0"><td className="px-3 py-2 text-muted">{formatDateTime(r.createdAt)}</td><td className="px-3 py-2">{r.source}</td><td className="px-3 py-2 font-mono text-xs">{r.correlationId ? r.correlationId.slice(0, 8) : "—"}</td><td className="px-3 py-2 text-xs">{r.message}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Acessos negados e falhas" description="Eventos de auditoria com resultado negado ou falho, de todos os escritórios." action={<Link href="/admin/auditoria" className="text-sm underline">Abrir a auditoria completa</Link>} />
        <AuditTable rows={e.flagged} empty="Nenhum evento negado ou com falha." />
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Ações do administrador da plataforma" description="O que foi feito neste painel e na administração." />
        <AuditTable rows={e.platformActions} empty="Nenhuma ação registrada." />
      </Card>
    </>
  );
}

function AuditTable({ rows, empty }: { rows: Awaited<ReturnType<typeof errorsOverview>>["flagged"]; empty: string }) {
  if (!rows.length) return <p className="p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Eventos de auditoria</caption>
      <thead><tr className="border-b border-border"><Th>Quando</Th><Th>Ação</Th><Th>Resultado</Th><Th>Escritório</Th><Th>Usuário</Th><Th>IP</Th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id} className="border-b border-border last:border-0">
          <td className="px-3 py-2 text-muted">{formatDateTime(r.createdAt)}</td><td className="px-3 py-2">{r.action}</td>
          <td className="px-3 py-2">{r.result === "SUCCESS" ? <Badge tone="success">sucesso</Badge> : r.result === "DENIED" ? <Badge tone="warning">negado</Badge> : <Badge tone="danger">falha</Badge>}</td>
          <td className="px-3 py-2">{r.organizationName ?? "—"}</td><td className="px-3 py-2 text-muted">{r.userEmail ?? "—"}</td><td className="px-3 py-2 text-muted">{r.ipAddress ?? "—"}</td>
        </tr>))}</tbody>
    </table>
  );
}

async function Testes({ pc }: { pc: PC }) {
  const sw = await switchesOverview(pc);
  const keys = Object.keys(SWITCH_LABELS) as SwitchKeyP[];
  return (
    <>
      <Card>
        <CardHeader title="Testar integrações" description="Cada teste faz uma chamada mínima e devolve só “ok ou falhou”, o tempo e uma mensagem curta. O teste de e-mail só conecta ao servidor: nenhuma mensagem é enviada. Todo teste é auditado." />
        <CardBody>{(Object.keys(INTEGRATION_TESTS) as (keyof typeof INTEGRATION_TESTS)[]).map((k) => <TestButton key={k} k={k} label={INTEGRATION_TESTS[k]} />)}</CardBody>
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Interruptores por escritório" description="Visão do que está ligado em cada escritório. Aqui o dono só pode DESLIGAR (parada de emergência, auditada); religar é decisão do escritório. Cobrança no WhatsApp continua desligada até a Dra. Talita autorizar." />
        {sw.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhum escritório.</p> : (
          <table className="w-full text-sm">
            <caption className="sr-only">Interruptores por escritório</caption>
            <thead><tr className="border-b border-border"><Th>Escritório</Th>{keys.map((k) => <Th key={k}>{SWITCH_LABELS[k]}</Th>)}</tr></thead>
            <tbody>{sw.map((o) => (
              <tr key={o.id} className="border-b border-border align-top last:border-0">
                <td className="px-3 py-2 font-medium">{o.name} {o.suspended ? <Badge tone="danger">suspenso</Badge> : null}</td>
                {keys.map((k) => (
                  <td key={k} className="px-3 py-2">
                    {o.on[k] ? <div className="space-y-1"><Badge tone="success">ligado{k === "djen" || k === "mni" ? ` (${o.counts[k]})` : ""}</Badge><div><SwitchOffButton orgId={o.id} k={k} orgName={o.name} label={SWITCH_LABELS[k]} /></div></div> : <Badge tone="neutral">desligado</Badge>}
                  </td>
                ))}
              </tr>))}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}

const PHASE_BADGE: Record<Phase["status"], "success" | "info" | "neutral"> = { feita: "success", "em andamento": "info", "a fazer": "neutral" };

function PhaseList({ phases }: { phases: Phase[] }) {
  const done = phases.filter((p) => p.status === "feita").length;
  return (
    <>
      <p className="px-4 pb-2 text-sm text-muted">{done} de {phases.length} fases concluídas</p>
      <ul className="divide-y divide-border">
        {phases.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <span className="w-20 font-mono text-xs text-muted">{p.id}</span>
            <span className="min-w-0 flex-1">{p.title}</span>
            <Badge tone={PHASE_BADGE[p.status]}>{p.status}</Badge>
          </li>
        ))}
      </ul>
    </>
  );
}

function Novidades() {
  return (
    <>
      <Card>
        <CardHeader title="Já feito (mais recente primeiro)" description="Cada entrega instalada no servidor. Para saber se a sua instalação está atualizada, confira se a migração da última entrega aparece como aplicada." />
        <CardBody className="space-y-5">
          {RELEASES.map((r) => (
            <section key={r.id} aria-label={r.title}>
              <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span className="font-mono text-xs text-muted">{r.id}</span> {r.title} <Badge tone="success">entregue</Badge>
                <span className="text-xs font-normal text-muted">{r.when}{r.migration ? ` · migração ${r.migration}` : ""}</span>
              </h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-6 text-sm text-muted">{r.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
            </section>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Versão 2.0.0 — o que falta" description="Fecha o que o Astrea faz e o LegalOS ainda não. A versão vira 2.0.0 quando todas as fases estiverem feitas e verificadas." />
        <PhaseList phases={PHASES_2} />
      </Card>
      <Card>
        <CardHeader title="Versão 3.0.0 — planejada" description="Fecha o que o LegalMail faz e o LegalOS ainda não (vem depois da 2.0.0)." />
        <PhaseList phases={PHASES_3} />
      </Card>
      <Card>
        <CardHeader title="Versão 4.0.0 — planejada" description="Fecha o que o ChatGuru faz e o LegalOS ainda não (vem depois da 3.0.0). Plano em docs/roadmap-4.0.0.md." />
        <PhaseList phases={PHASES_4} />
      </Card>
      <Card>
        <CardHeader title="Versão 5.0.0 — ideias de futuro" description="Ideias além dos concorrentes, nascidas da rotina do escritório. Plano em docs/roadmap-5.0.0.md." />
        <PhaseList phases={PHASES_5} />
      </Card>
      <Card>
        <CardHeader title="Versão 6.0.0 — RUTE (MCP e aba de IA)" description="Servidor MCP e aba própria de Inteligência Artificial: a IA lê e propõe, só grava com confirmação. Plano em docs/roadmap-6.0.0.md." />
        <PhaseList phases={PHASES_6} />
      </Card>
      <Card>
        <CardHeader title="Pendências da equipe (sem código)" />
        <CardBody><ul className="list-disc space-y-1 pl-6 text-sm">{TEAM_TODO.map((t, i) => <li key={i}>{t}</li>)}</ul></CardBody>
      </Card>
    </>
  );
}
