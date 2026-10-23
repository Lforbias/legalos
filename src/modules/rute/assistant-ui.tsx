"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { createConversationAction, deleteConversationAction, sendMessageAction } from "./actions";

export type Msg = { id: string; role: string; content: string; refs: { type: string; name?: string; id?: string; title?: string; ok?: boolean }[] };
const SUGGESTIONS = ["O que preciso fazer hoje?", "Quais prazos vencem nos próximos 7 dias?", "Resuma as intimações novas.", "Quais tarefas minhas estão atrasadas?"];

export function Chat({ conversationId, caseId, clientId, messages, contextLabel, embedded = false, onConversationCreated }: { conversationId: string | null; caseId: string | null; clientId: string | null; messages: Msg[]; contextLabel: string | null; embedded?: boolean; onConversationCreated?: (id: string) => void }) {
  const [text, setText] = React.useState("");
  const [local, setLocal] = React.useState<Msg[]>([]);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [convId, setConvId] = React.useState(conversationId);
  const all = [...messages, ...local];

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
      <div className={embedded ? "min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg bg-surface-2/40 p-3" : "max-h-[28rem] space-y-3 overflow-y-auto rounded-md border border-border p-3"}>
        {all.length === 0 ? <p className="text-center text-sm text-muted">Pergunte algo sobre o escritório. Eu consulto e proponho; nada é feito sem a sua confirmação.</p> : null}
        {all.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm ${m.role === "user" ? "bg-primary text-primary-fg" : "bg-surface-2"}`}>{m.content}</div>
            {m.role === "assistant" && m.refs.length ? (
              <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
                {m.refs.filter((r) => r.type === "tool").map((r, i) => <Badge key={i} tone={r.ok ? "neutral" : "warning"}>{r.name}</Badge>)}
                {m.refs.filter((r) => r.type === "proposal").map((r) => <Link key={r.id} href="/rute?aba=propostas" className="underline">Proposta: {r.title}</Link>)}
              </p>
            ) : null}
          </div>
        ))}
        {pending ? <p className="text-xs text-muted">Consultando…</p> : null}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!embedded || all.length === 0 ? <div className="flex shrink-0 flex-wrap gap-1">
        {SUGGESTIONS.map((s) => <Button key={s} size="sm" variant="ghost" onClick={() => setText(s)}>{s}</Button>)}
      </div> : null}
      <Textarea autoFocus={embedded} aria-label="Mensagem para a RUTE" rows={embedded ? 2 : 3} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Escreva a sua pergunta (CPF, CNPJ e e-mails são ocultados antes de sair)" />
      <Button loading={pending} disabled={text.trim().length < 2} onClick={send}>Enviar</Button>
    </div>
  );
}

export function DeleteConversation({ id }: { id: string }) {
  const router = useRouter();
  const { run, pending } = useRun();
  return <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => deleteConversationAction(id), undefined, () => router.push("/rute?aba=assistente"))}>Apagar</Button>;
}
