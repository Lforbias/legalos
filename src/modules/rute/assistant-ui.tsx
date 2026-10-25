"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowUp, CalendarDays, Clock3, ListTodo, Search, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { InlineProposal } from "./inline-proposal";
import { createConversationAction, deleteConversationAction, sendMessageAction } from "./actions";

export type Msg = { id: string; role: string; content: string; refs: { type: string; name?: string; id?: string; title?: string; ok?: boolean }[] };
const STARTERS = [
  { label: "Organizar meu dia", prompt: "RUTE, organiza meu dia: liste minhas tarefas, compromissos e prazos de hoje, com os links para abrir cada item.", icon: CalendarDays },
  { label: "Prazos da semana", prompt: "Quais prazos vencem nos próximos 7 dias? Separe por data e mostre o processo relacionado.", icon: Clock3 },
  { label: "Minhas pendências", prompt: "Quais tarefas minhas estão atrasadas ou aguardando alguma ação?", icon: ListTodo },
  { label: "Buscar no escritório", prompt: "Quero localizar um cliente, processo ou tarefa. Quais informações você precisa?", icon: Search },
];

export function Chat({ conversationId, caseId, clientId, messages, contextLabel, embedded = false, onConversationCreated }: { conversationId: string | null; caseId: string | null; clientId: string | null; messages: Msg[]; contextLabel: string | null; embedded?: boolean; onConversationCreated?: (id: string) => void }) {
  const [text, setText] = React.useState("");
  const [local, setLocal] = React.useState<Msg[]>([]);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [convId, setConvId] = React.useState(conversationId);
  const all = [...messages, ...local];
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
      const r = await sendMessageAction(id, q);
      if (!r.ok || !r.data) return setError(r.message ?? "Não foi possível responder agora.");
      setLocal((cur) => [...cur, { id: `u${cur.length}`, role: "user", content: q, refs: [] }, { id: `a${cur.length}`, role: "assistant", content: r.data!.answer, refs: r.data!.refs }]);
      setText("");
      if (!conversationId && embedded) onConversationCreated?.(id);
      if (!conversationId && !embedded) window.history.replaceState(null, "", `/rute?aba=assistente&c=${id}`);
    });

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col gap-3" : "space-y-3"}>
      {contextLabel ? <Alert tone="info">Conversa sobre: {contextLabel}. A IA só alcança o que você pode ver.</Alert> : null}
      <div className={embedded ? "min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl bg-surface-2/30 p-3 sm:p-4" : "max-h-[28rem] space-y-3 overflow-y-auto rounded-md border border-border p-3"}>
        {all.length === 0 ? <section className="space-y-4 py-2" aria-label="Comece uma conversa com a RUTE">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary-text"><Sparkles className="h-5 w-5" aria-hidden /></span>
            <div><h3 className="text-base font-semibold">Por onde começamos?</h3><p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">Posso consultar dados, criar e atualizar registros quando você pedir. Escolha um começo ou escreva do seu jeito.</p></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {STARTERS.map(({ label, prompt, icon: Icon }) => <button key={label} type="button" onClick={() => { setText(prompt); input.current?.focus(); }} className="group flex min-h-14 items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><Icon className="h-4 w-4 shrink-0 text-muted group-hover:text-primary-text" aria-hidden /><span>{label}</span><ArrowUp className="ml-auto h-3.5 w-3.5 -rotate-45 text-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden /></button>)}
          </div>
          <p className="text-xs text-muted">Pedidos de criação e alteração podem ser executados na hora, conforme seu acesso. Você também pode pedir apenas uma proposta para revisar.</p>
        </section> : null}
        {all.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm ${m.role === "user" ? "bg-primary text-primary-fg" : "bg-surface-2"}`}>{m.content}</div>
            {m.role === "assistant" && m.refs.length ? (
              <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
                {m.refs.filter((r) => r.type === "tool").map((r, i) => <Badge key={i} tone={r.ok ? "neutral" : "warning"}>{r.name}</Badge>)}
              </p>
            ) : null}
            {m.role === "assistant" ? m.refs.filter(r => r.type === "action" && r.id).map((r, i) => <p key={`action-${i}`} className="mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs" role="status">Executado: {r.title ?? r.name} · Registro: <span className="select-all font-mono">{r.id}</span></p>) : null}
            {m.role === "assistant" ? m.refs.filter(r => r.type === "proposal" && r.id).map(r => <InlineProposal key={r.id} id={r.id!} />) : null}
          </div>
        ))}
        {pending ? <p className="text-xs text-muted">Consultando…</p> : null}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className={embedded ? "shrink-0 rounded-xl border border-border bg-surface p-2 shadow-sm focus-within:border-primary/60" : "space-y-2"}>
        <div className={embedded ? "flex items-end gap-2" : "space-y-2"}>
          <Textarea ref={input} autoFocus={embedded} aria-label="Mensagem para a RUTE" rows={embedded ? 2 : 3} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (text.trim().length >= 2 && !pending) send(); } }} maxLength={4000} placeholder="Peça algo à RUTE…" className={embedded ? "min-h-12 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0" : ""} />
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
