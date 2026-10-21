"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { saveBotAction } from "./actions";
import { BOT_TEMPLATE, menuText, type BotOption } from "./bot-schema";

type Opt = { id: string; name: string };
export type BotView = { enabled: boolean; greeting: string; invalidText: string; handoffText: string; options: BotOption[] } | null;
type Q = { text: string; fieldId: string };
type D = { label: string; reply: string; labelId: string; queueId: string; assignId: string; notifyId: string; taskTitle: string; taskDays: string; questions: Q[] };
type Msg = { tone: "error" | "success"; text: string } | null;

const blank = (): D => ({ label: "", reply: "", labelId: "", queueId: "", assignId: "", notifyId: "", taskTitle: "", taskDays: "1", questions: [] });
const toDraft = (o: BotOption): D => {
  const d = blank();
  d.label = o.label; d.reply = o.reply;
  for (const a of o.actions) {
    if (a.type === "ADD_LABEL") d.labelId = a.labelId;
    else if (a.type === "TRANSFER_QUEUE") d.queueId = a.queueId;
    else if (a.type === "ASSIGN") d.assignId = a.userId;
    else if (a.type === "NOTIFY") d.notifyId = a.userId;
    else if (a.type === "CREATE_TASK") { d.taskTitle = a.title; d.taskDays = String(a.dueDays); }
  }
  d.questions = o.questions.map((q) => ({ text: q.text, fieldId: q.fieldId ?? "" }));
  return d;
};
const fromDraft = (d: D) => ({
  label: d.label,
  reply: d.reply,
  actions: [
    ...(d.labelId ? [{ type: "ADD_LABEL", labelId: d.labelId }] : []),
    ...(d.queueId ? [{ type: "TRANSFER_QUEUE", queueId: d.queueId }] : []),
    ...(d.assignId ? [{ type: "ASSIGN", userId: d.assignId }] : []),
    ...(d.taskTitle.trim() ? [{ type: "CREATE_TASK", title: d.taskTitle, dueDays: Number(d.taskDays) || 0, assigneeId: null }] : []),
    ...(d.notifyId ? [{ type: "NOTIFY", userId: d.notifyId }] : []),
  ],
  questions: d.questions.map((q) => ({ text: q.text, fieldId: q.fieldId || null })),
});
function errText(r: { message?: string; fieldErrors?: Record<string, string[] | undefined> }, fallback: string): string {
  const f = r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "";
  if (r.message && r.message !== "Corrija os campos destacados.") return r.message;
  return f || r.message || fallback;
}

export function BotPanel({ bot, labels, queues, agents, fields }: { bot: BotView; labels: Opt[]; queues: Opt[]; agents: Opt[]; fields: Opt[] }) {
  const router = useRouter();
  const [v, setV] = React.useState(() => ({
    enabled: bot?.enabled ?? false,
    greeting: bot?.greeting ?? "Olá! Como podemos ajudar?",
    invalidText: bot?.invalidText ?? "Não entendi. Responda com o número de uma das opções.",
    handoffText: bot?.handoffText ?? "Obrigado! Um atendente vai continuar a conversa com você em instantes.",
    options: (bot?.options ?? []).map(toDraft),
  }));
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const setOpt = (i: number, patch: Partial<D>) => setV({ ...v, options: v.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const pick = (value: string, onChange: (x: string) => void, list: Opt[], label: string, blankText: string) => (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{blankText}</option>
      {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </Select>
  );
  const useTemplate = () => {
    setV({
      ...BOT_TEMPLATE,
      enabled: false,
      options: BOT_TEMPLATE.options.map((o) => ({ ...blank(), label: o.label, reply: o.reply, questions: o.questions.map((t) => ({ text: t, fieldId: "" })) })),
    });
    setMsg({ tone: "success", text: "Modelo carregado. Revise os textos, escolha etiquetas/filas se quiser e clique em Salvar." });
  };

  return (
    <div className="space-y-4" data-testid="bot-panel">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Alert tone="info">
        É um menu fixo escrito por vocês (sem inteligência artificial). Chega conversa nova, o cliente recebe o menu e responde com o número. Quando uma pessoa responde, o robô se cala sozinho. As respostas do pré-atendimento ficam numa nota da conversa e, se escolher um campo, no campo personalizado.
      </Alert>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} /> Menu de triagem ligado</label>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Mensagem de boas-vindas" htmlFor="bt-greet"><Textarea id="bt-greet" rows={2} maxLength={600} value={v.greeting} onChange={(e) => setV({ ...v, greeting: e.target.value })} /></Field>
        <Field label="Quando o cliente digita algo inválido" htmlFor="bt-inv"><Textarea id="bt-inv" rows={2} maxLength={300} value={v.invalidText} onChange={(e) => setV({ ...v, invalidText: e.target.value })} /></Field>
        <Field label="Mensagem ao passar para um atendente" htmlFor="bt-hand"><Textarea id="bt-hand" rows={2} maxLength={600} value={v.handoffText} onChange={(e) => setV({ ...v, handoffText: e.target.value })} /></Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Opções do menu ({v.options.length}/8)</div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={useTemplate}>Usar modelo para escritório de advocacia</Button>
            {v.options.length < 8 ? <Button size="sm" variant="secondary" onClick={() => setV({ ...v, options: [...v.options, blank()] })}>Adicionar opção</Button> : null}
          </div>
        </div>
        {v.options.map((o, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border p-3 text-sm" data-testid="bt-option">
            <div className="flex items-end gap-2">
              <span className="pb-2 font-medium">{i + 1}.</span>
              <div className="flex-1"><Field label="Texto da opção" htmlFor={`bt-l-${i}`}><Input id={`bt-l-${i}`} value={o.label} maxLength={60} onChange={(e) => setOpt(i, { label: e.target.value })} /></Field></div>
              <Button size="sm" variant="danger" onClick={() => setV({ ...v, options: v.options.filter((_, j) => j !== i) })}>Remover</Button>
            </div>
            <Field label="Resposta ao escolher (opcional)" htmlFor={`bt-r-${i}`}><Textarea id={`bt-r-${i}`} rows={2} maxLength={1000} value={o.reply} onChange={(e) => setOpt(i, { reply: e.target.value })} /></Field>
            <div className="grid gap-2 md:grid-cols-2">
              {pick(o.labelId, (x) => setOpt(i, { labelId: x }), labels, `Etiqueta da opção ${i + 1}`, "Sem etiqueta")}
              {pick(o.queueId, (x) => setOpt(i, { queueId: x }), queues, `Fila da opção ${i + 1}`, "Sem mudar de fila")}
              {pick(o.assignId, (x) => setOpt(i, { assignId: x }), agents, `Atribuir da opção ${i + 1}`, "Sem atribuir a ninguém")}
              {pick(o.notifyId, (x) => setOpt(i, { notifyId: x }), agents, `Avisar da opção ${i + 1}`, "Sem avisar ninguém")}
              <Input aria-label={`Tarefa da opção ${i + 1}`} placeholder="Criar tarefa (título; deixe vazio para não criar)" value={o.taskTitle} onChange={(e) => setOpt(i, { taskTitle: e.target.value })} />
              <Input aria-label={`Prazo da tarefa da opção ${i + 1}`} type="number" min={0} max={365} value={o.taskDays} onChange={(e) => setOpt(i, { taskDays: e.target.value })} />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium">Perguntas do pré-atendimento ({o.questions.length}/5)</div>
              {o.questions.map((q, k) => (
                <div key={k} className="grid gap-2 md:grid-cols-[1fr_220px_auto]">
                  <Input aria-label={`Pergunta ${k + 1} da opção ${i + 1}`} value={q.text} maxLength={300} onChange={(e) => setOpt(i, { questions: o.questions.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} />
                  {pick(q.fieldId, (x) => setOpt(i, { questions: o.questions.map((y, j) => (j === k ? { ...y, fieldId: x } : y)) }), fields, `Campo da pergunta ${k + 1} da opção ${i + 1}`, "Só guardar na nota")}
                  <Button size="sm" variant="secondary" onClick={() => setOpt(i, { questions: o.questions.filter((_, j) => j !== k) })}>Remover</Button>
                </div>
              ))}
              {o.questions.length < 5 ? <Button size="sm" variant="secondary" onClick={() => setOpt(i, { questions: [...o.questions, { text: "", fieldId: "" }] })}>Adicionar pergunta</Button> : null}
            </div>
          </div>
        ))}
      </div>

      {v.options.length > 0 ? (
        <div>
          <div className="text-xs font-medium">Como o cliente vai ver</div>
          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-xs" data-testid="bt-preview">{menuText(v.greeting, v.options.map((o) => ({ label: o.label || "…" })))}</pre>
        </div>
      ) : null}

      <Button loading={pending} onClick={() => start(async () => {
        const r = await saveBotAction({ enabled: v.enabled, greeting: v.greeting, invalidText: v.invalidText, handoffText: v.handoffText, options: v.options.map(fromDraft) });
        setMsg(r.ok ? { tone: "success", text: "Menu de triagem salvo." } : { tone: "error", text: errText(r, "Não foi possível salvar.") });
        router.refresh();
      })}>Salvar menu de triagem</Button>
    </div>
  );
}
