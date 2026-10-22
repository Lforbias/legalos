"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { approveUpdateAction, createPendingAction, discardUpdateAction, draftUpdateAction, markPendingDoneAction, replyClientAction, sendMyMessageAction, setPendingStatusAction } from "./plus-actions";

export type UpdateRow = { id: string; originalText: string; plainText: string; status: string };

/** Equipe: andamentos em linguagem simples (rascunho → revisão humana → aprovado = visível ao cliente). */
export function PlainUpdatesPanel({ caseId, rows, canWrite, shared }: { caseId: string; rows: UpdateRow[]; canWrite: boolean; shared: boolean }) {
  const { run, pending, error } = useRun();
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      {!shared ? <Alert tone="warning">Este processo não está compartilhado com o portal. Os textos aprovados só aparecem ao cliente depois que você compartilhar o processo.</Alert> : null}
      <p className="text-sm text-muted">Cole o andamento do processo. O sistema sugere um texto simples (quando reconhece o tipo de andamento) ou você escreve. O cliente só vê depois que uma pessoa aprovar.</p>
      {canWrite ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            run(() => draftUpdateAction(caseId, { originalText: fd.get("original"), plainText: fd.get("plain") }), undefined, () => form.reset());
          }}
        >
          <Field label="Andamento original (do tribunal)" htmlFor="pu-o"><Textarea id="pu-o" name="original" required rows={3} /></Field>
          <Field label="Texto em linguagem simples (opcional)" htmlFor="pu-p" hint="Em branco: o sistema usa o modelo do tipo de andamento, se houver."><Textarea id="pu-p" name="plain" rows={2} /></Field>
          <Button type="submit" loading={pending}>Criar rascunho</Button>
        </form>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="mb-1 flex items-center gap-2"><Badge tone={r.status === "APPROVED" ? "success" : "warning"}>{r.status === "APPROVED" ? "Visível ao cliente" : "Rascunho"}</Badge></div>
            <p className="text-xs text-muted">Original: {r.originalText}</p>
            {r.status === "DRAFT" && canWrite ? (
              <div className="mt-2 space-y-2">
                <Textarea aria-label="Texto para o cliente" rows={3} value={edits[r.id] ?? r.plainText} onChange={(e) => setEdits((x) => ({ ...x, [r.id]: e.target.value }))} />
                <div className="flex gap-2">
                  <Button size="sm" loading={pending} onClick={() => run(() => approveUpdateAction(r.id, caseId, edits[r.id] ?? r.plainText))}>Revisei e aprovo</Button>
                  <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => discardUpdateAction(r.id, caseId))}>Descartar</Button>
                </div>
              </div>
            ) : <p className="mt-1">{r.plainText}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type PendingRow = { id: string; title: string; description: string | null; status: string; dueDate: string | null; clientNote: string | null };

export function ClientPendingsPanel({ clientId, rows, canWrite }: { clientId: string; rows: PendingRow[]; canWrite: boolean }) {
  const { run, pending, error } = useRun();
  const label: Record<string, string> = { OPEN: "Aberta", CLIENT_DONE: "Cliente diz que fez", DONE: "Concluída" };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Pendências aparecem no portal do cliente (levar documento, assinar, responder algo). Só o título e a descrição ficam visíveis a ele.</p>
      {canWrite ? (
        <form
          className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            run(() => createPendingAction({ clientId, title: fd.get("title"), description: fd.get("description"), dueDate: fd.get("due") }), undefined, () => form.reset());
          }}
        >
          <Field label="O que o cliente precisa fazer" htmlFor="cp-t"><Input id="cp-t" name="title" required maxLength={160} /></Field>
          <Field label="Detalhe (opcional)" htmlFor="cp-d"><Input id="cp-d" name="description" maxLength={1000} /></Field>
          <Field label="Até" htmlFor="cp-due"><Input id="cp-due" name="due" type="date" /></Field>
          <Button type="submit" loading={pending}>Adicionar</Button>
        </form>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ul className="divide-y divide-border">
        {rows.length === 0 ? <li className="py-2 text-sm text-muted">Nenhuma pendência.</li> : null}
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>{r.title}{r.dueDate ? <span className="text-xs text-muted"> · até {r.dueDate.slice(8, 10)}/{r.dueDate.slice(5, 7)}</span> : null}{r.clientNote ? <span className="block text-xs text-muted">Cliente: {r.clientNote}</span> : null}</span>
            <span className="flex items-center gap-2"><Badge tone={r.status === "DONE" ? "success" : r.status === "CLIENT_DONE" ? "warning" : "neutral"}>{label[r.status] ?? r.status}</Badge>
              {canWrite && r.status !== "DONE" ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setPendingStatusAction(r.id, clientId, "DONE"))}>Concluir</Button> : null}
              {canWrite ? <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => setPendingStatusAction(r.id, clientId, "CANCELED"))}>Cancelar</Button> : null}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReplyForm({ clientId }: { clientId: string }) {
  const { run, pending, error } = useRun();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        run(() => replyClientAction(clientId, String(new FormData(form).get("body") ?? "")), undefined, () => form.reset());
      }}
    >
      <Textarea name="body" rows={3} required maxLength={3000} aria-label="Resposta ao cliente" />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="submit" loading={pending}>Enviar pelo portal</Button>
    </form>
  );
}

// ---- lado do cliente ----
export function MyPendingActions({ id }: { id: string }) {
  const { run, pending, error } = useRun();
  return (
    <span className="flex items-center gap-2">
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
      <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => markPendingDoneAction(id, ""))}>Já fiz</Button>
    </span>
  );
}

export function MyMessageForm() {
  const { run, pending, error, done } = useRun();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        run(() => sendMyMessageAction(String(new FormData(form).get("body") ?? "")), "Mensagem enviada. A equipe responde por aqui.", () => form.reset());
      }}
    >
      <Textarea name="body" rows={3} required maxLength={2000} aria-label="Sua mensagem para a equipe" placeholder="Escreva sua dúvida ou recado" />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      <Button type="submit" loading={pending}>Falar com a equipe</Button>
    </form>
  );
}
