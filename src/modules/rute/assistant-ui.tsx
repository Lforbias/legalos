"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowUp, ArrowUpRight, Check, Copy, CalendarDays, Clock3, ListTodo, Search, Sparkles, Plus, ChevronDown } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { InlineProposal } from "./inline-proposal";
import { createConversationAction, deleteConversationAction, sendMessageAction } from "./actions";

export type Msg = { id: string; role: string; content: string; refs: { type: string; name?: string; id?: string; title?: string; ok?: boolean; resourceType?: string }[] };
const STARTERS = [
  { label: "Organizar meu dia", prompt: "RUTE, organiza meu dia: liste minhas tarefas, compromissos e prazos de hoje, com os links para abrir cada item.", icon: CalendarDays },
  { label: "Prazos da semana", prompt: "Quais prazos vencem nos próximos 7 dias? Separe por data e mostre o processo relacionado.", icon: Clock3 },
  { label: "Minhas pendências", prompt: "Quais tarefas minhas estão atrasadas ou aguardando alguma ação?", icon: ListTodo },
  { label: "Buscar no escritório", prompt: "Quero localizar um cliente, processo ou tarefa. Quais informações você precisa?", icon: Search },
];

const CREATION_STARTERS = [
  { label: "Preparar um atendimento", prompt: "Quero preparar um atendimento. Primeiro me ajude a localizar o cliente e reunir as pendências, antes de criar qualquer registro.", icon: Search },
  { label: "Criar uma tarefa", prompt: "Quero criar uma tarefa. Me ajude a definir o cliente, o processo, o responsável e a data antes de salvar.", icon: Plus },
  { label: "Agendar uma reunião", prompt: "Quero agendar uma reunião. Vamos definir cliente, data, horário e contexto antes de salvar.", icon: CalendarDays },
];
function actionHref(name?: string, id?: string, resourceType?: string) {
  if (!id) return null;
  if (resourceType === "lead") return `/crm/${id}`;
  if (resourceType === "template") return `/documentos/modelos/${id}`;
  if (resourceType === "snippet") return `/documentos/autotextos/${id}`;
  if (resourceType?.startsWith("finance_")) return "/financeiro/cadastros";
  if (resourceType === "time_entry") return "/equipe";
  if (name?.includes("tarefa")) return `/tarefas/${id}`;
  if (name?.includes("cliente")) return `/clientes/${id}`;
  if (name?.includes("processo")) return `/processos/${id}`;
  if (name?.includes("compromisso")) return `/agenda/${id}`;
  return null;
}
function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return <button type="button" aria-label="Copiar resposta" className="inline-flex items-center gap-1 rounded-md p-1 text-[11px] text-muted hover:bg-surface-2" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }}>{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied ? "Copiado" : "Copiar"}</button>;
}

export function RuteSetup({ reason }: { reason: string }) {
  return <section className="mx-auto max-w-lg space-y-6 py-6 sm:py-10">
    <span className="grid h-14 w-14 place-items-center rounded-2xl border border-primary/20 bg-primary/5 text-primary-text"><Sparkles className="h-6 w-6" /></span>
    <div className="space-y-3"><p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Seu escritório, em perspectiva</p><h3 className="text-3xl font-medium leading-tight tracking-tight">Um novo ritmo<br />para o seu trabalho.</h3><p className="text-sm leading-relaxed text-muted">Prepare a RUTE para reunir informações e ajudar a transformar suas decisões em próximos passos.</p></div>
    <div className="grid grid-cols-3 gap-3 border-y border-border py-5">{[["Entender", "Clientes e processos"], ["Organizar", "Agenda e pendências"], ["Agir", "Criações e alterações"]].map(([title, detail]) => <div key={title}><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p></div>)}</div>
    <div className="rounded-xl border border-border bg-surface-2/40 p-4"><p className="text-sm font-medium">Conexão pendente</p><p className="mt-2 text-xs leading-relaxed text-muted">{reason}</p></div>
    <a href="/rute?aba=situacao" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg">Preparar minha RUTE<ArrowUpRight className="h-4 w-4" /></a>
  </section>;
}

export function Chat({ conversationId, caseId, clientId, messages, contextLabel, embedded = false, onConversationCreated }: { conversationId: string | null; caseId: string | null; clientId: string | null; messages: Msg[]; contextLabel: string | null; embedded?: boolean; onConversationCreated?: (id: string) => void }) {
  const [text, setText] = React.useState("");
  const [local, setLocal] = React.useState<Msg[]>([]);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [convId, setConvId] = React.useState(conversationId);
  const [mode, setMode] = React.useState<"consult" | "act">("consult");
  const attempt = React.useRef<{ text: string; mode: string; id: string } | null>(null);
  const all = [...messages, ...local];
  const end = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [local.length, pending]);
  const input = React.useRef<HTMLTextAreaElement>(null);

  const send = () =>
    start(async () => {
      const q = text.trim();
      if (q.length < 2) return;
      setError(null);
      let id = convId;
      if (!id) {
        const c = await createConversationAction({ caseId, clientId });
        if (!c.ok || !c.data) return setError(c.message ?? "Não foi possível abrir a conversa.");
        id = c.data.id;
        setConvId(id);
      }
      if (!attempt.current || attempt.current.text !== q || attempt.current.mode !== mode) attempt.current = { text: q, mode, id: crypto.randomUUID() };
      let r: Awaited<ReturnType<typeof sendMessageAction>>;
      try {
        r = await sendMessageAction(id, q, { mode, requestId: attempt.current.id });
      } catch {
        return setError("A conexão foi interrompida. Tente novamente com o mesmo texto e modo para consultar o resultado deste envio, sem repetir a execução.");
      }
      if (!r.ok || !r.data) return setError(r.message ?? "Não foi possível responder agora.");
      setLocal((cur) => [...cur, { id: `u${cur.length}`, role: "user", content: q, refs: [] }, { id: `a${cur.length}`, role: "assistant", content: r.data!.answer, refs: r.data!.refs }]);
      setText("");
      attempt.current = null;
      if (!conversationId && embedded) onConversationCreated?.(id);
      if (!conversationId && !embedded) window.history.replaceState(null, "", `/rute?aba=assistente&c=${id}`);
    });

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col gap-3" : "space-y-3"}>
      <div role="group" aria-label="Tipo de pedido" className="inline-flex gap-1 rounded-full border border-border bg-surface p-1">{([["consult", "Consultar"], ["act", "Criar e alterar"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} disabled={pending} onClick={() => setMode(key)} className={`rounded-full px-3 py-1.5 text-xs transition ${mode === key ? "bg-fg text-surface" : "text-muted hover:bg-surface-2"}`}>{label}</button>)}</div>
      {contextLabel ? <Alert tone="info">Conversa sobre: {contextLabel}. A IA só alcança o que você pode ver.</Alert> : null}
      <div className={embedded ? "min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl bg-surface-2/30 p-3 sm:p-4" : "max-h-[28rem] space-y-3 overflow-y-auto rounded-md border border-border p-3"}>
        {all.length === 0 ? <section className="mx-auto w-full max-w-xl space-y-7 py-4 sm:py-7" aria-label="Comece uma conversa com a RUTE">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-primary-text"><Sparkles className="h-3.5 w-3.5" />Inteligência a serviço do seu escritório</span>
            <h3 className="max-w-md text-3xl font-medium leading-tight tracking-tight sm:text-4xl">Menos dispersão.<br /><span className="text-muted">Mais clareza para agir.</span></h3>
            <p className="max-w-md text-sm leading-relaxed text-muted">Conecte as informações do cliente ao próximo passo do trabalho. Consulte, organize e coloque suas decisões em movimento.</p>
          </div>
          <div className="space-y-3">

            <div className="grid gap-2 sm:grid-cols-2">{(mode === "act" ? CREATION_STARTERS : STARTERS).map(({ label, prompt, icon: Icon }) => <button key={label} type="button" onClick={() => { setText(prompt); input.current?.focus(); }} className="group flex min-h-16 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden /><span className="flex-1">{label}</span><ArrowUpRight className="h-3.5 w-3.5 text-muted transition group-hover:text-primary-text" aria-hidden /></button>)}</div>
          </div>
          <p className="text-xs leading-relaxed text-muted">Ao pedir uma criação ou alteração, a RUTE pode salvar diretamente. Para conferir antes, peça uma proposta.</p>
        </section> : null}
        {all.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm ${m.role === "user" ? "bg-primary text-primary-fg" : "bg-surface-2"}`}>{m.content}</div>
            {m.role === "assistant" && m.refs.some(r => r.type === "tool") ? <details className="mt-2 text-[11px] text-muted"><summary className="inline-flex cursor-pointer items-center gap-1">Fontes e atividades <ChevronDown className="h-3 w-3" /></summary><div className="mt-2 flex flex-wrap gap-1">{m.refs.filter(r => r.type === "tool").map((r, i) => <Badge key={i} tone={r.ok ? "neutral" : "warning"}>{r.name?.replaceAll("_", " ")}{r.ok ? "" : " · não concluído"}</Badge>)}</div></details> : null}
            {m.role === "assistant" ? m.refs.filter(r => r.type === "action" && r.id).map((r, i) => { const href = actionHref(r.name, r.id, r.resourceType); return <div key={`action-${i}`} className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs" role="status"><Check className="h-4 w-4 text-primary-text" /><div className="min-w-0 flex-1"><p className="font-medium">Ação concluída</p><p className="mt-1 text-muted">{r.title ?? r.name}</p></div>{href ? <a href={href} className="inline-flex items-center gap-1 font-medium text-primary-text">Abrir registro<ArrowUpRight className="h-3 w-3" /></a> : <span className="max-w-full break-all font-mono text-muted">{r.id}</span>}</div>; }) : null}
            {m.role === "assistant" ? <div className="mt-1"><CopyAnswer text={m.content} /></div> : null}
            {m.role === "assistant" ? m.refs.filter(r => r.type === "proposal" && r.id).map(r => <InlineProposal key={r.id} id={r.id!} />) : null}
          </div>
        ))}
        {pending ? <p role="status" className="flex items-center gap-2 py-3 text-xs text-muted"><Sparkles className="h-4 w-4 motion-safe:animate-pulse" />A RUTE está trabalhando no seu pedido…</p> : null}
        <div ref={end} />
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className={embedded ? "shrink-0 rounded-xl border border-border bg-surface p-2 shadow-sm focus-within:border-primary/60" : "space-y-2"}>
        <div className={embedded ? "flex items-end gap-2" : "space-y-2"}>
          <Textarea ref={input} autoFocus={embedded} aria-label="Mensagem para a RUTE" rows={embedded ? 2 : 3} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (text.trim().length >= 2 && !pending) send(); } }} maxLength={4000} placeholder="O que vamos resolver agora?" className={embedded ? "min-h-12 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0" : ""} />
          {embedded ? <Button aria-label="Enviar mensagem" size="icon" loading={pending} disabled={text.trim().length < 2} onClick={send} className="mb-0.5 h-9 w-9 shrink-0 rounded-lg"><ArrowUp className="h-4 w-4" aria-hidden /></Button> : null}
        </div>
        {!embedded ? <Button loading={pending} disabled={text.trim().length < 2} onClick={send}>Enviar</Button> : null}
      </div>
      {embedded ? <p className="shrink-0 px-1 text-[11px] text-muted">Enter envia · Shift+Enter pula linha · CPF, CNPJ e e-mails são ocultados antes do envio</p> : null}
    </div>
  );
}

export function DeleteConversation({ id }: { id: string }) {
  const router = useRouter();
  const { run, pending } = useRun();
  return <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => deleteConversationAction(id), undefined, () => router.push("/rute?aba=assistente"))}>Apagar</Button>;
}
