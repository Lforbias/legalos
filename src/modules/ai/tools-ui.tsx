"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { draftPieceAction, researchJurisprudenceAction, saveDraftDocumentAction } from "./actions";

type CaseOpt = { id: string; label: string };
const KINDS: [string, string][] = [["peticao_inicial", "Petição inicial"], ["contestacao", "Contestação"], ["replica", "Réplica"], ["recurso", "Recurso"], ["embargos_declaracao", "Embargos de declaração"], ["manifestacao", "Manifestação"], ["outra", "Outra peça"]];
const err = (r: { message?: string; fieldErrors?: Record<string, string[] | undefined> }) => Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível concluir.";

export function JurisPanel({ cases }: { cases: CaseOpt[] }) {
  const [q, setQ] = React.useState("");
  const [caseId, setCaseId] = React.useState("");
  const [out, setOut] = React.useState<{ answer: string; warning: string; removedCitations: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-3" data-testid="juris-panel">
      <Alert tone="warning">A IA <strong>não consulta bases de jurisprudência</strong>. O resultado é um mapa de pesquisa (teses, termos de busca, o que conferir). Números de processo são removidos de propósito: nenhum precedente é afirmado como real.</Alert>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Questão jurídica" htmlFor="jr-q"><Textarea id="jr-q" rows={4} maxLength={2000} value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      <Field label="Usar contexto de um processo (opcional)" htmlFor="jr-c"><Select id="jr-c" value={caseId} onChange={(e) => setCaseId(e.target.value)}><option value="">Nenhum</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      <Button loading={pending} onClick={() => start(async () => { setError(null); setOut(null); const r = await researchJurisprudenceAction({ question: q, caseId: caseId || undefined }); if (r.ok && r.data) setOut(r.data); else setError(err(r)); })}>Montar mapa de pesquisa</Button>
      {out ? <div className="space-y-2 rounded-md border border-border p-3 text-sm"><p className="whitespace-pre-wrap" data-testid="juris-answer">{out.answer}</p><Alert tone="warning">{out.warning}</Alert></div> : null}
    </div>
  );
}

export function DraftPanel({ cases }: { cases: CaseOpt[] }) {
  const [caseId, setCaseId] = React.useState(cases[0]?.id ?? "");
  const [kind, setKind] = React.useState("contestacao");
  const [instr, setInstr] = React.useState("");
  const [text, setText] = React.useState("");
  const [banner, setBanner] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [msg, setMsg] = React.useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  if (cases.length === 0) return <Alert tone="info">Você ainda não tem processos visíveis.</Alert>;
  return (
    <div className="space-y-3" data-testid="draft-panel">
      <Alert tone="info">Gera uma <strong>minuta</strong> com os dados do processo e a sua orientação. Não protocola nada. Onde faltar dado, a minuta traz [PREENCHER]; jurisprudência vem como [PESQUISAR]. Revise tudo antes de usar.</Alert>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Processo" htmlFor="dp-c"><Select id="dp-c" value={caseId} onChange={(e) => setCaseId(e.target.value)}>{cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
        <Field label="Tipo de peça" htmlFor="dp-k"><Select id="dp-k" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      </div>
      <Field label="Tese e pedidos (o que a peça deve defender e pedir)" htmlFor="dp-i"><Textarea id="dp-i" rows={5} maxLength={4000} value={instr} onChange={(e) => setInstr(e.target.value)} /></Field>
      <Button loading={pending} onClick={() => start(async () => { setMsg(null); const r = await draftPieceAction(caseId, { kind, instructions: instr }); if (r.ok && r.data) { setText(r.data.text); setBanner(r.data.banner); } else setMsg({ tone: "error", text: err(r) }); })}>Gerar minuta</Button>
      {text ? (
        <div className="space-y-2">
          <Alert tone="warning">{banner}</Alert>
          <Textarea aria-label="Minuta" rows={18} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Nome do documento" htmlFor="dp-t"><Input id="dp-t" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Button variant="secondary" loading={pending} disabled={title.trim().length < 3} onClick={() => start(async () => { const r = await saveDraftDocumentAction(caseId, { title, text }); setMsg(r.ok ? { tone: "success", text: "Minuta salva nos documentos do processo." } : { tone: "error", text: err(r) }); })}>Salvar nos documentos do processo</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
