"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { analyzeSessionAction, approveSessionAction, createSessionAction, deleteSessionAction } from "./actions";

export function NewSessionForm({ cases, clients }: { cases: { id: string; label: string }[]; clients: { id: string; label: string }[] }) {
  const router = useRouter();
  const { run, pending, error } = useRun();
  const [text, setText] = React.useState("");
  const [audioMsg, setAudioMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function sendAudio(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setAudioMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const r = await fetch("/api/copiloto/audio", { method: "POST", body: fd });
      const j = (await r.json()) as { text?: string; error?: string };
      if (!r.ok || !j.text) setAudioMsg(j.error ?? "Não foi possível transcrever.");
      else setText((t) => (t ? `${t}\n\n${j.text}` : j.text!));
    } catch {
      setAudioMsg("Não foi possível transcrever.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => createSessionAction({ title: fd.get("title"), transcript: text, clientId: fd.get("clientId"), caseId: fd.get("caseId") }), undefined, (d) => d && router.push(`/copiloto/${d.id}`));
      }}
    >
      <Field label="Título do atendimento" htmlFor="cp-t"><Input id="cp-t" name="title" required maxLength={160} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cliente (opcional)" htmlFor="cp-c"><Select id="cp-c" name="clientId" defaultValue=""><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
        <Field label="Processo (opcional)" htmlFor="cp-p"><Select id="cp-p" name="caseId" defaultValue=""><option value="">—</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      </div>
      <Field label="Transcrição" htmlFor="cp-x" hint="Cole o texto do Plaud, Meet ou outro. Ou envie o áudio abaixo para transcrever (usa Gemini; só envia quando você escolhe o arquivo).">
        <Textarea id="cp-x" rows={10} value={text} onChange={(e) => setText(e.target.value)} required />
      </Field>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="text-muted">Áudio (até 10 MB): <input type="file" accept="audio/*" disabled={busy} onChange={(e) => void sendAudio(e.target.files?.[0])} /></label>
        {busy ? <span className="text-muted">Transcrevendo…</span> : null}
      </div>
      {audioMsg ? <Alert tone="error">{audioMsg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="submit" loading={pending}>Salvar atendimento</Button>
    </form>
  );
}

type Act = { title: string; basis: string };
type Tsk = { title: string; description: string; priority: string; created?: string | null };
type Doc = { name: string; why: string };

export function SessionView({ id, status, summary, actions, tasks, documents, canAi, aiReason, canTasks, members }: { id: string; status: string; summary: string | null; actions: Act[]; tasks: Tsk[]; documents: Doc[]; canAi: boolean; aiReason: string | null; canTasks: boolean; members: { id: string; name: string }[] }) {
  const router = useRouter();
  const { run, pending, error } = useRun();
  const [sum, setSum] = React.useState(summary ?? "");
  const [picked, setPicked] = React.useState<number[]>([]);
  const [assignee, setAssignee] = React.useState("");
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  return (
    <div className="space-y-4 text-sm">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {status === "DRAFT" ? (
        <div className="space-y-2">
          {!canAi ? <Alert tone="warning">{aiReason}</Alert> : null}
          <Button loading={pending} disabled={!canAi} onClick={() => run(() => analyzeSessionAction(id))}>Analisar com IA</Button>
          <p className="text-xs text-muted">A IA lê a transcrição (dados sensíveis são mascarados) e devolve um rascunho. Nada é criado nem enviado sem a sua revisão.</p>
        </div>
      ) : (
        <>
          <Alert tone="warning">Rascunho gerado por IA. Confira com o que foi dito no atendimento antes de usar. Nada é enviado ao cliente.</Alert>
          <div>
            <p className="mb-1 font-medium">Resumo</p>
            <Textarea aria-label="Resumo" rows={5} value={sum} disabled={status === "REVIEWED"} onChange={(e) => setSum(e.target.value)} />
          </div>
          <div>
            <p className="mb-1 font-medium">Ações que podem caber</p>
            {actions.length === 0 ? <p className="text-muted">Nenhuma sugerida.</p> : null}
            <ul className="space-y-2">{actions.map((a, i) => <li key={i} className="rounded-lg border border-border p-2"><p className="font-medium">{a.title}</p><p className="text-xs text-muted">{a.basis}</p></li>)}</ul>
          </div>
          <div>
            <p className="mb-1 font-medium">Tarefas sugeridas</p>
            {tasks.length === 0 ? <p className="text-muted">Nenhuma sugerida.</p> : null}
            <ul className="space-y-2">
              {tasks.map((t, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg border border-border p-2">
                  {status === "ANALYZED" && canTasks ? <input type="checkbox" aria-label={`Criar tarefa: ${t.title}`} checked={picked.includes(i)} onChange={() => toggle(i)} className="mt-1" /> : null}
                  <div><p className="font-medium">{t.title} <Badge tone={t.priority === "URGENT" || t.priority === "HIGH" ? "danger" : "neutral"}>{t.priority}</Badge>{t.created ? <> <Badge tone="success">Criada</Badge></> : null}</p><p className="text-xs text-muted">{t.description}</p></div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium">Documentos sugeridos</p>
            {documents.length === 0 ? <p className="text-muted">Nenhum sugerido.</p> : null}
            <ul className="list-disc space-y-1 pl-5">{documents.map((d, i) => <li key={i}><span className="font-medium">{d.name}</span> <span className="text-xs text-muted">— {d.why}</span></li>)}</ul>
          </div>
          {status === "ANALYZED" ? (
            <div className="space-y-2 border-t border-border pt-3">
              {canTasks ? (
                <Field label="Responsável pelas tarefas marcadas" htmlFor="cp-a"><Select id="cp-a" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Sem responsável</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button loading={pending} onClick={() => run(() => approveSessionAction(id, { taskIndexes: picked, assigneeId: assignee, summary: sum }))}>{picked.length ? `Revisei: criar ${picked.length} tarefa(s)` : "Revisei e encerrar"}</Button>
                <Button variant="secondary" loading={pending} disabled={!canAi} onClick={() => run(() => analyzeSessionAction(id))}>Gerar de novo</Button>
              </div>
            </div>
          ) : <Badge tone="success">Revisado por uma pessoa</Badge>}
        </>
      )}
      <div className="border-t border-border pt-3"><Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => deleteSessionAction(id), undefined, () => router.push("/copiloto"))}>Excluir atendimento</Button></div>
    </div>
  );
}
