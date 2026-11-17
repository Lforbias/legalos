"use client";

import { SERVICE_STATUSES, SERVICE_STATUS_LABEL, type ServiceStatus } from "@/lib/whatsapp/lifecycle";
import { serviceStatusAction } from "./operations-actions";
import { ManualCallForm } from "./operations-ui";
import { VoiceRecorder } from "./voice-recorder";
import { ArrowLeft, Check, CheckCheck, Clock, PanelRight, Paperclip, SendHorizontal, TriangleAlert, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Menu } from "@/components/ui/menu";
import { Avatar } from "./avatar";
import { EmojiPicker } from "./emoji-picker";
import { SidePanel, type PanelView } from "./side-panel";
import { ConversationExtras, type ConversationExtrasData } from "./extras-ui";
import { ConversationTools, TranscribeButton, type ConvToolsData } from "./tools-ui";
import { MetaPanel, type FieldOpt, type LabelOpt } from "./meta-panel";
import { ChatActions, MessageActions, type Can, type Links, type Panel } from "./links-panel";
import { addNoteAction, assignAction, linkClientAction, readOlderMessagesAction, searchClientsAction, sendMessageAction, sendTemplateAction, setStatusAction, transferQueueAction } from "./actions";

export type MessageView = { id: string; direction: "IN" | "OUT" | "NOTE"; type: string; body: string | null; mediaMime: string | null; mediaName: string | null; hasMedia: boolean; status: string; error: string | null; automatic: boolean; historical?: boolean; createdAt: string; authorName: string | null };
export type TemplateView = { id: string; name: string; language: string; body: string; variableCount: number };
export type ChatView = {
  backHref?: string;
  profilePhoto?: boolean;
  id: string; title: string; phone: string; status: string; serviceStatus?:string; client: { id: string; name: string } | null; assignedToId: string | null;
  case: Links["case"]; lead: Links["lead"]; can: Can;
  windowOpen: boolean; windowClosesAt: string | null; canWrite: boolean; canLinkClient: boolean; me: string;
  queueId: string | null;
};

const STATUS_LABEL: Record<string, string> = { PENDING: "Enviando…", SENT: "Enviada", DELIVERED: "Entregue", READ: "Lida", FAILED: "Falhou" };
const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date(Date.now() - 86400_000);
  if (d.toDateString() === t.toDateString()) return "Hoje";
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function Ticks({ status }: { status: string }) {
  if (status === "FAILED") return <TriangleAlert className="h-3.5 w-3.5 text-danger" aria-hidden />;
  if (status === "PENDING") return <Clock className="h-3 w-3" aria-hidden />;
  if (status === "SENT") return <Check className="h-3.5 w-3.5" aria-hidden />;
  return <CheckCheck className="h-3.5 w-3.5" style={status === "READ" ? { color: "var(--wa-tick)" } : undefined} aria-hidden />;
}

function Bubble({ m, actions, transcript, canTranscribe }: { m: MessageView; actions?: React.ReactNode; transcript?: string | null; canTranscribe?: boolean }) {
  const mine = m.direction === "OUT";
  const note = m.direction === "NOTE";
  const isImage = m.hasMedia && m.mediaMime?.startsWith("image/");
  const box = note
    ? "mx-auto max-w-[85%] border border-warning/40 bg-warning-bg text-warning"
    : mine
      ? "ml-auto w-fit max-w-[86%] rounded-tr-sm bg-[var(--wa-out)] text-[var(--wa-out-fg)] shadow-sm"
      : "mr-auto w-fit max-w-[86%] rounded-tl-sm bg-[var(--wa-in)] text-[var(--wa-in-fg)] shadow-sm";
  return (
    <div className={`group relative rounded-lg px-2.5 py-1.5 text-sm ${box}`} data-testid={`wa-msg-${m.direction.toLowerCase()}`}>
      {actions ? <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">{actions}</div> : null}
      {note ? <div className="mb-0.5 text-[11px] font-semibold">Nota interna · {m.authorName ?? "—"}</div> : null}
      {mine && m.authorName && !m.automatic ? <div className="mb-0.5 text-[12px] font-bold">{m.authorName}:</div> : null}
      {mine && m.automatic ? <div className="mb-0.5 text-[11px] font-semibold italic opacity-80">Mensagem automática</div> : null}
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/whatsapp/media/${m.id}`} alt={m.mediaName ?? "Imagem recebida"} className="mb-1 max-h-64 rounded" />
      ) : m.hasMedia && m.type === "audio" ? (
        <audio aria-label="Mensagem de áudio" className="mb-1 max-w-full" controls preload="none" src={`/api/whatsapp/media/${m.id}`} />
      ) : m.hasMedia ? (
        <a href={`/api/whatsapp/media/${m.id}`} className="mb-1 block underline" download>📎 {m.mediaName ?? "arquivo"}</a>
      ) : null}
      {m.type === "audio" && m.hasMedia && m.direction === "IN" ? <TranscribeButton messageId={m.id} initial={transcript ?? null} enabled={!!canTranscribe} /> : null}
      {m.type==="call"?<p className="mb-1 text-xs font-semibold">Ligação · {m.automatic?"evento do aparelho":"registro manual"}</p>:null}
      {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
      {m.direction === "IN" && m.error ? <p className="mt-1 text-[11px] text-warning">{m.error}</p> : null}
      <div className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${note ? "" : "text-[var(--wa-meta)]"}`}>
        {m.historical ? <span>Importada</span> : null}
        <time dateTime={m.createdAt}>{hm(m.createdAt)}</time>
        {mine ? <span className="inline-flex items-center gap-1" title={STATUS_LABEL[m.status] ?? m.status}><Ticks status={m.status} /><span className="sr-only">{STATUS_LABEL[m.status] ?? m.status}</span></span> : null}
      </div>
      {mine && m.status === "FAILED" && m.error ? <p className="mt-1 text-[11px] font-medium text-danger">{m.error}</p> : null}
    </div>
  );
}

export function ChatPane({ chat, messages, team, queues = [], meta, quick, templates, side, extras, tools, transcripts, canTranscribe, historyCursor, embedded = false }: { historyCursor?: string | null; chat: ChatView; messages: MessageView[]; team: { id: string; name: string }[]; queues?: { id: string; name: string }[]; meta?: { labels: LabelOpt[]; selected: string[]; fields: FieldOpt[]; values: Record<string, string> }; quick: { id: string; shortcut: string; title: string; body: string }[]; templates: TemplateView[]; side?: PanelView; extras?: ConversationExtrasData; tools?: ConvToolsData; transcripts?: Record<string, string>; canTranscribe?: boolean; embedded?: boolean }) {
  const router = useRouter();
  const [history, setHistory] = React.useState<{ messages: MessageView[]; cursor: string | null }>();
  const [loadingHistory, loadHistory] = React.useTransition();
  const cursor = history ? history.cursor : historyCursor;
  const [text, setText] = React.useState("");
  const [note, setNote] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  const historyRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [tpl, setTpl] = React.useState("");
  const [panel, setPanel] = React.useState<Panel>(null);
  const [panelN, setPanelN] = React.useState(0);
  const [detailsOpen, setDetailsOpen] = React.useState<boolean>();
  const detailsId = React.useId();
  const showDetails = React.useRef<HTMLButtonElement>(null);
  const closeDetails = React.useRef<HTMLButtonElement>(null);
  const toggleDesktopDetails = React.useRef<HTMLButtonElement>(null);
  const hideDetails = () => {
    setDetailsOpen(false);
    requestAnimationFrame(() => {
      const mobileButton = showDetails.current;
      (mobileButton?.offsetParent ? mobileButton : toggleDesktopDetails.current)?.focus();
    });
  };
  const openPanel = (p: Panel) => {
    setPanelN((n) => n + 1);
    setPanel(p);
    if (p && side) setDetailsOpen(true);
  };
  const links: Links = { client: chat.client, case: chat.case, lead: chat.lead };
  const [params, setParams] = React.useState<string[]>([]);
  const [q, setQ] = React.useState("");
  const [found, setFound] = React.useState<{ id: string; name: string }[]>([]);

  const lastMessageId = messages.at(-1)?.id;
  React.useEffect(() => {
    const history = historyRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }, [lastMessageId, chat.id]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg({ tone: "error", text: r.message ?? "Não foi possível concluir." });
      else {
        setMsg(null);
        after?.();
      }
      router.refresh();
    });

  const quickMatch = text.startsWith("/") ? quick.filter((r) => r.shortcut.startsWith(text.slice(1).toLowerCase())).slice(0, 5) : [];
  const selTpl = templates.find((t) => t.id === tpl);

  function submit() {
    const body = text.trim();
    if (!body || pending) return;
    if (note) run(() => addNoteAction(chat.id, body), () => setText(""));
    else
      run(async () => {
        const r = await sendMessageAction(chat.id, body);
        if (r.ok && r.data?.status === "FAILED") return { ok: false, message: `A Meta não aceitou a mensagem: ${r.data.error ?? "sem detalhe"}` };
        if (r.ok) setText("");
        return r;
      });
  }

  async function upload(file: File, voice = false) {
    const fd = new FormData();
    fd.set("file", file);
    if (!voice && text.trim()) fd.set("caption", text.trim());
    start(async () => {
      const res = await fetch(`/api/whatsapp/conversations/${chat.id}/file`, { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { error?: string; status?: string; fieldErrors?: Record<string, string[]> };
      if (!res.ok) setMsg({ tone: "error", text: j.fieldErrors?.file?.[0] ?? j.error ?? "Não foi possível enviar o arquivo." });
      else if (j.status === "FAILED") setMsg({ tone: "error", text: `A Meta não aceitou o arquivo: ${j.error ?? "sem detalhe"}` });
      else {
        setMsg(null);
        if (!voice) setText("");
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function loadEarlier() {
    if (!cursor || loadingHistory) return;
    loadHistory(async () => {
      try {
        const result = await readOlderMessagesAction(chat.id, cursor);
        if (!result.ok || !result.data) {
          setMsg({ tone: "error", text: result.message ?? "Não foi possível carregar o histórico." });
          return;
        }
        const page = result.data;
        setHistory({
          messages: Array.from(new Map([...page.messages, ...(history?.messages ?? []), ...messages].map((message) => [message.id, message])).values()),
          cursor: page.historyCursor,
        });
        setMsg(null);
      } catch {
        setMsg({ tone: "error", text: "Não foi possível carregar o histórico. Tente novamente." });
      }
    });
  }

  const visibleMessages = history
    ? Array.from(new Map([...history.messages, ...messages].map((message) => [message.id, message])).values())
    : messages;
  const grouped: { key: string; label: string; items: MessageView[] }[] = [];
  for (const m of visibleMessages) {
    if (embedded && m.direction === "NOTE") continue;
    const k = dayKey(m.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.key === k) last.items.push(m);
    else grouped.push({ key: k, label: dayLabel(m.createdAt), items: [m] });
  }
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const autosize = () => { const el = taRef.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; };
  React.useEffect(autosize, [text]);
  const addEmoji = (e: string) => { setText((t) => t + e); taRef.current?.focus(); };
  const assignee = team.find((u) => u.id === chat.assignedToId);
  const open = chat.status === "OPEN";

  const controls = chat.canWrite ? (
    <div className="space-y-2 border-b border-border px-3 py-3" data-testid="wa-controls">
      <Select aria-label="Situação do atendimento" value={chat.serviceStatus??chat.status} disabled={pending} onChange={e=>run(()=>serviceStatusAction(chat.id,e.target.value))}>{SERVICE_STATUSES.map(s=><option key={s} value={s}>{SERVICE_STATUS_LABEL[s]}</option>)}</Select>
      <ManualCallForm conversationId={chat.id}/>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-text">Responsável</h3>
      <div className="grid grid-cols-1 gap-2">
        <Select aria-label="Responsável" value={chat.assignedToId ?? ""} disabled={pending} onChange={(e) => run(() => assignAction(chat.id, e.target.value || null))} className="h-9 text-sm">
          <option value="">Sem responsável</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>{u.name}{u.id === chat.me ? " (eu)" : ""}</option>
          ))}
        </Select>
        {queues.length > 0 ? (
          <Select aria-label="Fila" data-testid="wa-queue-select" value={chat.queueId ?? ""} disabled={pending} onChange={(e) => run(() => transferQueueAction(chat.id, e.target.value || null))} className="h-9 text-sm">
            <option value="">Sem fila</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </Select>
        ) : null}
      </div>
    </div>
  ) : null;

  const informationPanel = side ? (
    <SidePanel
          title={chat.title}
          phone={chat.phone}
          data={side}
          controls={controls}
          extras={extras || tools ? <>{extras ? <ConversationExtras d={extras} /> : null}{tools ? <ConversationTools d={tools} /> : null}</> : null}
          meta={chat.canWrite && meta ? <MetaPanel key={JSON.stringify([meta.selected, meta.values])} chatId={chat.id} labels={meta.labels} selected={meta.selected} fields={meta.fields} values={meta.values} onMsg={setMsg} /> : null}
          actions={chat.canWrite ? <ChatActions key={`${panel?.kind ?? "-"}:${panel?.messageId ?? ""}:${panelN}`} chatId={chat.id} title={chat.title} links={links} can={chat.can} team={team} me={chat.me} panel={panel} setPanel={openPanel} onMsg={setMsg} /> : <p className="px-3 pb-3 text-xs text-muted">Sem permissão para criar a partir da conversa.</p>}
        />
  ) : null;

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1" data-testid="wa-chat-wrap">
      <div className={`h-full min-h-0 min-w-0 flex-1 flex-col ${detailsOpen && side ? "hidden xl:flex" : "flex"}`} data-testid="wa-chat">
        <div className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2.5 sm:gap-3 sm:px-4">
          {!embedded ? <Link href={chat.backHref ?? "/atendimento"} aria-label="Voltar às conversas" className="rounded-full p-1.5 hover:bg-surface-2 lg:hidden"><ArrowLeft className="h-5 w-5" aria-hidden /></Link> : null}
          <Avatar name={chat.title} size={40} conversationId={chat.profilePhoto ? chat.id : undefined} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{chat.title}</div>
            <div className="truncate text-xs text-muted">
              {chat.phone}
              {!embedded && (chat.client ? <> · <Link className="underline" href={`/clientes/${chat.client.id}`}>{chat.client.name}</Link></> : " · cliente não vinculado")}
              {assignee ? ` · ${assignee.name}` : ""}
            </div>
          </div>
          {!embedded ? <span className={`hidden rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wide sm:inline ${open ? "bg-primary text-primary-fg" : "bg-surface-3 text-muted"}`} data-testid="wa-status">{SERVICE_STATUS_LABEL[(chat.serviceStatus??chat.status) as ServiceStatus]??chat.status}</span> : null}
          {side ? (
            <>
              <Button size="sm" variant="ghost" ref={showDetails} className="xl:hidden" aria-controls={detailsId} aria-expanded={detailsOpen === true} aria-label="Detalhes da conversa" onClick={() => { setDetailsOpen(true); requestAnimationFrame(() => closeDetails.current?.focus()); }}>
                <PanelRight className="size-4" aria-hidden />
              </Button>
              <Button size="sm" variant="ghost" ref={toggleDesktopDetails} className="hidden xl:inline-flex" aria-controls={detailsId} aria-expanded={detailsOpen !== false} aria-label="Detalhes da conversa" onClick={() => setDetailsOpen(detailsOpen === false)}>
                <PanelRight className="size-4" aria-hidden />
              </Button>
            </>
          ) : null}
          {!embedded && chat.canWrite ? (
            <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setStatusAction(chat.id, open ? "CLOSED" : "OPEN"))}>
              {open ? "Encerrar" : "Reabrir"}
            </Button>
          ) : null}
        </div>

        {!embedded && chat.canWrite && chat.canLinkClient && !chat.client ? (
          <div className="space-y-2 border-b border-border bg-surface p-3 text-sm">
            <div className="flex gap-2">
              <Input aria-label="Buscar cliente" placeholder="Vincular a um cliente (nome ou CPF/CNPJ)" value={q} onChange={(e) => setQ(e.target.value)} />
              <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => { const r = await searchClientsAction(q); setFound(r.data ?? []); })}>Buscar</Button>
            </div>
            {found.map((c) => (
              <button key={c.id} type="button" className="mr-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2" onClick={() => run(() => linkClientAction(chat.id, c.id), () => setFound([]))}>{c.name}</button>
            ))}
          </div>
        ) : null}

        {!embedded && !side ? (
          <>
            {chat.canWrite ? <ChatActions key={`${panel?.kind ?? "-"}:${panel?.messageId ?? ""}:${panelN}`} chatId={chat.id} title={chat.title} links={links} can={chat.can} team={team} me={chat.me} panel={panel} setPanel={openPanel} onMsg={setMsg} /> : null}
            {chat.canWrite && meta ? <MetaPanel key={JSON.stringify([meta.selected, meta.values])} chatId={chat.id} labels={meta.labels} selected={meta.selected} fields={meta.fields} values={meta.values} onMsg={setMsg} /> : null}
          </>
        ) : null}

        <div ref={historyRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto wa-wallpaper px-4 py-5 md:px-8" data-testid="wa-messages">
          {cursor ? <div className="flex justify-center"><Button size="sm" variant="secondary" loading={loadingHistory} onClick={loadEarlier}>Carregar mensagens anteriores</Button></div> : null}
          {grouped.length === 0 ? <p className="mx-auto w-fit rounded-md bg-surface/80 px-3 py-1 text-sm text-muted">Sem mensagens ainda.</p> : null}
          {grouped.map((g) => (
            <div key={g.key} className="space-y-1.5">
              <div className="sticky top-0 z-[1] flex justify-center py-1"><span className="rounded-md bg-surface/90 px-3 py-0.5 text-xs font-medium text-muted shadow-sm">{g.label}</span></div>
              {g.items.map((m) => <Bubble key={m.id} m={m} transcript={transcripts?.[m.id]} canTranscribe={canTranscribe} actions={(!embedded || chat.can.documents) && chat.canWrite && m.direction !== "NOTE" ? <MessageActions messageId={m.id} excerpt={m.body ?? ""} hasMedia={m.hasMedia} links={links} can={chat.can} onPanel={openPanel} onDone={setMsg} /> : undefined} />)}
            </div>
          ))}
        </div>

        {msg ? <div className="border-t border-border bg-surface px-4 py-4"><Alert tone={msg.tone}>{msg.text}</Alert></div> : null}

        {chat.canWrite ? (
          <div className={`space-y-3 border-t border-border bg-surface p-4 ${embedded && !chat.windowOpen ? "max-h-[55%] overflow-y-auto" : ""}`}>
            {!chat.windowOpen && !note ? (
              <div className="space-y-2 rounded-md border border-warning/40 bg-warning-bg p-3 text-sm text-warning" data-testid="wa-window-closed">
                <p>A janela de 24 horas está fechada: só é possível enviar um modelo aprovado pela Meta.</p>
                {templates.length === 0 ? <p>Nenhum modelo aprovado sincronizado (Configurações do Chat → Sincronizar modelos).</p> : (
                  <div className="space-y-2">
                    <Select aria-label="Modelo" value={tpl} onChange={(e) => { setTpl(e.target.value); setParams(Array(templates.find((t) => t.id === e.target.value)?.variableCount ?? 0).fill("")); }}>
                      <option value="">Escolha um modelo…</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
                    </Select>
                    {selTpl ? <p className="whitespace-pre-wrap rounded bg-surface p-2 text-xs text-fg">{selTpl.body}</p> : null}
                    {params.map((p, i) => <Input key={i} aria-label={`Variável ${i + 1}`} placeholder={`Valor de {{${i + 1}}}`} value={p} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} />)}
                    <Button size="sm" disabled={!selTpl} loading={pending} onClick={() => run(async () => {
                      const r = await sendTemplateAction(chat.id, tpl, params);
                      if (r.ok && r.data?.status === "FAILED") return { ok: false, message: `A Meta não aceitou o modelo: ${r.data.error ?? "sem detalhe"}` };
                      return r;
                    }, () => { setTpl(""); setParams([]); })}>Enviar modelo</Button>
                  </div>
                )}
              </div>
            ) : null}
            {chat.windowOpen && chat.windowClosesAt ? <p className="text-[11px] text-muted">Janela de resposta aberta até {fmt(chat.windowClosesAt)}.</p> : null}
            {quickMatch.length ? (
              <div className="flex flex-wrap gap-2">
                {quickMatch.map((r) => <button key={r.id} type="button" className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2" onClick={() => setText(r.body)}>/{r.shortcut} — {r.title}</button>)}
              </div>
            ) : null}
            {!embedded ? <label className="flex w-fit items-center gap-2 rounded-full border border-border px-2.5 py-0.5 text-xs"><input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} /> Nota interna</label> : null}
            {(chat.windowOpen || note) ? (
              <div className={`flex items-end gap-1.5 rounded-2xl border px-1.5 py-1.5 ${note ? "border-warning/50 bg-warning-bg" : "border-border bg-surface-2"}`}>
                <EmojiPicker onPick={addEmoji} disabled={pending} />
                {quick.length > 0 && !note ? (
                  <Menu label="Respostas rápidas" align="left" panelClassName="bottom-full mb-2 mt-0 max-h-64 w-72 overflow-y-auto" trigger={<span className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-3"><Zap className="h-5 w-5" aria-hidden /></span>}>
                    {(close) => quick.map((r) => (
                      <button key={r.id} role="menuitem" type="button" className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => { setText(r.body); close(); taRef.current?.focus(); }}>
                        <span className="font-medium">/{r.shortcut}</span> <span className="text-muted">— {r.title}</span>
                      </button>
                    ))}
                  </Menu>
                ) : null}
                {!note ? (
                  <>
                    <VoiceRecorder disabled={pending} onSend={(file) => void upload(file, true)} onError={(text) => setMsg({ tone: "error", text })} />
                    <input ref={fileRef} type="file" className="hidden" aria-label="Anexar arquivo" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
                    <button type="button" aria-label="Anexar" title="Anexar arquivo" disabled={pending} onClick={() => fileRef.current?.click()} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-3 disabled:opacity-50"><Paperclip className="h-5 w-5" aria-hidden /></button>
                  </>
                ) : null}
                <textarea
                  ref={taRef}
                  aria-label={note ? "Nota interna" : "Mensagem"}
                  rows={1}
                  className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted"
                  placeholder={note ? "Nota interna (o cliente não vê)" : "Escreva uma mensagem…"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
                />
                <button type="button" aria-label={note ? "Salvar nota" : "Enviar"} title={note ? "Salvar nota" : "Enviar"} disabled={pending || !text.trim()} onClick={submit} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-50"><SendHorizontal className="h-5 w-5" aria-hidden /></button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {side ? (
        <div id={detailsId} data-chat-info-panel={detailsOpen !== false ? "" : undefined} className={`h-full min-h-0 w-full shrink-0 flex-col bg-surface xl:w-[var(--chat-details-width)] xl:border-l xl:border-border ${detailsOpen === false ? "hidden" : detailsOpen ? "flex" : "hidden xl:flex"}`}>
          <div className="flex min-h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
            <h2 className="text-sm font-semibold">Detalhes da conversa</h2>
            <Button ref={closeDetails} variant="ghost" size="sm" aria-label="Fechar detalhes" onClick={hideDetails}>
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          <div className="min-h-0 flex-1">{informationPanel}</div>
        </div>
      ) : null}
    </div>
  );
}

export function StatusBadge({ open, unread }: { open: boolean; unread: number }) {
  return unread > 0 ? <Badge tone="info">{unread}</Badge> : open ? null : <Badge>Encerrada</Badge>;
}
