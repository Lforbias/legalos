"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { deleteAutomationAction, saveAutomationAction, setAutomationActiveAction } from "./actions";
import { CHAT_ACTION_LABEL, CHAT_TRIGGER_LABEL, CHAT_TRIGGERS, PLACEHOLDER_HINT, type ChatAction, type ChatActionType, type ChatTrigger } from "./automation-schema";

type Opt = { id: string; name: string };
export type AutomationView = { id: string; name: string; trigger: ChatTrigger; triggerValue: string | null; actions: ChatAction[]; oncePerConversation: boolean; active: boolean; runs: number };
export type RunView = { id: string; status: string; message: string | null; createdAt: string; automation: string; who: string };
type Draft = { type: ChatActionType; labelId: string; queueId: string; userId: string; title: string; dueDays: string; assigneeId: string; text: string };
type Msg = { tone: "error" | "success"; text: string } | null;

const blank = (type: ChatActionType = "ADD_LABEL"): Draft => ({ type, labelId: "", queueId: "", userId: "", title: "", dueDays: "1", assigneeId: "", text: "" });
const toDraft = (a: ChatAction): Draft => ({ ...blank(a.type), ...(a.type === "ADD_LABEL" ? { labelId: a.labelId } : a.type === "TRANSFER_QUEUE" ? { queueId: a.queueId } : a.type === "ASSIGN" || a.type === "NOTIFY" ? { userId: a.userId } : a.type === "CREATE_TASK" ? { title: a.title, dueDays: String(a.dueDays), assigneeId: a.assigneeId ?? "" } : { text: a.text }) });
const fromDraft = (d: Draft): unknown => {
  switch (d.type) {
    case "ADD_LABEL": return { type: d.type, labelId: d.labelId };
    case "TRANSFER_QUEUE": return { type: d.type, queueId: d.queueId };
    case "ASSIGN": case "NOTIFY": return { type: d.type, userId: d.userId };
    case "CREATE_TASK": return { type: d.type, title: d.title, dueDays: Number(d.dueDays) || 0, assigneeId: d.assigneeId || null };
    case "SEND_REPLY": return { type: d.type, text: d.text };
  }
};
function errText(r: { message?: string; fieldErrors?: Record<string, string[] | undefined> }, fallback: string): string {
  const f = r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "";
  if (r.message && r.message !== "Corrija os campos destacados.") return r.message;
  return f || r.message || fallback;
}

export function AutomationsPanel({ automations, labels, queues, agents, runs }: { automations: AutomationView[]; labels: Opt[]; queues: Opt[]; agents: Opt[]; runs: RunView[] }) {
  const router = useRouter();
  const empty = { name: "", trigger: "NEW_CONVERSATION" as ChatTrigger, triggerValue: "", once: true, active: false, actions: [blank()] };
  const [editing, setEditing] = React.useState<string | null>(null);
  const [v, setV] = React.useState(empty);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const name = (list: Opt[], id: string) => list.find((o) => o.id === id)?.name ?? "(removido)";
  const summary = (a: ChatAction) => {
    switch (a.type) {
      case "ADD_LABEL": return `etiqueta “${name(labels, a.labelId)}”`;
      case "TRANSFER_QUEUE": return `fila “${name(queues, a.queueId)}”`;
      case "ASSIGN": return `atribuir a ${name(agents, a.userId)}`;
      case "CREATE_TASK": return `tarefa “${a.title}”`;
      case "SEND_REPLY": return "responder ao cliente";
      case "NOTIFY": return `avisar ${name(agents, a.userId)}`;
    }
  };
  const edit = (a: AutomationView | null) => {
    setEditing(a?.id ?? null);
    setV(a ? { name: a.name, trigger: a.trigger, triggerValue: a.trigger === "KEYWORD" ? (a.triggerValue ?? "") : (a.triggerValue ?? ""), once: a.oncePerConversation, active: a.active, actions: a.actions.map(toDraft) } : empty);
    setMsg(null);
  };
  const setAction = (i: number, patch: Partial<Draft>) => setV({ ...v, actions: v.actions.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const picker = (value: string, onChange: (x: string) => void, list: Opt[], label: string, blankText: string) => (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{blankText}</option>
      {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </Select>
  );
  const types = (Object.keys(CHAT_ACTION_LABEL) as ChatActionType[]).filter((t) => !(v.trigger === "LABEL_ADDED" && t === "SEND_REPLY"));

  return (
    <div className="space-y-4" data-testid="automations-panel">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {automations.length === 0 ? <p className="text-sm text-muted">Nenhuma automação. Exemplo: “chegou mensagem com a palavra audiência → etiqueta Urgente + tarefa para o responsável”.</p> : null}
      {automations.map((a) => (
        <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-2 text-sm">
          <div className="min-w-0">
            <div className="font-medium">{a.name}{a.active ? "" : " · desligada"}</div>
            <p className="text-xs text-muted">
              {CHAT_TRIGGER_LABEL[a.trigger]}
              {a.trigger === "KEYWORD" ? `: ${a.triggerValue}` : a.trigger === "LABEL_ADDED" ? `: “${name(labels, a.triggerValue ?? "")}”` : ""}
              {" → "}{a.actions.map(summary).join(" + ")}
            </p>
            <p className="text-xs text-muted">{a.oncePerConversation ? "Uma vez por conversa" : "Em toda ocorrência"} · executou {a.runs}×</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => { const r = await setAutomationActiveAction(a.id, !a.active); setMsg(r.ok ? null : { tone: "error", text: errText(r, "Erro.") }); router.refresh(); })}>{a.active ? "Desligar" : "Ligar"}</Button>
            <Button size="sm" variant="secondary" onClick={() => edit(a)}>Editar</Button>
            <Button size="sm" variant="danger" loading={pending} onClick={() => { if (window.confirm("Excluir a automação?")) start(async () => { const r = await deleteAutomationAction(a.id); setMsg(r.ok ? null : { tone: "error", text: errText(r, "Erro.") }); router.refresh(); }); }}>Excluir</Button>
          </div>
        </div>
      ))}

      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="text-sm font-medium">{editing ? "Editar automação" : "Nova automação"}</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nome da automação" htmlFor="au-name"><Input id="au-name" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Quando" htmlFor="au-trigger">
            <Select id="au-trigger" value={v.trigger} onChange={(e) => { const t = e.target.value as ChatTrigger; setV({ ...v, trigger: t, triggerValue: "", actions: t === "LABEL_ADDED" ? v.actions.filter((a) => a.type !== "SEND_REPLY") : v.actions }); }}>
              {CHAT_TRIGGERS.map((t) => <option key={t} value={t}>{CHAT_TRIGGER_LABEL[t]}</option>)}
            </Select>
          </Field>
          {v.trigger === "KEYWORD" ? <Field label="Palavras (separe por vírgula)" htmlFor="au-kw" hint="Acha mesmo sem acento ou maiúscula. Ex.: audiência, prazo, urgente"><Input id="au-kw" value={v.triggerValue} onChange={(e) => setV({ ...v, triggerValue: e.target.value })} /></Field> : null}
          {v.trigger === "LABEL_ADDED" ? <Field label="Etiqueta" htmlFor="au-label">{picker(v.triggerValue, (x) => setV({ ...v, triggerValue: x }), labels, "Etiqueta", "Escolha…")}</Field> : null}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Então fazer</div>
          {v.actions.map((d, i) => (
            <div key={i} className="grid gap-2 rounded-md bg-surface-2 p-2 md:grid-cols-[220px_1fr_auto] md:items-start" data-testid="au-action">
              <Select aria-label={`Ação ${i + 1}`} value={d.type} onChange={(e) => setAction(i, { ...blank(e.target.value as ChatActionType) })}>
                {types.map((t) => <option key={t} value={t}>{CHAT_ACTION_LABEL[t]}</option>)}
              </Select>
              <div className="space-y-2">
                {d.type === "ADD_LABEL" ? picker(d.labelId, (x) => setAction(i, { labelId: x }), labels, "Etiqueta da ação", "Escolha a etiqueta…") : null}
                {d.type === "TRANSFER_QUEUE" ? picker(d.queueId, (x) => setAction(i, { queueId: x }), queues, "Fila da ação", "Escolha a fila…") : null}
                {d.type === "ASSIGN" || d.type === "NOTIFY" ? picker(d.userId, (x) => setAction(i, { userId: x }), agents, "Membro da ação", "Escolha a pessoa…") : null}
                {d.type === "CREATE_TASK" ? (
                  <>
                    <Input aria-label="Título da tarefa da ação" placeholder="Ex.: Ligar para {{contato}}" value={d.title} onChange={(e) => setAction(i, { title: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input aria-label="Prazo em dias" type="number" min={0} max={365} value={d.dueDays} onChange={(e) => setAction(i, { dueDays: e.target.value })} />
                      {picker(d.assigneeId, (x) => setAction(i, { assigneeId: x }), agents, "Responsável da tarefa", "Responsável pela conversa")}
                    </div>
                    <p className="text-xs text-muted">Prazo: dias a partir de hoje. {PLACEHOLDER_HINT}</p>
                  </>
                ) : null}
                {d.type === "SEND_REPLY" ? (
                  <>
                    <Textarea aria-label="Texto da resposta" rows={3} maxLength={1000} value={d.text} onChange={(e) => setAction(i, { text: e.target.value })} />
                    <p className="text-xs text-muted">Enviada pelo WhatsApp como resposta automática (no máximo 3 a cada 10 minutos por conversa). {PLACEHOLDER_HINT}</p>
                  </>
                ) : null}
              </div>
              <Button size="sm" variant="secondary" disabled={v.actions.length <= 1} onClick={() => setV({ ...v, actions: v.actions.filter((_, j) => j !== i) })}>Remover</Button>
            </div>
          ))}
          {v.actions.length < 5 ? <Button size="sm" variant="secondary" onClick={() => setV({ ...v, actions: [...v.actions, blank("NOTIFY")] })}>Adicionar ação</Button> : null}
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.once} onChange={(e) => setV({ ...v, once: e.target.checked })} /> Rodar só uma vez por conversa (recomendado)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Ligada</label>
        </div>
        <div className="flex gap-2">
          <Button loading={pending} onClick={() => start(async () => {
            const r = await saveAutomationAction(editing, { name: v.name, trigger: v.trigger, triggerValue: v.trigger === "NEW_CONVERSATION" || v.trigger === "OUTSIDE_HOURS" ? null : v.triggerValue, actions: v.actions.map(fromDraft), oncePerConversation: v.once, active: v.active });
            if (r.ok) { edit(null); setMsg({ tone: "success", text: "Automação salva." }); } else setMsg({ tone: "error", text: errText(r, "Não foi possível salvar.") });
            router.refresh();
          })}>{editing ? "Salvar automação" : "Criar automação"}</Button>
          {editing ? <Button variant="secondary" onClick={() => edit(null)}>Cancelar</Button> : null}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-sm font-medium">Últimas execuções</div>
        {runs.length === 0 ? <p className="text-xs text-muted">Nada executado ainda.</p> : null}
        <ul className="space-y-1 text-xs" data-testid="au-runs">
          {runs.map((r) => (
            <li key={r.id} className="rounded-md border border-border px-2 py-1">
              <span className="font-medium">{r.automation}</span> · {r.who} · {new Date(r.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {r.status === "DONE" ? "" : r.status === "PARTIAL" ? " · parcial" : " · falhou"}
              <div className="text-muted">{r.message}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
