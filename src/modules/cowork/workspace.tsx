"use client";

import { Archive, ArrowLeft, BarChart3, BellOff, CalendarClock, Hash, Info, Lock, LogOut, MessagesSquare, Plus, RefreshCw, Search, Settings2, Users, Video, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";
import { archiveChannelAction, deleteMessageAction, editMessageAction, leaveChannelAction, markReadAction, muteChannelAction } from "./actions";
import { AVAILABILITY_LABEL, COWORK_DEPARTMENT_COLOR, isCoworkDepartment, MEETING_STATUS_LABEL, WORK_STATE_LABEL } from "./constants";
import { Composer, type ComposerSubmit } from "./composer";
import { ConvertDialog, ExploreDialog, MembersDialog, NewChannelDialog, NewConversationDialog } from "./dialogs";
import { MessageItem } from "./message-item";
import type { ChannelSummary, CoworkMessageDTO, CoworkPerms, PendingMessage, Person } from "./types";
import { fetchJson, formatDay, formatTime, newNonce, PersonAvatar } from "./ui";
import { useCoworkRealtime, type RealtimeEvent } from "./use-realtime";

type Timeline = { items: CoworkMessageDTO[]; hasMore: boolean; loaded: boolean; lastSeq: number; error?: string };
type Thread = { rootId: string; root: CoworkMessageDTO | null; replies: CoworkMessageDTO[]; loading: boolean };
type Meeting = { id: string; title: string; date: string; startTime: string; status: keyof typeof MEETING_STATUS_LABEL };

const EMPTY: Timeline = { items: [], hasMore: false, loaded: false, lastSeq: 0 };

function upsert(list: CoworkMessageDTO[], incoming: CoworkMessageDTO[]) {
  const map = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.seq - b.seq);
}

export function CoworkWorkspace(props: {
  me: { id: string; name: string };
  perms: CoworkPerms;
  initialChannels: ChannelSummary[];
  people: Person[];
  initialChannelId: string | null;
  initialThreadId: string | null;
  focusMessageId: string | null;
  meetings: Meeting[];
}) {
  const { me, perms } = props;
  const router = useRouter();
  const [channels, setChannels] = React.useState(props.initialChannels);
  const [people, setPeople] = React.useState(props.people);
  const [activeId, setActiveId] = React.useState<string | null>(props.initialChannelId ?? props.initialChannels.find((c) => c.isGeneral)?.id ?? props.initialChannels[0]?.id ?? null);
  const [timelines, setTimelines] = React.useState<Record<string, Timeline>>({});
  const [pending, setPending] = React.useState<PendingMessage[]>([]);
  const [thread, setThread] = React.useState<Thread | null>(null);
  const [panel, setPanel] = React.useState<"details" | "people" | "search" | null>(null);
  const [dialog, setDialog] = React.useState<null | "channel" | "conversation" | "explore" | "members">(null);
  const [convert, setConvert] = React.useState<CoworkMessageDTO | null>(null);
  const [filter, setFilter] = React.useState("");
  const [toast, setToast] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(props.focusMessageId);
  const [mobileList, setMobileList] = React.useState(!props.initialChannelId);
  const [membersCache, setMembersCache] = React.useState<Record<string, { userId: string; name: string }[]>>({});
  const timelinesRef = React.useRef(timelines);
  timelinesRef.current = timelines;
  const activeRef = React.useRef(activeId);
  activeRef.current = activeId;
  const threadRef = React.useRef(thread);
  threadRef.current = thread;

  const active = channels.find((c) => c.id === activeId) ?? null;
  const nameOf = React.useCallback((id: string) => people.find((p) => p.id === id)?.name, [people]);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  };

  // ---------- carregamento ----------
  const refreshChannels = React.useCallback(async () => {
    try {
      const d = await fetchJson<{ channels: ChannelSummary[] }>("/api/cowork/channels");
      setChannels(d.channels);
    } catch {
      /* mantém o estado atual; o indicador de conexão já informa */
    }
  }, []);

  const loadLatest = React.useCallback(async (channelId: string) => {
    try {
      const d = await fetchJson<{ messages: CoworkMessageDTO[]; hasMore: boolean; lastSeq: number }>(`/api/cowork/channels/${channelId}/messages`);
      setTimelines((t) => ({ ...t, [channelId]: { items: d.messages, hasMore: d.hasMore, loaded: true, lastSeq: d.lastSeq } }));
    } catch (e) {
      setTimelines((t) => ({ ...t, [channelId]: { ...(t[channelId] ?? EMPTY), loaded: true, error: (e as Error).message } }));
    }
  }, []);

  /** Recupera tudo depois da última sequência conhecida (reconexão / novo aviso). Nunca duplica: mescla por id. */
  const catchUp = React.useCallback(
    async (channelId: string) => {
      const tl = timelinesRef.current[channelId];
      if (!tl?.loaded) return loadLatest(channelId);
      try {
        const d = await fetchJson<{ messages: CoworkMessageDTO[]; hasMore: boolean; lastSeq: number }>(`/api/cowork/channels/${channelId}/messages?after=${tl.lastSeq}&limit=200`);
        if (d.hasMore) return loadLatest(channelId);
        const top = d.messages.filter((m) => !m.parentId);
        const replies = d.messages.filter((m) => m.parentId);
        setTimelines((t) => {
          const cur = t[channelId] ?? EMPTY;
          return { ...t, [channelId]: { ...cur, items: upsert(cur.items, top), lastSeq: Math.max(cur.lastSeq, d.lastSeq, ...d.messages.map((m) => m.seq)) } };
        });
        const th = threadRef.current;
        if (th) {
          const mine = replies.filter((r) => r.parentId === th.rootId);
          if (mine.length) setThread((x) => (x && x.rootId === th.rootId ? { ...x, replies: upsert(x.replies, mine) } : x));
        }
      } catch {
        /* nova tentativa no próximo aviso/consulta */
      }
    },
    [loadLatest],
  );

  const refreshMessage = React.useCallback(async (channelId: string, messageId: string) => {
    try {
      const { message } = await fetchJson<{ message: CoworkMessageDTO }>(`/api/cowork/messages/${messageId}`);
      setTimelines((t) => {
        const cur = t[channelId];
        if (!cur || !cur.items.some((m) => m.id === messageId)) return t;
        return { ...t, [channelId]: { ...cur, items: cur.items.map((m) => (m.id === messageId ? message : m)) } };
      });
      setThread((x) => (x ? (x.rootId === messageId ? { ...x, root: message } : { ...x, replies: x.replies.map((r) => (r.id === messageId ? message : r)) }) : x));
    } catch {
      /* mensagem fora de alcance */
    }
  }, []);

  // ---------- tempo real ----------
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleChannels = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refreshChannels(), 350);
  }, [refreshChannels]);

  const onEvent = React.useCallback(
    (e: RealtimeEvent) => {
      const cur = activeRef.current;
      switch (e.t) {
        case "message":
          if (e.c && timelinesRef.current[e.c]?.loaded) void catchUp(e.c);
          scheduleChannels();
          break;
        case "message_updated":
          if (e.c && e.m) void refreshMessage(e.c, e.m);
          break;
        case "channel":
        case "membership":
        case "read":
          scheduleChannels();
          if (e.t === "membership" && e.c) setMembersCache((m) => { const n = { ...m }; delete n[e.c!]; return n; });
          break;
        case "meeting":
          router.refresh();
          break;
        case "resync":
          scheduleChannels();
          if (cur) void catchUp(cur);
          break;
      }
    },
    [catchUp, refreshMessage, scheduleChannels, router],
  );
  const onPoll = React.useCallback(() => {
    void refreshChannels();
    if (activeRef.current) void catchUp(activeRef.current);
  }, [refreshChannels, catchUp]);
  const connection = useCoworkRealtime(onEvent, onPoll);

  // ---------- canal ativo ----------
  React.useEffect(() => {
    if (!activeId) return;
    if (!timelinesRef.current[activeId]?.loaded) void loadLatest(activeId);
    const url = new URL(window.location.href);
    url.searchParams.set("c", activeId);
    url.searchParams.delete("m");
    url.searchParams.delete("t");
    window.history.replaceState(null, "", url.toString());
    if (!membersCache[activeId]) {
      fetchJson<{ members: { userId: string; name: string }[] }>(`/api/cowork/channels/${activeId}/members`).then((d) => setMembersCache((m) => ({ ...m, [activeId]: d.members })), () => undefined);
    }
  }, [activeId, loadLatest, membersCache]);

  React.useEffect(() => {
    if (props.initialThreadId) void openThread(props.initialThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marca como lido quando a conversa está aberta e a aba visível.
  const tl = activeId ? (timelines[activeId] ?? EMPTY) : EMPTY;
  const maxSeq = tl.items.reduce((n, m) => Math.max(n, m.seq), 0);
  React.useEffect(() => {
    if (!active || !maxSeq || maxSeq <= active.lastReadSeq) return;
    const t = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      void markReadAction(active.id, maxSeq).then(() => setChannels((cs) => cs.map((c) => (c.id === active.id ? { ...c, unread: 0, mentions: 0, lastReadSeq: maxSeq } : c))));
    }, 600);
    return () => clearTimeout(t);
  }, [active, maxSeq]);

  // Rolagem: fixa no fim quando chegam mensagens e a pessoa já estava no fim.
  const scroller = React.useRef<HTMLDivElement>(null);
  const atBottom = React.useRef(true);
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current && !focusId) el.scrollTop = el.scrollHeight;
  }, [tl.items.length, pending.length, activeId, focusId]);

  const loadOlder = async () => {
    if (!activeId || !tl.items.length) return;
    const el = scroller.current;
    const before = tl.items[0]!.seq;
    const prevHeight = el?.scrollHeight ?? 0;
    const d = await fetchJson<{ messages: CoworkMessageDTO[]; hasMore: boolean }>(`/api/cowork/channels/${activeId}/messages?before=${before}`).catch(() => null);
    if (!d) return;
    setTimelines((t) => {
      const cur = t[activeId] ?? EMPTY;
      return { ...t, [activeId]: { ...cur, items: upsert(cur.items, d.messages), hasMore: d.hasMore } };
    });
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  };

  // ---------- envio ----------
  const deliver = React.useCallback(
    async (p: PendingMessage) => {
      setPending((list) => list.map((x) => (x.nonce === p.nonce ? { ...x, status: "sending", error: undefined } : x)));
      const payload = { body: p.body, clientNonce: p.nonce, parentId: p.parentId, mentionedIds: p.mentionedIds, resources: p.resources.map((r) => ({ kind: r.kind, resourceId: r.resourceId })) };
      try {
        let res: { message: CoworkMessageDTO };
        if (p.files.length) {
          const fd = new FormData();
          fd.set("payload", JSON.stringify(payload));
          for (const f of p.files) fd.append("files", f);
          res = await fetchJson(`/api/cowork/channels/${p.channelId}/messages`, { method: "POST", body: fd });
        } else {
          res = await fetchJson(`/api/cowork/channels/${p.channelId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        }
        const msg = res.message;
        setPending((list) => list.filter((x) => x.nonce !== p.nonce));
        if (msg.parentId) setThread((x) => (x && x.rootId === msg.parentId ? { ...x, replies: upsert(x.replies, [msg]) } : x));
        else setTimelines((t) => { const cur = t[p.channelId] ?? EMPTY; return { ...t, [p.channelId]: { ...cur, items: upsert(cur.items, [msg]), lastSeq: Math.max(cur.lastSeq, msg.seq) } }; });
      } catch (e) {
        const status = (e as { status?: number }).status;
        // Erro de rede (sem status) ou 5xx: pode ser reenviado com o MESMO identificador, sem risco de duplicar.
        setPending((list) => list.map((x) => (x.nonce === p.nonce ? { ...x, status: "failed", error: status && status < 500 ? (e as Error).message : "Falha de conexão. Toque em reenviar." } : x)));
      }
    },
    [],
  );

  React.useEffect(() => {
    const onOnline = () => setPending((list) => { list.filter((x) => x.status === "failed" && !x.error?.includes("permiss")).forEach((x) => void deliver(x)); return list; });
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [deliver]);

  // Envio em fila por conversa: a ordem em que a pessoa escreveu é a ordem gravada (sequência) no servidor.
  const queues = React.useRef(new Map<string, Promise<void>>());
  const send = (channelId: string, parentId: string | null, s: ComposerSubmit) => {
    atBottom.current = true;
    const p: PendingMessage = { nonce: newNonce(), channelId, parentId, body: s.body, files: s.files, resources: s.resources, mentionedIds: s.mentionedIds, status: "sending", createdAt: new Date().toISOString() };
    setPending((list) => [...list, p]);
    const prev = queues.current.get(channelId) ?? Promise.resolve();
    const next = prev.then(() => deliver(p));
    queues.current.set(channelId, next);
  };

  const onEdit = async (m: CoworkMessageDTO, body: string) => {
    const r = await editMessageAction(m.id, body);
    if (!r.ok) { flash(r.message ?? "Não foi possível editar."); return false; }
    await refreshMessage(m.channelId, m.id);
    return true;
  };
  const onDelete = async (m: CoworkMessageDTO) => {
    if (!window.confirm("Excluir esta mensagem? O texto e os anexos deixam de ficar disponíveis.")) return;
    const r = await deleteMessageAction(m.id);
    if (!r.ok) flash(r.message ?? "Não foi possível excluir.");
    else await refreshMessage(m.channelId, m.id);
  };

  async function openThread(rootId: string) {
    setThread({ rootId, root: null, replies: [], loading: true });
    setPanel(null);
    try {
      const d = await fetchJson<{ root: CoworkMessageDTO; replies: CoworkMessageDTO[] }>(`/api/cowork/messages/${rootId}/thread`);
      setThread({ rootId, root: d.root, replies: d.replies, loading: false });
    } catch (e) {
      flash((e as Error).message);
      setThread(null);
    }
  }

  const selectChannel = (id: string) => {
    setActiveId(id);
    setThread(null);
    setFocusId(null);
    setMobileList(false);
    atBottom.current = true;
  };

  const openCreated = async (id: string) => {
    setDialog(null);
    await refreshChannels();
    selectChannel(id);
  };

  // ---------- render ----------
  const visible = channels.filter((c) => !filter || c.name.toLowerCase().includes(filter.toLowerCase()));
  const groups: { key: string; title: string; items: ChannelSummary[]; action?: React.ReactNode }[] = [
    {
      key: "channels",
      title: "Canais",
      items: visible.filter((c) => c.kind === "CHANNEL"),
      action: (
        <span className="flex items-center gap-0.5">
          <button type="button" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Explorar canais" title="Explorar canais" onClick={() => setDialog("explore")}><Search className="h-3.5 w-3.5" aria-hidden /></button>
          {perms.channels ? <button type="button" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Novo canal" title="Novo canal" onClick={() => setDialog("channel")} data-testid="cowork-new-channel"><Plus className="h-3.5 w-3.5" aria-hidden /></button> : null}
        </span>
      ),
    },
    {
      key: "dm",
      title: "Conversas",
      items: visible.filter((c) => c.kind !== "CHANNEL"),
      action: perms.write ? <button type="button" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Nova conversa" title="Nova conversa direta ou em grupo" onClick={() => setDialog("conversation")} data-testid="cowork-new-conversation"><Plus className="h-3.5 w-3.5" aria-hidden /></button> : null,
    },
  ];
  const activeMembers = activeId ? (membersCache[activeId] ?? []) : [];
  const threadPending = thread ? pending.filter((p) => p.parentId === thread.rootId) : [];
  const timelinePending = activeId ? pending.filter((p) => p.channelId === activeId && !p.parentId) : [];
  const peer = active?.peerId ? people.find((p) => p.id === active.peerId) : null;

  return (
    <div className="flex h-full min-h-0 bg-bg" data-testid="cowork-workspace">
      {/* Lista de conversas */}
      <aside className={cn("flex w-full shrink-0 flex-col border-r border-border bg-surface md:w-72", !mobileList && "hidden md:flex")} aria-label="Conversas do Cowork">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-base font-semibold"><MessagesSquare className="h-4.5 w-4.5 text-primary-text" aria-hidden /> Cowork</h1>
            <ConnectionDot state={connection} />
          </div>
          <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-border bg-bg/45 px-2.5">
            <Search className="h-3.5 w-3.5 text-muted" aria-hidden />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar conversas" aria-label="Filtrar conversas" className="h-8 w-full bg-transparent text-sm outline-none" />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Lista de conversas">
          {groups.map((g) => (
            <div key={g.key} className="mb-3">
              <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
                <span>{g.title}</span>
                {g.action}
              </div>
              {g.items.length === 0 ? <p className="px-2 py-1 text-xs text-muted">{g.key === "dm" ? "Nenhuma conversa ainda." : "Nenhum canal."}</p> : null}
              {g.items.map((c) => (
                <ChannelRow key={c.id} c={c} active={c.id === activeId} onClick={() => selectChannel(c.id)} />
              ))}
            </div>
          ))}
          <div className="mt-2 space-y-0.5 border-t border-border pt-2">
            <SideLink href="/cowork/reunioes" icon={CalendarClock} label="Reuniões" />
            <button type="button" onClick={() => { setPanel("people"); setThread(null); setMobileList(false); }} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"><Users className="h-4 w-4" aria-hidden /> Pessoas</button>
            <button type="button" onClick={() => { setPanel("search"); setThread(null); setMobileList(false); }} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] text-muted hover:bg-surface-2 hover:text-fg" data-testid="cowork-open-search"><Search className="h-4 w-4" aria-hidden /> Buscar mensagens</button>
            {perms.insights ? <SideLink href="/cowork/painel" icon={BarChart3} label="Painel do trabalho" /> : null}
            <SideLink href="/cowork/configuracoes" icon={Settings2} label={perms.manage ? "Configurações" : "Meu perfil"} />
          </div>
        </nav>
      </aside>

      {/* Área central */}
      <section className={cn("flex min-w-0 flex-1 flex-col", mobileList && "hidden md:flex")} aria-label="Conversa">
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <MessagesSquare className="h-10 w-10 text-muted" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">Escolha uma conversa</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">Converse com a equipe em canais, grupos e mensagens diretas. O atendimento a clientes continua em Conversas (WhatsApp), separado daqui.</p>
          </div>
        ) : (
          <>
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-5">
              <button type="button" className="rounded-md p-1.5 text-muted hover:bg-surface-2 md:hidden" aria-label="Voltar para a lista" onClick={() => setMobileList(true)}><ArrowLeft className="h-4 w-4" aria-hidden /></button>
              <ChannelIcon c={active} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold" data-testid="cowork-channel-title">{active.name}</h2>
                <p className="truncate text-xs text-muted">
                  {active.kind === "DIRECT"
                    ? peer ? [peer.jobTitle, peer.departmentLabel, peer.availability ? AVAILABILITY_LABEL[peer.availability] : null, WORK_STATE_LABEL[peer.workState]].filter(Boolean).join(" · ") : "Conversa direta"
                    : [active.topic, `${active.memberCount} participante(s)`, active.caseId ? "Sala de processo" : null, active.archived ? "Arquivado" : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-0.5">
                {perms.meetings && !active.archived ? (
                  <Link href={`/cowork/reunioes/nova?canal=${active.id}`} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg" title="Agendar reunião" aria-label="Agendar reunião nesta conversa"><CalendarClock className="h-4 w-4" aria-hidden /></Link>
                ) : null}
                {active.kind !== "DIRECT" ? (
                  <button type="button" className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg" title="Participantes" aria-label="Participantes" onClick={() => setDialog("members")}><Users className="h-4 w-4" aria-hidden /></button>
                ) : null}
                <button type="button" className={cn("rounded-md p-2 hover:bg-surface-2 hover:text-fg", panel === "details" ? "text-fg" : "text-muted")} title="Detalhes" aria-label="Detalhes da conversa" onClick={() => { setThread(null); setPanel(panel === "details" ? null : "details"); }}><Info className="h-4 w-4" aria-hidden /></button>
              </div>
            </header>
            <ConnectionBanner state={connection} onRetry={onPoll} />
            <div
              ref={scroller}
              className="min-h-0 flex-1 overflow-y-auto pb-3"
              onScroll={(e) => {
                const el = e.currentTarget;
                atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              aria-live="polite"
              aria-relevant="additions"
              data-testid="cowork-timeline"
            >
              {!tl.loaded ? (
                <p className="p-8 text-center text-sm text-muted">Carregando mensagens…</p>
              ) : tl.error ? (
                <div className="p-8 text-center text-sm text-danger">{tl.error} <button type="button" className="underline" onClick={() => void loadLatest(active.id)}>Tentar de novo</button></div>
              ) : (
                <>
                  {tl.hasMore ? (
                    <div className="py-3 text-center"><button type="button" className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-surface-2" onClick={() => void loadOlder()}>Carregar mensagens anteriores</button></div>
                  ) : (
                    <div className="px-6 pb-2 pt-8">
                      <ChannelIcon c={active} big />
                      <p className="mt-2 text-lg font-semibold">{active.kind === "DIRECT" ? active.name : active.kind === "GROUP" ? active.name : `#${active.name}`}</p>
                      <p className="text-sm text-muted">{active.kind === "DIRECT" ? "Início da conversa direta. Só vocês dois veem estas mensagens." : active.topic ?? "Início do histórico desta conversa."}</p>
                    </div>
                  )}
                  {tl.items.map((m, i) => {
                    const prev = tl.items[i - 1];
                    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                    const compact = !newDay && !!prev && prev.author.id === m.author.id && prev.author.kind === m.author.kind && m.author.kind !== "SYSTEM" && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
                    const firstUnread = active.lastReadSeq > 0 && prev && prev.seq <= active.lastReadSeq && m.seq > active.lastReadSeq && m.author.id !== me.id;
                    return (
                      <React.Fragment key={m.id}>
                        {newDay ? <DayDivider iso={m.createdAt} /> : null}
                        {firstUnread ? <div className="mx-6 my-1 flex items-center gap-2 text-[11px] font-medium text-primary-text"><span className="h-px flex-1 bg-primary/40" />Novas<span className="h-px flex-1 bg-primary/40" /></div> : null}
                        <MessageItem
                          message={m}
                          compact={compact}
                          highlight={focusId === m.id}
                          meId={me.id}
                          nameOf={nameOf}
                          onReply={(x) => void openThread(x.id)}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onConvert={(perms.tasksWrite || perms.agendaWrite) && !active.archived ? setConvert : undefined}
                        />
                      </React.Fragment>
                    );
                  })}
                  {timelinePending.map((p) => <PendingRow key={p.nonce} p={p} me={me} onRetry={() => void deliver(p)} onDiscard={() => setPending((l) => l.filter((x) => x.nonce !== p.nonce))} />)}
                </>
              )}
            </div>
            <Composer
              key={active.id}
              placeholder={active.kind === "DIRECT" ? `Mensagem para ${active.name}` : `Mensagem em ${active.kind === "GROUP" ? active.name : `#${active.name}`}`}
              members={activeMembers.filter((m) => m.userId !== me.id)}
              canShare={perms.share}
              disabled={!perms.write || active.archived}
              disabledReason={active.archived ? "Conversa arquivada: histórico somente para leitura." : "Seu perfil pode ler, mas não enviar mensagens no Cowork."}
              onSend={(s) => send(active.id, null, s)}
            />
          </>
        )}
      </section>

      {/* Painel contextual */}
      {thread || panel ? (
        <aside className="fixed inset-0 z-30 flex flex-col border-l border-border bg-surface lg:static lg:z-auto lg:w-[360px] lg:shrink-0" aria-label={thread ? "Thread" : "Painel"}>
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <h2 className="text-sm font-semibold">{thread ? "Thread" : panel === "people" ? "Pessoas" : panel === "search" ? "Buscar mensagens" : "Detalhes"}</h2>
            <button type="button" className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Fechar painel" onClick={() => { setThread(null); setPanel(null); }}><X className="h-4 w-4" aria-hidden /></button>
          </div>
          {thread ? (
            <div className="flex min-h-0 flex-1 flex-col" data-testid="cowork-thread">
              <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                {thread.loading || !thread.root ? <p className="p-6 text-center text-sm text-muted">Carregando…</p> : (
                  <>
                    <MessageItem message={thread.root} compact={false} meId={me.id} nameOf={nameOf} inThread onEdit={onEdit} onDelete={onDelete} />
                    <div className="mx-4 my-2 flex items-center gap-2 text-[11px] text-muted"><span className="h-px flex-1 bg-border" />{thread.replies.length} resposta(s)<span className="h-px flex-1 bg-border" /></div>
                    {thread.replies.map((r, i) => <MessageItem key={r.id} message={r} compact={i > 0 && thread.replies[i - 1]?.author.id === r.author.id && r.author.kind !== "SYSTEM"} meId={me.id} nameOf={nameOf} inThread onEdit={onEdit} onDelete={onDelete} />)}
                    {threadPending.map((p) => <PendingRow key={p.nonce} p={p} me={me} onRetry={() => void deliver(p)} onDiscard={() => setPending((l) => l.filter((x) => x.nonce !== p.nonce))} />)}
                  </>
                )}
              </div>
              {thread.root && active ? (
                <Composer key={thread.rootId} placeholder="Responder na thread" members={activeMembers.filter((m) => m.userId !== me.id)} canShare={perms.share} disabled={!perms.write || active.archived} disabledReason="Somente leitura." onSend={(s) => send(thread.root!.channelId, thread.rootId, s)} autoFocus testId="cowork-thread-composer" />
              ) : null}
            </div>
          ) : panel === "people" ? (
            <PeoplePanel people={people} meId={me.id} canDirect={perms.write && perms.allowDirect} onOpened={openCreated} onRefresh={async () => { const d = await fetchJson<{ people: Person[] }>("/api/cowork/people").catch(() => null); if (d) setPeople(d.people); }} />
          ) : panel === "search" ? (
            <SearchPanel onOpen={(r) => { selectChannel(r.channelId); if (r.parentId) void openThread(r.parentId); else setFocusId(r.id); }} />
          ) : active ? (
            <DetailsPanel
              channel={active}
              meetings={props.meetings}
              onMembers={() => setDialog("members")}
              onMute={async () => { const r = await muteChannelAction(active.id, !active.muted); if (r.ok) await refreshChannels(); }}
              onLeave={async () => { if (!window.confirm("Sair desta conversa?")) return; const r = await leaveChannelAction(active.id); if (r.ok) { setPanel(null); await refreshChannels(); setActiveId(channels.find((c) => c.isGeneral)?.id ?? null); } else flash(r.message ?? "Falha."); }}
              onArchive={async () => { const r = await archiveChannelAction(active.id, !active.archived); if (r.ok) await refreshChannels(); else flash(r.message ?? "Falha."); }}
            />
          ) : null}
        </aside>
      ) : null}

      {dialog === "channel" ? <NewChannelDialog people={people} meId={me.id} perms={perms} onClose={() => setDialog(null)} onCreated={openCreated} /> : null}
      {dialog === "conversation" ? <NewConversationDialog people={people} meId={me.id} perms={perms} onClose={() => setDialog(null)} onOpened={openCreated} /> : null}
      {dialog === "explore" ? <ExploreDialog onClose={() => setDialog(null)} onJoined={openCreated} /> : null}
      {dialog === "members" && active ? <MembersDialog channelId={active.id} canManage={active.canManage && !active.archived} people={people} onClose={() => setDialog(null)} onChanged={() => void refreshChannels()} /> : null}
      {convert ? <ConvertDialog message={convert} people={people} perms={perms} onClose={() => setConvert(null)} onDone={(t) => { setConvert(null); flash(t); }} /> : null}
      {toast ? <div role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-surface px-4 py-2 text-sm shadow-lg" data-testid="cowork-toast">{toast}</div> : null}
    </div>
  );
}

function SideLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return <Link href={href} className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"><Icon className="h-4 w-4" aria-hidden /> {label}</Link>;
}

function ChannelIcon({ c, big }: { c: ChannelSummary; big?: boolean }) {
  const size = big ? "h-10 w-10" : "h-7 w-7";
  if (c.kind === "DIRECT") return <PersonAvatar id={c.peerId} name={c.name} size={big ? 40 : 28} />;
  const color = isCoworkDepartment(c.department) ? COWORK_DEPARTMENT_COLOR[c.department] : undefined;
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted", size)} style={color ? { color, background: `${color}1a` } : undefined}>
      {c.kind === "GROUP" ? <Users className="h-4 w-4" aria-hidden /> : c.visibility === "PRIVATE" ? <Lock className="h-4 w-4" aria-hidden /> : <Hash className="h-4 w-4" aria-hidden />}
    </span>
  );
}

function ChannelRow({ c, active, onClick }: { c: ChannelSummary; active: boolean; onClick: () => void }) {
  const bold = c.unread > 0 && !c.muted;
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={cn("flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px]", active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")} data-testid="cowork-channel-row" data-channel-name={c.name}>
      {c.kind === "DIRECT" ? <PersonAvatar id={c.peerId} name={c.name} size={20} /> : c.kind === "GROUP" ? <Users className="h-4 w-4 shrink-0" aria-hidden /> : c.visibility === "PRIVATE" ? <Lock className="h-4 w-4 shrink-0" aria-hidden /> : <Hash className="h-4 w-4 shrink-0" aria-hidden />}
      <span className={cn("flex-1 truncate", bold && "font-semibold text-fg")}>{c.name}</span>
      {c.muted ? <BellOff className="h-3.5 w-3.5 text-muted" aria-label="Silenciada" /> : null}
      {c.mentions > 0 ? <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-fg" aria-label={`${c.mentions} menções`}>@{c.mentions}</span> : c.unread > 0 && !c.muted ? <span className="rounded-full bg-primary/15 px-1.5 text-[11px] tabular-nums text-primary-text" aria-label={`${c.unread} não lidas`} data-testid="cowork-unread">{c.unread}</span> : null}
    </button>
  );
}

function DayDivider({ iso }: { iso: string }) {
  return <div className="mx-4 my-3 flex items-center gap-3 text-[11px] font-medium text-muted sm:mx-6"><span className="h-px flex-1 bg-border" /><span className="capitalize">{formatDay(iso)}</span><span className="h-px flex-1 bg-border" /></div>;
}

function PendingRow({ p, me, onRetry, onDiscard }: { p: PendingMessage; me: { id: string; name: string }; onRetry: () => void; onDiscard: () => void }) {
  return (
    <div className="flex gap-3 px-4 pt-3 opacity-80 sm:px-6" data-testid="cowork-pending" data-status={p.status}>
      <PersonAvatar id={me.id} name={me.name} size={36} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2"><span className="text-sm font-semibold">{me.name}</span><span className="text-[11px] text-muted">{formatTime(p.createdAt)}</span></div>
        {p.body ? <p className="whitespace-pre-wrap break-words text-sm">{p.body}</p> : null}
        {p.files.length || p.resources.length ? <p className="text-xs text-muted">{[p.files.length ? `${p.files.length} arquivo(s)` : null, p.resources.length ? `${p.resources.length} item(ns) compartilhado(s)` : null].filter(Boolean).join(" · ")}</p> : null}
        {p.status === "sending" ? <p className="text-[11px] text-muted">Enviando…</p> : (
          <p className="text-[11px] text-danger" role="alert">{p.error ?? "Não enviada."} <button type="button" className="font-medium underline" onClick={onRetry} data-testid="cowork-retry">Reenviar</button> · <button type="button" className="underline" onClick={onDiscard}>Descartar</button></p>
        )}
      </div>
    </div>
  );
}

function ConnectionDot({ state }: { state: string }) {
  const label = state === "live" ? "Tempo real conectado" : state === "offline" ? "Sem conexão" : state === "polling" ? "Atualização periódica" : "Conectando";
  return <span className="flex items-center gap-1.5 text-[11px] text-muted" title={label} data-testid="cowork-connection" data-state={state}><span className={cn("h-2 w-2 rounded-full", state === "live" ? "bg-success" : state === "offline" ? "bg-danger" : "bg-warning")} aria-hidden /><span className="sr-only sm:not-sr-only">{state === "live" ? "Ao vivo" : state === "offline" ? "Offline" : "Reconectando"}</span></span>;
}

function ConnectionBanner({ state, onRetry }: { state: string; onRetry: () => void }) {
  if (state === "live" || state === "connecting") return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-bg px-4 py-1.5 text-xs text-warning" role="status">
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      {state === "offline" ? "Você está sem internet. As mensagens não enviadas ficam guardadas para reenviar." : "Tempo real indisponível: atualizando a cada 15 segundos enquanto reconectamos."}
      <button type="button" className="inline-flex items-center gap-1 underline" onClick={onRetry}><RefreshCw className="h-3 w-3" aria-hidden /> Atualizar agora</button>
    </div>
  );
}

function DetailsPanel({ channel, meetings, onMembers, onMute, onLeave, onArchive }: { channel: ChannelSummary; meetings: Meeting[]; onMembers: () => void; onMute: () => void; onLeave: () => void; onArchive: () => void }) {
  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Sobre</h3>
        <p className="mt-1">{channel.topic ?? (channel.kind === "DIRECT" ? "Conversa direta entre duas pessoas." : "Sem assunto definido.")}</p>
        <p className="mt-1 text-xs text-muted">{channel.kind === "CHANNEL" ? (channel.visibility === "PUBLIC" ? "Canal público do escritório" : "Canal privado") : channel.kind === "GROUP" ? "Grupo privado" : "Conversa direta"}{channel.caseId ? " · ligado a processo (acesso exige ver o processo)" : ""}</p>
        {channel.caseId ? <Link className="mt-1 inline-block text-xs text-accent-text underline" href={`/processos/${channel.caseId}`}>Abrir processo</Link> : null}
      </section>
      <section className="space-y-1">
        {channel.kind !== "DIRECT" ? <button type="button" onClick={onMembers} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"><Users className="h-4 w-4 text-muted" aria-hidden /> {channel.memberCount} participante(s)</button> : null}
        <button type="button" onClick={onMute} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"><BellOff className="h-4 w-4 text-muted" aria-hidden /> {channel.muted ? "Reativar avisos" : "Silenciar"}</button>
        {channel.kind !== "DIRECT" && !channel.isGeneral ? <button type="button" onClick={onLeave} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"><LogOut className="h-4 w-4 text-muted" aria-hidden /> Sair da conversa</button> : null}
        {channel.canManage && !channel.isGeneral ? <button type="button" onClick={onArchive} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2" data-testid="cowork-archive"><Archive className="h-4 w-4 text-muted" aria-hidden /> {channel.archived ? "Reabrir conversa" : "Arquivar (mantém o histórico)"}</button> : null}
      </section>
      <section>
        <h3 className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">Próximas reuniões <Link href="/cowork/reunioes" className="font-normal normal-case underline">ver todas</Link></h3>
        {meetings.length === 0 ? <p className="mt-1 text-xs text-muted">Nenhuma reunião agendada para você.</p> : (
          <ul className="mt-1 space-y-1">
            {meetings.slice(0, 5).map((m) => (
              <li key={m.id}><Link href={`/cowork/reunioes/${m.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"><Video className="h-4 w-4 text-muted" aria-hidden /><span className="min-w-0 flex-1 truncate">{m.title}</span><span className="text-xs text-muted">{m.date.split("-").reverse().slice(0, 2).join("/")} {m.startTime}</span></Link></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PeoplePanel({ people, meId, canDirect, onOpened, onRefresh }: { people: Person[]; meId: string; canDirect: boolean; onOpened: (id: string) => void; onRefresh: () => Promise<void> }) {
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => void onRefresh(), [onRefresh]);
  const list = people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoa" aria-label="Buscar pessoa" className="h-9 w-full rounded-lg border border-border bg-bg/45 px-3 text-sm focus:border-primary focus:outline-none" /></div>
      <p className="px-4 pb-2 text-[11px] text-muted">O estado de trabalho vem de tarefas, compromissos e reuniões com presença registrada — não de estar online.</p>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {list.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <PersonAvatar id={p.id} name={p.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}{p.id === meId ? " (você)" : ""}</p>
              <p className="truncate text-xs text-muted">{[p.jobTitle, p.departmentLabel, p.roleName].filter(Boolean).join(" · ")}</p>
              <p className="truncate text-[11px] text-muted">{WORK_STATE_LABEL[p.workState]}{p.availability ? ` · ${AVAILABILITY_LABEL[p.availability]}${p.availabilityNote ? ` (${p.availabilityNote})` : ""}` : ""}</p>
            </div>
            {canDirect && p.id !== meId ? (
              <button type="button" disabled={busy === p.id} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2" onClick={async () => { setBusy(p.id); const { openDirectAction } = await import("./actions"); const r = await openDirectAction(p.id); setBusy(null); if (r.ok && r.data) onOpened(r.data.id); }}>Mensagem</button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchPanel({ onOpen }: { onOpen: (r: { id: string; channelId: string; parentId: string | null }) => void }) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<{ id: string; channelId: string; parentId: string | null; channelName: string; channelKind: string; authorName: string; excerpt: string; createdAt: string }[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (q.trim().length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      fetchJson<{ results: NonNullable<typeof results> }>(`/api/cowork/search?q=${encodeURIComponent(q)}`).then((d) => alive && setResults(d.results), () => alive && setResults([])).finally(() => alive && setLoading(false));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const shown = q.trim().length < 2 ? null : results;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas suas conversas" aria-label="Buscar nas suas conversas" className="h-9 w-full rounded-lg border border-border bg-bg/45 px-3 text-sm focus:border-primary focus:outline-none" data-testid="cowork-search-input" /></div>
      <p className="px-4 pb-2 text-[11px] text-muted">A busca cobre só as conversas de que você participa.</p>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" aria-busy={loading}>
        {shown?.length === 0 ? <li className="p-6 text-center text-xs text-muted">Nada encontrado.</li> : null}
        {shown?.map((r) => (
          <li key={r.id}>
            <button type="button" className="w-full px-4 py-2.5 text-left hover:bg-surface-2" onClick={() => onOpen(r)} data-testid="cowork-search-result">
              <span className="flex items-center justify-between text-[11px] text-muted"><span className="truncate">{r.channelKind === "CHANNEL" ? `#${r.channelName}` : r.channelName} · {r.authorName}</span><span>{new Date(r.createdAt).toLocaleDateString("pt-BR")}</span></span>
              <span className="mt-0.5 block text-sm">{r.excerpt}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

