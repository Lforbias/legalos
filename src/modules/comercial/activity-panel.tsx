"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { addActivityAction, addContactAction, removeContactAction } from "./actions";
import { useRun } from "./use-run";

export function ActivityForm({ prospectId }: { prospectId: string }) {
  const { run, pending, error } = useRun();
  const [kind, setKind] = React.useState("LIGACAO");
  const [summary, setSummary] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [next, setNext] = React.useState("");
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => addActivityAction(prospectId, { kind, summary, outcome, nextActionAt: next ? new Date(next).toISOString() : null }), () => { setSummary(""); setOutcome(""); setNext(""); }); }}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="ac-kind"><Select id="ac-kind" value={kind} onChange={(e) => setKind(e.target.value)}><option value="LIGACAO">Ligação</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">E-mail</option><option value="REUNIAO">Reunião</option><option value="DEMONSTRACAO">Demonstração</option><option value="NOTA">Anotação</option></Select></Field>
        <Field label="Resultado (opcional)" htmlFor="ac-out"><Input id="ac-out" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Ex.: pediu proposta" /></Field>
      </div>
      <Field label="O que aconteceu" htmlFor="ac-sum"><Textarea id="ac-sum" value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-16" /></Field>
      <Field label="Marcar próximo retorno (opcional)" htmlFor="ac-next"><Input id="ac-next" type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      <Button type="submit" loading={pending} disabled={summary.trim().length < 2}>Registrar</Button>
    </form>
  );
}

export function ContactForm({ prospectId }: { prospectId: string }) {
  const { run, pending, error } = useRun();
  const [f, setF] = React.useState({ name: "", role: "", phone: "", email: "", isDecisionMaker: false });
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => addContactAction(prospectId, f), () => setF({ name: "", role: "", phone: "", email: "", isDecisionMaker: false })); }}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Nome" htmlFor="ct-name"><Input id="ct-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Cargo" htmlFor="ct-role"><Input id="ct-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Sócio, gerente..." /></Field>
        <Field label="Telefone" htmlFor="ct-phone"><Input id="ct-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="E-mail" htmlFor="ct-mail"><Input id="ct-mail" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      </div>
      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isDecisionMaker} onChange={(e) => setF({ ...f, isDecisionMaker: e.target.checked })} /> Decide a compra</label>
      <div><Button type="submit" size="sm" loading={pending} disabled={f.name.trim().length < 2}>Adicionar contato</Button></div>
    </form>
  );
}

export function RemoveContact({ prospectId, contactId }: { prospectId: string; contactId: string }) {
  const { run, pending } = useRun();
  return <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => removeContactAction(prospectId, contactId))}>Remover</Button>;
}
