"use client";
import * as React from "react";
import Link from "next/link";
import { Sparkles, X, Plus, Settings2, ArrowUpRight, Maximize2, Minimize2, History } from "lucide-react";
import { Chat, RuteSetup, type Msg } from "./assistant-ui";
import { assistantPanelAction } from "./actions";
type Panel = NonNullable<Awaited<ReturnType<typeof assistantPanelAction>>["data"]>;
export function AssistantLauncher({ raised = false }: { raised?: boolean }) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<Panel | null>(null);
  const [selected, setSelected] = React.useState("");
  const [generation, setGeneration] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const request = React.useRef(0);
  async function load(id = "") {
    const token = ++request.current;
    setLoading(true); setError("");
    const r = await assistantPanelAction(id || undefined);
    if (token !== request.current) return;
    setLoading(false);
    if (!r.ok || !r.data) { setError(r.message ?? "Não foi possível abrir a RUTE."); return; }
    setData(r.data); setSelected(id);
  }
  function show() { dialog.current?.show(); setOpen(true); if (!data || !data.availability.available) void load(selected); }
  function close() { dialog.current?.close(); }
  return <>
    <button ref={trigger} type="button" aria-label="Abrir RUTE" aria-haspopup="dialog" aria-expanded={open} onClick={show} className={`fixed ${raised ? "bottom-24" : "bottom-5"} right-5 z-30 inline-flex h-10 items-center gap-2 rounded-full border border-primary/40 bg-primary px-3.5 text-sm font-medium text-primary-fg shadow-lg transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-reduce:transition-none`}><Sparkles className="h-4 w-4" aria-hidden />RUTE</button>
    <dialog ref={dialog} aria-labelledby="rute-panel-title" onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }} onClose={() => { setOpen(false); trigger.current?.focus(); }} style={{ width: expanded ? "min(1040px, calc(100vw - 24px))" : undefined }} className="fixed inset-auto bottom-3 right-3 z-40 m-0 h-[min(780px,calc(100dvh-24px))] max-h-none w-[min(680px,calc(100vw-24px))] max-w-none overflow-hidden rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl">
      <div className="flex h-full flex-col">
        <header className="relative flex shrink-0 items-center gap-3 border-b border-border bg-surface-2/40 px-5 py-4">
          <span className="rute-signet grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary-text"><Sparkles className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">LegalOS Intelligence</p><h2 id="rute-panel-title" className="text-lg font-semibold tracking-tight">RUTE<span className="ml-2 text-xs font-normal text-muted">Seu espaço de trabalho</span></h2></div>
          <button type="button" aria-label="Histórico de conversas" aria-expanded={historyOpen} onClick={() => setHistoryOpen(v => !v)} className="rounded-lg p-2 text-muted hover:bg-surface-2"><History className="h-4 w-4" /></button>
          <button type="button" aria-label={expanded ? "Reduzir RUTE" : "Expandir RUTE"} onClick={() => setExpanded(v => !v)} className="hidden rounded-lg p-2 text-muted hover:bg-surface-2 sm:block">{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
          <Link href="/rute?aba=assistente" aria-label="Abrir espaço completo da RUTE" onClick={close} className="rounded-lg p-2 text-muted hover:bg-surface-2"><ArrowUpRight className="h-4 w-4" /></Link>
          <button type="button" aria-label="Fechar RUTE" onClick={close} className="rounded-lg p-2 text-muted hover:bg-surface-2"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted"><span className={`h-1.5 w-1.5 rounded-full ${data?.availability.available ? "bg-primary" : "bg-muted"}`} />{loading ? "Conectando ao escritório" : data?.availability.available ? "Conectada ao seu escritório" : "Preparar conexão"}</span>
          <button type="button" aria-label="Nova conversa com a RUTE" onClick={() => { setSelected(""); setGeneration(g => g + 1); void load(); }} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2"><Plus className="h-3.5 w-3.5" />Nova conversa</button>
        </div>
        <div className={`${historyOpen ? "block" : "hidden"} shrink-0 border-b border-border bg-surface-2/30 px-5 py-3`}>
          <label className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-muted" htmlFor="rute-history">Retomar um trabalho</label>
          <select id="rute-history" aria-label="Conversas da RUTE" value={selected} disabled={loading} onChange={e => { setGeneration(g => g + 1); void load(e.target.value); setHistoryOpen(false); }} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="">Nova conversa</option>{data?.conversations.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? <p role="status" className="text-sm text-muted">Abrindo conversa…</p> : error ? <div role="alert" className="space-y-3 text-sm"><p>{error}</p><button className="underline" onClick={() => void load(selected)}>Tentar novamente</button></div> : data ? data.availability.available ? <Chat key={`${generation}:${data.conversation?.id ?? "new"}`} embedded onConversationCreated={id => { setSelected(id); setData(prev => prev ? { ...prev, conversations: prev.conversations.some(c => c.id === id) ? prev.conversations : [{ id, title: "Conversa atual" }, ...prev.conversations] } : prev); }} conversationId={data.conversation?.id ?? null} caseId={data.conversation?.caseId ?? null} clientId={data.conversation?.clientId ?? null} contextLabel={null} messages={(data.conversation?.messages ?? []) as Msg[]} /> : <RuteSetup reason={data.availability.reason ?? "Confira a conexão de IA nas preferências da RUTE."} /> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3 text-[11px] text-muted"><span>Seu acesso. Seu contexto. Suas decisões.</span><Link onClick={close} href="/rute?aba=situacao" className="inline-flex items-center gap-1 hover:text-fg"><Settings2 className="h-3 w-3" />Preferências</Link></footer>
      </div>
    </dialog>
  </>;
}
