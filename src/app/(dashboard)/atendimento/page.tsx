import { SERVICE_STATUSES, SERVICE_STATUS_LABEL, type ServiceStatus, isClosedService } from "@/lib/whatsapp/lifecycle";
import type { Metadata } from "next";
import { MessageSquare, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db/client";
import { formatWaId } from "@/lib/whatsapp/phone";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { getAccount, listQuickReplies, listTemplatesLocal } from "@/server/services/whatsapp-account.service";
import { listConversations, openConversation, teamForAssignment, type ConversationFilter } from "@/server/services/whatsapp.service";
import { listQueues, myAvailability } from "@/server/services/chat-queue.service";
import { AvailabilityButton } from "@/modules/whatsapp/availability-button";
import { conversationMeta, listFields, listLabels } from "@/server/services/chat-meta.service";
import { Avatar } from "@/modules/whatsapp/avatar";
import { labelStyle } from "@/modules/whatsapp/label-style";
import { AutoRefresh } from "@/modules/whatsapp/auto-refresh";
import { ChatPane } from "@/modules/whatsapp/chat-pane";
import { conversationPanel } from "@/server/services/chat-panel.service";
import { listNumbers } from "@/server/services/whatsapp-numbers.service";
import { getExtrasSettings, formStatus, listFollowUps, listForms, listScheduled } from "@/server/services/chat-extras.service";
import { listAgents } from "@/server/services/chat-queue.service";
import type { ConversationExtrasData } from "@/modules/whatsapp/extras-ui";
import type { ConvToolsData } from "@/modules/whatsapp/tools-ui";
import { listChatStatuses, listChecklists, listLibrary } from "@/server/services/chat-tools.service";
import { transcriptsFor } from "@/server/services/chat-transcribe.service";

export const metadata: Metadata = { title: "LegalOS Chat" };
export const dynamic = "force-dynamic";

const FILTERS: { key: ConversationFilter; label: string }[] = [
  { key: "open", label: "Abertas" },
  { key: "mine", label: "Minhas" },
  { key: "unassigned", label: "Sem responsável" },
  { key: "closed", label: "Encerradas" },
];
function listTime(d: Date | null, tz: string): string {
  if (!d) return "";
  const ymd = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  const now = new Date();
  if (ymd(d) === ymd(now)) return d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  if (ymd(d) === ymd(new Date(now.getTime() - 86_400_000))) return "Ontem";
  return d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" });
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AtendimentoPage({ searchParams }: { searchParams: Promise<{ f?: string; c?: string; q?: string; fila?: string; etq?: string; num?: string; s?:string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "whatsapp:read")) return <AccessDenied />;
  const sp = await searchParams;
  const serviceStatus=SERVICE_STATUSES.includes(sp.s as ServiceStatus)?sp.s as ServiceStatus:undefined;
  const filter = serviceStatus&&isClosedService(serviceStatus)?"closed":FILTERS.find((f) => f.key === sp.f)?.key ?? "open";
  const account = await getAccount(ctx);
  const manage = can(ctx, "whatsapp:manage");
  if (!account) {
    return (
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-4 md:p-6">
        <PageHeader title="LegalOS Chat" description="Caixa de conversas do escritório, ligada ao cadastro de clientes." />
        <Alert tone="info">
          O WhatsApp ainda não foi conectado. {manage ? <>Conecte o número em <Link className="underline" href="/atendimento/configuracoes">Configurações do Chat</Link>.</> : "Peça a um administrador para conectar o número."}
        </Alert>
      </div>
    );
  }
  const queues = await listQueues(ctx);
  const queueId = sp.fila && UUID.test(sp.fila) && queues.some((x) => x.id === sp.fila) ? sp.fila : undefined;
  const labels = await listLabels(ctx);
  const labelId = sp.etq && UUID.test(sp.etq) && labels.some((x) => x.id === sp.etq) ? sp.etq : undefined;
  const writer = can(ctx, "whatsapp:write");
  const available = writer ? await myAvailability(ctx) : true;
  const numbers = await listNumbers(ctx);
  const multi = numbers.length > 1;
  const numId = sp.num && UUID.test(sp.num) && numbers.some((n) => n.id === sp.num) ? sp.num : undefined;
  const list = await listConversations(ctx, filter, sp.q, queueId, labelId, numId,serviceStatus);
  const selectedId = sp.c && UUID.test(sp.c) ? sp.c : null;
  const opened = selectedId ? await openConversation(ctx, selectedId).catch(() => null) : null;
  const [team, quick, templates] = opened ? await Promise.all([teamForAssignment(ctx), listQuickReplies(ctx), listTemplatesLocal(ctx)]) : [[], [], []];
  const [fields, cmeta] = opened ? await Promise.all([listFields(ctx, true), conversationMeta(ctx, opened.conversation.id)]) : [[], { labelIds: [] as string[], values: {} as Record<string, string> }];
  const side = opened ? JSON.parse(JSON.stringify(await conversationPanel(ctx, opened.conversation.id))) : null;
  let extras: ConversationExtrasData | null = null;
  if (opened) {
    const [settings, followUps, scheduled, forms, agents, survey] = await Promise.all([
      getExtrasSettings(ctx), listFollowUps(ctx, { conversationId: opened.conversation.id }), listScheduled(ctx, opened.conversation.id), listForms(ctx, true), listAgents(ctx).catch(() => [] as { id: string; name: string }[]),
      db.whatsappSurvey.findFirst({ where: { conversationId: opened.conversation.id, organizationId: ctx.organizationId }, orderBy: { askedAt: "desc" }, select: { status: true, score: true } }),
    ]);
    const statuses = await Promise.all(forms.map((f) => formStatus(ctx, opened.conversation.id, f.id)));
    extras = {
      conversationId: opened.conversation.id, canWrite: writer, scheduledEnabled: settings.scheduledEnabled, npsEnabled: settings.npsEnabled, aiSummaryEnabled: settings.aiSummaryEnabled, canAi: can(ctx, "ai:use"), me: ctx.userId,
      agents: agents.map((a) => ({ id: a.id, name: a.name })),
      followUps: followUps.map((f) => ({ id: f.id, dueAt: f.dueAt.toISOString(), note: f.note, assigneeId: f.assigneeId })),
      scheduled: scheduled.slice(0, 8).map((m) => ({ id: m.id, body: m.body, sendAt: m.sendAt.toISOString(), status: m.status, error: m.error })),
      survey, forms: statuses.map((x) => ({ id: x.id, name: x.name, filled: x.filled, total: x.total, missingRequired: x.missingRequired })),
    };
  }
  let tools: ConvToolsData | null = null;
  let transcripts: Record<string, string> = {};
  let canTranscribe = false;
  if (opened) {
    const [statuses, checklists, library, st] = await Promise.all([listChatStatuses(ctx), listChecklists(ctx, true), listLibrary(ctx, true), getExtrasSettings(ctx)]);
    const row = await db.whatsappConversation.findFirst({ where: { id: opened.conversation.id, organizationId: ctx.organizationId }, select: { chatStatusId: true } });
    const audioIds = opened.messages.filter((m) => m.type === "audio" && m.direction === "IN").map((m) => m.id);
    transcripts = audioIds.length ? await transcriptsFor(ctx, audioIds).catch(() => ({})) : {};
    canTranscribe = st.transcribeEnabled && can(ctx, "ai:use");
    const fwd = opened.messages.filter((m) => m.direction !== "NOTE" && (m.body ?? "").trim()).slice(-8).reverse().map((m) => ({ id: m.id, label: `${m.direction === "IN" ? "Cliente" : "Equipe"}: ${(m.body ?? "").replace(/\s+/g, " ").slice(0, 50)}` }));
    tools = {
      conversationId: opened.conversation.id, canWrite: writer, statusId: row?.chatStatusId ?? null,
      statuses: statuses.map((x) => ({ id: x.id, name: x.name, color: x.color })),
      checklists: checklists.map((c) => ({ id: c.id, title: c.title })), library: library.map((f) => ({ id: f.id, title: f.title })),
      forwardable: fwd,
      others: list.filter((c) => c.id !== opened.conversation.id && c.status === "OPEN").slice(0, 40).map((c) => ({ id: c.id, name: c.client?.name ?? c.contactName ?? formatWaId(c.waId) })),
    };
  }
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
    const s = p.toString();
    return `/atendimento${s ? `?${s}` : ""}`;
  };

  const activeFilters = (queueId ? 1 : 0) + (labelId ? 1 : 0);
  const chat = opened;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="atendimento">
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5 text-xs">
        <span className="font-semibold">LegalOS Chat <span className="font-normal text-muted">· {multi ? `${numbers.length} números` : `Número ${account.displayPhone ?? account.label}`}{account.enabled ? "" : " (desligado)"}</span></span>
        <div className="flex items-center gap-3">
          {writer ? <AvailabilityButton available={available} /> : null}
          {manage ? <Link className="underline" href="/atendimento/relatorios">Relatórios</Link> : null}
          {manage ? <Link className="underline" href="/atendimento/configuracoes">Configurações</Link> : null}
        </div>
      </div>
      {!account.enabled ? <Alert tone="warning" className="m-2">O atendimento está desligado: mensagens novas não estão sendo recebidas.</Alert> : null}
      <div className="flex min-h-0 flex-1">
        <section className={`${chat ? "hidden lg:flex" : "flex"} min-h-0 w-full flex-col border-r border-border bg-surface lg:w-[340px] lg:shrink-0`} aria-label="Conversas">
          <form action="/atendimento" className="border-b border-border p-2">
            <input type="hidden" name="f" value={filter} />
            {queueId ? <input type="hidden" name="fila" value={queueId} /> : null}
            {labelId ? <input type="hidden" name="etq" value={labelId} /> : null}
            {numId ? <input type="hidden" name="num" value={numId} /> : null}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted" aria-hidden="true" />
              <input name="q" defaultValue={sp.q ?? ""} aria-label="Buscar conversa" placeholder="Buscar nome, telefone ou campo" className="h-8 w-full rounded-full border border-border bg-surface-2 pl-8 pr-3 text-sm" />
            </div>
            <div className="mt-2 flex gap-2"><select name="s" aria-label="Filtrar situação do atendimento" defaultValue={serviceStatus??""} className="min-w-0 flex-1 rounded border border-border bg-surface text-xs"><option value="">Todas as situações</option>{SERVICE_STATUSES.map(s=><option key={s} value={s}>{SERVICE_STATUS_LABEL[s]}</option>)}</select><button type="submit" className="text-xs underline">Aplicar</button></div>
          </form>
          <div className="flex flex-wrap gap-1 border-b border-border p-2">
            {FILTERS.map((f) => (
              <Link key={f.key} href={qs({ f: f.key, q: sp.q, fila: queueId, etq: labelId, num: numId })} className={`rounded-full px-2.5 py-1 text-xs ${f.key === filter ? "bg-primary text-primary-fg" : "bg-surface-2 hover:bg-border"}`}>{f.label}</Link>
            ))}
          </div>
          {multi ? (
            <div className="flex flex-wrap gap-1 border-b border-border p-2" data-testid="wa-number-filter" aria-label="Número do WhatsApp">
              <Link href={qs({ f: filter, q: sp.q, fila: queueId, etq: labelId })} className={`rounded-md px-2 py-1 text-xs ${!numId ? "bg-primary text-primary-fg" : "hover:bg-surface-2"}`}>Todos os números</Link>
              {numbers.filter((n) => n.enabled || n.id === numId).map((n) => <Link key={n.id} href={qs({ f: filter, q: sp.q, fila: queueId, etq: labelId, num: n.id })} className={`rounded-md px-2 py-1 text-xs ${n.id === numId ? "bg-primary text-primary-fg" : "hover:bg-surface-2"}`}>{n.label}</Link>)}
            </div>
          ) : null}
          {queues.length > 0 || labels.length > 0 ? (
            <details className="border-b border-border" open={activeFilters > 0}>
              <summary className="flex cursor-pointer items-center gap-1 px-3 py-1.5 text-xs text-muted hover:bg-surface-2"><SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Filtros{activeFilters > 0 ? ` (${activeFilters})` : ""}</summary>
              {queues.length > 0 ? (
                <div className="flex flex-wrap gap-1 p-2" data-testid="wa-queue-filter">
                  <Link href={qs({ f: filter, q: sp.q, etq: labelId, num: numId })} className={`rounded-md px-2 py-1 text-xs ${!queueId ? "bg-primary text-primary-fg" : "hover:bg-surface-2"}`}>Todas as filas</Link>
                  {queues.map((x) => (
                    <Link key={x.id} href={qs({ f: filter, q: sp.q, fila: x.id, etq: labelId, num: numId })} className={`rounded-md px-2 py-1 text-xs ${x.id === queueId ? "bg-primary text-primary-fg" : "hover:bg-surface-2"}`}>
                      {x.name}{x.waiting > 0 ? ` (${x.waiting} na espera)` : ""}
                    </Link>
                  ))}
                </div>
              ) : null}
              {labels.length > 0 ? (
                <div className="flex flex-wrap gap-1 p-2" data-testid="wa-label-filter">
                  <Link href={qs({ f: filter, q: sp.q, fila: queueId, num: numId })} className={`rounded-full border border-transparent px-2 py-0.5 text-xs ${!labelId ? "bg-primary text-primary-fg" : "hover:bg-surface-2"}`}>Todas as etiquetas</Link>
                  {labels.map((l) => (
                    <Link key={l.id} href={qs({ f: filter, q: sp.q, fila: queueId, etq: l.id, num: numId })} className={`rounded-full border px-2 py-0.5 text-xs ${l.id === labelId ? "font-semibold" : "opacity-80 hover:opacity-100"}`} style={l.id === labelId ? labelStyle(l.color) : { borderColor: l.color }}>{l.name}</Link>
                  ))}
                </div>
              ) : null}
            </details>
          ) : null}
          <div className="border-b border-border px-3 py-1 text-[11px] text-muted" aria-live="polite">Exibindo {list.length} {list.length === 1 ? "conversa" : "conversas"}</div>
          <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="wa-list">
            {list.length === 0 ? <li className="p-4 text-sm text-muted">Nenhuma conversa.</li> : null}
            {list.map((c) => {
              const name = c.client?.name ?? c.contactName ?? formatWaId(c.waId);
              return (
                <li key={c.id}>
                  <Link href={qs({ f: filter, q: sp.q, fila: queueId, etq: labelId, num: numId, c: c.id })} className={`flex gap-3 border-b border-border px-3 py-2.5 text-sm hover:bg-surface-2 ${c.id === selectedId ? "bg-surface-2" : ""}`}>
                    <Avatar name={name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate ${c.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>{name}</span>
                        <span className={`shrink-0 text-[11px] ${c.unreadCount > 0 ? "font-semibold text-danger" : "text-muted"}`}>{listTime(c.lastMessageAt, ctx.timezone)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted">{SERVICE_STATUS_LABEL[c.serviceStatus as ServiceStatus]??"Aberto"} · {c.lastPreview ?? "—"}</span>
                        {c.unreadCount > 0 ? <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white" aria-label={`${c.unreadCount} não lidas`}>{c.unreadCount}</span> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                        <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${c.status === "OPEN" ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>{c.status === "OPEN" ? "Em atendimento" : "Encerrada"}</span>
                        {multi ? <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted" data-testid="wa-number-chip">{c.account.label}</span> : null}
                        <span className="truncate text-muted">{c.assignedTo?.name ?? "Sem responsável"}{c.queue ? ` · ${c.queue.name}` : ""}</span>
                        {c.labels.map(({ label }) => <span key={label.id} className="rounded-full border px-1.5" style={labelStyle(label.color)}>{label.name}</span>)}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <section className={`${chat ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-1`} aria-label="Conversa">
          {opened ? (
            <ChatPane
              chat={{
                id: opened.conversation.id,
                title: opened.conversation.client?.name ?? opened.conversation.contactName ?? formatWaId(opened.conversation.waId),
                phone: formatWaId(opened.conversation.waId),
                status: opened.conversation.status, serviceStatus:opened.conversation.serviceStatus,
                client: opened.conversation.client,
                case: opened.conversation.case,
                lead: opened.conversation.lead,
                can: { cases: can(ctx, "cases:read"), tasks: can(ctx, "tasks:write"), events: can(ctx, "deadlines:write") || can(ctx, "tasks:write"), deadlines: can(ctx, "deadlines:write"), leads: can(ctx, "crm:write"), documents: can(ctx, "documents:write") },
                assignedToId: opened.conversation.assignedTo?.id ?? null,
                windowOpen: opened.conversation.windowOpen,
                windowClosesAt: opened.conversation.windowClosesAt?.toISOString() ?? null,
                canWrite: can(ctx, "whatsapp:write"),
                canLinkClient: can(ctx, "clients:read"),
                me: ctx.userId,
                queueId: opened.conversation.queue?.id ?? null,
              }}
              messages={opened.messages.map((m) => ({ id: m.id, direction: m.direction as "IN" | "OUT" | "NOTE", type: m.type, body: m.body, mediaMime: m.mediaMime, mediaName: m.mediaName, hasMedia: m.hasMedia, status: m.status, error: m.error, automatic: m.automatic, createdAt: m.createdAt.toISOString(), authorName: m.author?.name ?? null }))}
              team={team}
              meta={{ labels: labels.map((l) => ({ id: l.id, name: l.name, color: l.color })), selected: cmeta.labelIds, fields: fields.map((f) => ({ id: f.id, name: f.name, kind: f.kind, options: f.options })), values: cmeta.values }}
              queues={queues.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name }))}
              quick={quick}
              side={side}
              extras={extras ?? undefined}
              tools={tools ?? undefined}
              transcripts={transcripts}
              canTranscribe={canTranscribe}
              templates={templates.map((t) => ({ id: t.id, name: t.name, language: t.language, body: t.body, variableCount: t.variableCount }))}
            />
          ) : (
            <div className="wa-wallpaper flex h-full w-full items-center justify-center p-6 text-sm text-muted">
              <div className="rounded-lg bg-surface/90 px-6 py-5 text-center shadow">
                <MessageSquare className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
                <p>Escolha uma conversa ao lado.</p>
                {can(ctx, "whatsapp:manage") ? <Badge className="mt-2">Mensagens chegam automaticamente</Badge> : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
