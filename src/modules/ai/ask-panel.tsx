"use client";

import Link from "next/link";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import type { AiAnswer } from "@/server/services/ai.service";
import { askCaseAction } from "./actions";

type CaseOpt = { id: string; label: string };

export function AskPanel({ cases, initialCaseId, disabledReason }: { cases: CaseOpt[]; initialCaseId: string; disabledReason: string | null }) {
  const [caseId, setCaseId] = React.useState(initialCaseId || cases[0]?.id || "");
  const [question, setQuestion] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [answer, setAnswer] = React.useState<AiAnswer | null>(null);
  const [pending, start] = React.useTransition();
  if (disabledReason) return <Alert tone="warning">{disabledReason}</Alert>;
  if (cases.length === 0) return <Alert tone="info">Você ainda não tem processos visíveis para consultar.</Alert>;
  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setAnswer(null);
          start(async () => {
            const r = await askCaseAction(caseId, question);
            if (!r.ok || !r.data) {
              setError(r.fieldErrors?.question?.[0] ?? r.message ?? "Não foi possível concluir.");
              return;
            }
            setAnswer(r.data);
          });
        }}
      >
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Processo" htmlFor="ai-case">
          <Select id="ai-case" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            {cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Pergunta" htmlFor="ai-question" hint="Exemplos: “Qual o último andamento?”, “Há prazo em aberto?”, “Resuma a situação do processo.”">
          <Textarea id="ai-question" rows={3} maxLength={2000} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </Field>
        <Button type="submit" loading={pending}>Perguntar</Button>
      </form>
      {answer ? (
        <Card>
          <CardHeader title="Resposta" description="Apoio de trabalho gerado por IA. Confira nas fontes e revise antes de usar." action={<Badge tone="neutral">{answer.tokens} tokens</Badge>} />
          <CardBody>
            <p data-testid="ai-answer" className="whitespace-pre-wrap text-sm">{answer.answer}</p>
            {answer.references.length ? (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted">Fontes citadas</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {answer.references.map((r) => (
                    <li key={r.n}>
                      [{r.n}] {r.href ? <Link href={r.href} className="text-primary-text hover:underline">{r.label}</Link> : r.label} <span className="text-xs text-muted">({r.kind})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted">A resposta não citou fontes específicas; trate com cautela.</p>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
