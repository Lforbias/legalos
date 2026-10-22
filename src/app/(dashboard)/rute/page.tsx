import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TabsNav } from "@/components/ui/tabs-nav";
import { db } from "@/lib/db/client";
import { formatDateTime } from "@/lib/dates/format";
import { mcpUrl } from "@/lib/mcp/http";
import { Chat, DeleteConversation } from "@/modules/rute/assistant-ui";
import { GovernanceForm, InstructionForm, InstructionRow } from "@/modules/rute/library-ui";
import { ConnectGuide, ConnectionList, KeyForm, ProposalList, SettingsPanel, TestButton } from "@/modules/rute/rute-ui";
import { can } from "@/server/context";
import { listMcpConnections } from "@/server/services/mcp-auth.service";
import { assistantAvailability, getConversation, listConversations } from "@/server/services/rute-assistant.service";
import { lgpdReport, listToolHistory, usageReport } from "@/server/services/rute-governance.service";
import { AREAS, listInstructions } from "@/server/services/rute-library.service";
import { listProposals, pendingProposalCount } from "@/server/services/rute-proposal.service";
import { getRuteSettings } from "@/server/services/rute-settings.service";
import { requireTenant } from "@/server/session";
import { PHASES_7 } from "@/lib/updates";

export const metadata: Metadata = { title: "RUTE — a IA do LegalOS" };
type SP = Record<string, string | undefined>;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export default async function RutePage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "ai:use")) return <AccessDenied />;
  const sp = await searchParams;
  const manage = can(ctx, "integrations:manage");
  const library = can(ctx, "organization:manage");
  const pending = await pendingProposalCount(ctx);
  const tabs = [
    { key: "situacao", label: "Situação" },
    { key: "conexoes", label: "Conexões" },
    { key: "propostas", label: "Propostas", count: pending },
    { key: "assistente", label: "Assistente" },
    { key: "biblioteca", label: "Biblioteca" },
    { key: "historico", label: "Histórico" },
    ...(manage ? [{ key: "governanca", label: "Governança" }] : []),
    { key: "embreve", label: "Em breve" },
  ];
  const current = tabs.some((t) => t.key === sp.aba) ? (sp.aba as string) : "situacao";
  const settings = await getRuteSettings(ctx);
  const tz = organization.timezone;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="RUTE — a IA do LegalOS" description="A IA lê e propõe; uma pessoa confirma. Nada é criado, alterado ou enviado sem confirmação humana, e nada fala com cliente." />
      <TabsNav base="/rute" current={current} tabs={tabs} />
      {settings.emergencyStop ? <Alert tone="error">Parada de emergência ativa neste escritório.</Alert> : null}

      {current === "situacao" ? (
        <Card>
          <CardHeader title="Situação e interruptores" description="Tudo nasce desligado. Quem administra as integrações liga o que quiser." />
          <CardBody><SettingsPanel canManage={manage} s={{ ...settings, consentAt: iso(settings.consentAt) }} /></CardBody>
        </Card>
      ) : null}

      {current === "conexoes" ? <Connections ctx={ctx} manage={manage} enabled={settings.mcpEnabled} tz={tz} /> : null}

      {current === "propostas" ? <Proposals ctx={ctx} /> : null}

      {current === "assistente" ? <Assistant ctx={ctx} sp={sp} enabled={settings.assistantEnabled} tz={tz} /> : null}

      {current === "biblioteca" ? <Library ctx={ctx} canEdit={library} /> : null}

      {current === "historico" ? <History ctx={ctx} tz={tz} /> : null}

      {current === "embreve" ? <Upcoming /> : null}

      {current === "governanca" && manage ? <Governance ctx={ctx} settings={settings} sp={sp} tz={tz} /> : null}
    </div>
  );
}

type Ctx = Awaited<ReturnType<typeof requireTenant>>["ctx"];

async function Connections({ ctx, manage, enabled, tz }: { ctx: Ctx; manage: boolean; enabled: boolean; tz: string }) {
  const items = await listMcpConnections(ctx);
  return (
    <div className="space-y-4">
      <Card><CardHeader title="Conectar uma IA" description="Passo a passo para Claude, ChatGPT e Gemini." /><CardBody><ConnectGuide mcpUrl={mcpUrl()} enabled={enabled} /></CardBody></Card>
      {manage ? <Card><CardHeader title="Criar chave (Gemini CLI, Claude Code, scripts)" description="A chave age como você. Ela só aparece uma vez." /><CardBody><KeyForm /></CardBody></Card> : null}
      <Card><CardHeader title="Conexões" description={manage ? "Todas as conexões do escritório." : "As suas conexões."} action={<TestButton />} />
        <CardBody>
          <ConnectionList items={items.map((c) => ({ id: c.id, kind: c.kind, name: c.name, scopes: c.scopes, userName: c.userName, lastUsedAt: c.lastUsedAt ? formatDateTime(c.lastUsedAt, tz) : null, createdAt: c.createdAt.toISOString(), status: c.status }))} />
        </CardBody>
      </Card>
    </div>
  );
}

async function Proposals({ ctx }: { ctx: Ctx }) {
  const tz = ctx.timezone;
  const [open, decided] = await Promise.all([listProposals(ctx, { status: "PENDING" }), listProposals(ctx, { status: "DECIDED" })]);
  const map = (p: Awaited<ReturnType<typeof listProposals>>[number]) => ({ id: p.id, kindLabel: p.kindLabel, risk: p.risk, title: p.title, payload: p.payload, via: p.via, connection: p.connection, caseTitle: p.caseTitle, status: p.status, proposerName: p.proposerName, createdAt: formatDateTime(p.createdAt, tz), expiresAt: formatDateTime(p.expiresAt, tz), decisionNote: p.decisionNote });
  return (
    <div className="space-y-4">
      <Card><CardHeader title="Aguardando a sua decisão" description="Revise, edite se quiser e aprove. Ações de maior risco pedem confirmação expressa." /><ProposalList items={open.map(map)} /></Card>
      <Card><CardHeader title="Decididas" /><ProposalList items={decided.slice(0, 30).map(map)} /></Card>
    </div>
  );
}

async function Assistant({ ctx, sp, enabled, tz }: { ctx: Ctx; sp: SP; enabled: boolean; tz: string }) {
  const [avail, convs] = await Promise.all([assistantAvailability(ctx), listConversations(ctx)]);
  if (!enabled || !avail.available) return <Card><CardBody><Alert tone="warning">{avail.reason ?? "O assistente embutido está desligado. Quem administra liga em Situação."}</Alert></CardBody></Card>;
  const conv = sp.c ? await getConversation(ctx, sp.c).catch(() => null) : null;
  const caseId = conv?.caseId ?? (sp.caso && /^[0-9a-f-]{36}$/i.test(sp.caso) ? sp.caso : null);
  const clientId = conv?.clientId ?? (sp.cliente && /^[0-9a-f-]{36}$/i.test(sp.cliente) ? sp.cliente : null);
  let label: string | null = null;
  if (caseId) label = (await db.case.findFirst({ where: { id: caseId, organizationId: ctx.organizationId, deletedAt: null }, select: { title: true } }))?.title ?? null;
  if (!label && clientId) label = (await db.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { name: true } }))?.name ?? null;
  return (
    <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
      <Card>
        <CardHeader title="Conversas" action={<Link href="/rute?aba=assistente"><Button size="sm" variant="secondary">Nova</Button></Link>} />
        <ul className="divide-y divide-border text-sm">
          {convs.length === 0 ? <li className="p-3 text-xs text-muted">Nenhuma ainda.</li> : null}
          {convs.map((c) => <li key={c.id} className="px-3 py-2"><Link href={`/rute?aba=assistente&c=${c.id}`} className={c.id === conv?.id ? "font-medium" : "hover:underline"}>{c.title}</Link><p className="text-[11px] text-muted">{formatDateTime(c.updatedAt, tz)}</p></li>)}
        </ul>
      </Card>
      <Card>
        <CardHeader title={conv?.title ?? "Nova conversa"} action={conv ? <DeleteConversation id={conv.id} /> : undefined} />
        <CardBody>
          <Chat key={conv?.id ?? `new-${caseId}-${clientId}`} conversationId={conv?.id ?? null} caseId={caseId} clientId={clientId} contextLabel={label} messages={(conv?.messages ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, refs: (m.refs ?? []) as never }))} />
        </CardBody>
      </Card>
    </div>
  );
}

async function Library({ ctx, canEdit }: { ctx: Ctx; canEdit: boolean }) {
  const items = await listInstructions(ctx);
  const areas: Record<string, string> = { ...AREAS };
  return (
    <div className="space-y-4">
      {canEdit ? (
        <Card>
          <CardHeader title="Pacote para o Claude" description="Baixe um .zip com as instruções e modelos ativos e envie em Claude → Configurações → Skills." action={<a href="/api/rute/skill"><Button size="sm" variant="secondary">Baixar pacote</Button></a>} />
          <CardBody><InstructionForm areas={areas} /></CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Biblioteca do escritório" description="A IA lê estas instruções e modelos (pelo assistente e pelas conexões)." />
        <ul className="divide-y divide-border px-4">
          {items.length === 0 ? <li className="py-6 text-center text-sm text-muted">Nada cadastrado ainda.</li> : null}
          {items.map((i) => <InstructionRow key={i.id + String(i.updatedAt)} item={{ id: i.id, area: i.area, kind: i.kind, title: i.title, body: i.body, active: i.active }} areas={areas} canEdit={canEdit} />)}
        </ul>
      </Card>
    </div>
  );
}

async function History({ ctx, tz }: { ctx: Ctx; tz: string }) {
  const rows = await listToolHistory(ctx);
  return (
    <Card>
      <CardHeader title="Histórico de uso" description="Quais consultas e propostas a IA fez. O texto das perguntas não é guardado." />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted"><tr><th className="px-3 py-2">Quando</th><th className="px-3 py-2">Pessoa</th><th className="px-3 py-2">Origem</th><th className="px-3 py-2">Ferramenta</th><th className="px-3 py-2">Resultado</th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-muted">Nada ainda.</td></tr> : null}
            {rows.map((r) => <tr key={r.id}><td className="px-3 py-2">{formatDateTime(r.when, tz)}</td><td className="px-3 py-2">{r.who}</td><td className="px-3 py-2">{r.via === "MCP" ? (r.connection ?? "IA externa") : "Assistente"}</td><td className="px-3 py-2">{r.tool}</td><td className="px-3 py-2"><Badge tone={r.ok ? "success" : "warning"}>{r.ok ? "ok" : "recusado"}</Badge></td></tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function Governance({ ctx, settings, sp, tz }: { ctx: Ctx; settings: Awaited<ReturnType<typeof getRuteSettings>>; sp: SP; tz: string }) {
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : undefined;
  const [usage, lgpd, roles] = await Promise.all([usageReport(ctx, month), lgpdReport(ctx, month), db.role.findMany({ where: { organizationId: ctx.organizationId, key: { not: "CLIENT" } }, orderBy: { name: "asc" }, select: { key: true, name: true } })]);
  return (
    <div className="space-y-4">
      <Card><CardHeader title="Limites e retenção" /><CardBody><GovernanceForm retentionDays={settings.retentionDays} monthlyTokenLimit={settings.monthlyTokenLimit} roleLimits={settings.roleLimits} roles={roles} /></CardBody></Card>
      <Card>
        <CardHeader title={`Uso em ${usage.month}`} description="Em tokens (unidade de consumo da IA). Não convertemos em reais para não inventar valores." action={<form method="get"><input type="hidden" name="aba" value="governanca" /><input name="mes" type="month" defaultValue={usage.month} className="h-8 rounded-md border border-border bg-surface px-2 text-xs" /> <Button size="sm" variant="secondary" type="submit">Ver</Button></form>} />
        <CardBody className="space-y-3 text-sm">
          <p>Total do mês: <strong>{usage.totalTokens.toLocaleString("pt-BR")}</strong> tokens.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="mb-1 text-xs font-medium text-muted">Por pessoa</p><ul className="space-y-1 text-xs">{usage.byUser.length === 0 ? <li className="text-muted">Sem uso.</li> : null}{usage.byUser.map((u) => <li key={u.userId} className="flex justify-between"><span>{u.name}</span><span>{u.tokens.toLocaleString("pt-BR")}</span></li>)}</ul></div>
            <div><p className="mb-1 text-xs font-medium text-muted">Por recurso</p><ul className="space-y-1 text-xs">{usage.byFeature.map((u) => <li key={u.feature} className="flex justify-between"><span>{u.feature}</span><span>{u.tokens.toLocaleString("pt-BR")}</span></li>)}</ul></div>
          </div>
          <div><p className="mb-1 text-xs font-medium text-muted">Propostas</p><p className="text-xs">{usage.proposals.length ? usage.proposals.map((p) => `${p.status}: ${p.count}`).join(" · ") : "Nenhuma."}</p></div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={`Relatório de LGPD — ${lgpd.month}`} description="O que saiu do LegalOS para IAs: quando, quem, qual IA, qual consulta, sobre qual cliente/processo. Sem o texto das consultas." action={<a href={`/api/rute/lgpd?mes=${lgpd.month}`}><Button size="sm" variant="secondary">Baixar CSV</Button></a>} />
        <CardBody className="space-y-2 text-sm">
          <p>{lgpd.total} consultas · {lgpd.distinctClients} clientes distintos{lgpd.byProvider.length ? ` · ${lgpd.byProvider.map((p) => `${p.provider}: ${p.count}`).join(", ")}` : ""}.</p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted"><tr><th className="py-1 pr-2">Quando</th><th className="pr-2">Pessoa</th><th className="pr-2">IA</th><th className="pr-2">Consulta</th><th className="pr-2">Cliente</th><th>Processo</th></tr></thead>
              <tbody className="divide-y divide-border">{lgpd.rows.slice(0, 200).map((r, i) => <tr key={i}><td className="py-1 pr-2">{formatDateTime(r.when, tz)}</td><td className="pr-2">{r.who}</td><td className="pr-2">{r.provider}</td><td className="pr-2">{r.tool}</td><td className="pr-2">{r.client ?? "—"}</td><td>{r.case ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

const GROUPS_7: { title: string; ids: string[] }[] = [
  { title: "RUTE com voz e mais autonomia", ids: ["7.0-F1", "7.0-F19"] },
  { title: "Rotina da RUTE", ids: ["7.0-F2", "7.0-F3", "7.0-F4", "7.0-F5"] },
  { title: "Para o cliente", ids: ["7.0-F6", "7.0-F7", "7.0-F8"] },
  { title: "Para a equipe", ids: ["7.0-F9", "7.0-F10"] },
  { title: "Financeiro", ids: ["7.0-F11", "7.0-F12", "7.0-F13"] },
  { title: "Processos e uso diário", ids: ["7.0-F14", "7.0-F15", "7.0-F16", "7.0-F17", "7.0-F18"] },
];

/** Lista do que está planejado para a RUTE e para o LegalOS. Nada aqui existe ainda. */
function Upcoming() {
  return (
    <div className="space-y-4">
      <Alert tone="info">Estas ideias estão na fila e ainda não existem. A ordem será definida pela equipe. A RUTE continuará só propondo, e o que for liberado para ela fazer sozinha terá interruptor próprio.</Alert>
      {GROUPS_7.map((g) => (
        <Card key={g.title}>
          <CardHeader title={g.title} />
          <ul className="divide-y divide-border">
            {g.ids.map((id) => {
              const p = PHASES_7.find((x) => x.id === id);
              return p ? <li key={id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm"><span>{p.title}</span><Badge tone="neutral">Em breve</Badge></li> : null;
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
