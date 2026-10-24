"use client";
import * as React from "react";
import Link from "next/link";
import { Bot, X, Plus, Settings2, ArrowUpRight } from "lucide-react";
import { Chat, type Msg } from "./assistant-ui";
import { assistantPanelAction } from "./actions";
type Panel = NonNullable<Awaited<ReturnType<typeof assistantPanelAction>>["data"]>;
export function AssistantLauncher({ raised = false }: { raised?: boolean }) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
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
    <button ref={trigger} type="button" aria-label="Abrir RUTE" aria-haspopup="dialog" aria-expanded={open} onClick={show} className={`fixed ${raised ? "bottom-24" : "bottom-5"} right-5 z-30 inline-flex h-10 items-center gap-2 rounded-full border border-primary/40 bg-primary px-3.5 text-sm font-medium text-primary-fg shadow-lg transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-reduce:transition-none`}><Bot className="h-4 w-4" aria-hidden />RUTE</button>
    <dialog ref={dialog} aria-labelledby="rute-panel-title" onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }} onClose={() => { setOpen(false); trigger.current?.focus(); }} className="fixed inset-auto bottom-3 right-3 z-40 m-0 h-[min(740px,calc(100dvh-24px))] max-h-none w-[min(420px,calc(100vw-24px))] max-w-none overflow-hidden rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl">
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3"><span className="rounded-xl bg-primary/10 p-2 text-primary-text"><Bot className="h-5 w-5" aria-hidden /></span><div className="flex-1"><h2 id="rute-panel-title" className="text-sm font-semibold">RUTE</h2><p className="text-xs text-muted">Sua assistente no LegalOS</p></div><Link href="/rute?aba=situacao" aria-label="Configurações da RUTE" onClick={close} className="rounded-md p-2 text-muted hover:bg-surface-2"><Settings2 className="h-4 w-4" /></Link><button type="button" aria-label="Fechar RUTE" onClick={close} className="rounded-md p-2 text-muted hover:bg-surface-2"><X className="h-4 w-4" /></button></header>
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2"><select aria-label="Conversas da RUTE" value={selected} disabled={loading} onChange={e => { setGeneration(g => g + 1); void load(e.target.value); }} className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs"><option value="">Nova conversa</option>{data?.conversations.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select><button type="button" aria-label="Nova conversa com a RUTE" onClick={() => { setSelected(""); setGeneration(g => g + 1); void load(); }} className="rounded-md p-2 text-muted hover:bg-surface-2"><Plus className="h-4 w-4" /></button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? <p role="status" className="text-sm text-muted">Abrindo conversa…</p> : error ? <div role="alert" className="space-y-3 text-sm"><p>{error}</p><button className="underline" onClick={() => void load(selected)}>Tentar novamente</button></div> : data ? data.availability.available ? <Chat key={`${generation}:${data.conversation?.id ?? "new"}`} embedded onConversationCreated={id => { setSelected(id); setData(prev => prev ? { ...prev, conversations: prev.conversations.some(c => c.id === id) ? prev.conversations : [{ id, title: "Conversa atual" }, ...prev.conversations] } : prev); }} conversationId={data.conversation?.id ?? null} caseId={data.conversation?.caseId ?? null} clientId={data.conversation?.clientId ?? null} contextLabel={null} messages={(data.conversation?.messages ?? []) as Msg[]} /> : <div className="space-y-4 py-8"><h3 className="text-lg font-medium">Vamos preparar sua assistente</h3><p className="text-sm leading-relaxed text-muted">{data.availability.reason}</p><Link onClick={close} href="/rute?aba=situacao" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-fg">Configurar RUTE<ArrowUpRight className="h-4 w-4" /></Link><p className="text-xs text-muted">Ao habilitar a IA, suas conversas ficam disponíveis aqui, sem sair da página em que está trabalhando.</p></div> : null}
        </div>
        <footer className="shrink-0 border-t border-border px-4 py-2 text-[11px] text-muted">A RUTE consulta e propõe. Você confirma as alterações.</footer>
      </div>
    </dialog>
  </>;
}
