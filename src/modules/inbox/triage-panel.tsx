"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { discardTriageAction, saveMinutaAction, triageAction, validateTriageAction } from "./triage-actions";

export type TriageView = { summary: string; requirement: string; actLabel: string | null; days: number | null; countType: string | null; dueDate: string | null; minuta: string; source: string; status: string };

export function TriagePanel({ noticeId, triage, canWrite, canAi, canDeadline, hasCase, dueFmt }: { noticeId: string; triage: TriageView | null; canWrite: boolean; canAi: boolean; canDeadline: boolean; hasCase: boolean; dueFmt: string | null }) {
  const { run, pending, error } = useRun();
  const [minuta, setMinuta] = React.useState(triage?.minuta ?? "");
  if (!triage) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">Lê o teor, indica o que a publicação exige, calcula o prazo e deixa uma minuta em rascunho. Nada é protocolado nem enviado: uma pessoa valida.</p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={pending} onClick={() => run(() => triageAction(noticeId, false))}>Gerar triagem</Button>
            {canAi ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => triageAction(noticeId, true))}>Gerar triagem e minuta com IA</Button> : null}
          </div>
        ) : null}
      </div>
    );
  }
  const draft = triage.status === "DRAFT";
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={draft ? "warning" : triage.status === "VALIDATED" ? "success" : "neutral"}>{draft ? "Rascunho — falta validar" : triage.status === "VALIDATED" ? "Validada" : "Descartada"}</Badge>
        <Badge tone="info">{triage.source === "AI" ? "Com IA" : "Por regras"}</Badge>
      </div>
      <p><span className="text-xs text-muted">Resumo</span><br />{triage.summary}</p>
      <p><span className="text-xs text-muted">O que exige</span><br />{triage.requirement}</p>
      <p><span className="text-xs text-muted">Ato / prazo</span><br />{triage.actLabel ?? "Não identificado"}{triage.days ? ` · ${triage.days} dia(s) ${triage.countType === "CALENDAR" ? "corridos" : "úteis"}` : ""}{dueFmt ? ` · vence em ${dueFmt}` : ""}</p>
      <Alert tone="info">Prazo e ato são leitura automática: confira o dispositivo antes de confiar.</Alert>
      <Textarea aria-label="Minuta" rows={10} value={minuta} disabled={!draft || !canWrite} onChange={(e) => setMinuta(e.target.value)} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {draft && canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => saveMinutaAction(noticeId, minuta))}>Salvar minuta</Button>
          <Button size="sm" loading={pending} onClick={() => run(async () => { const r = await saveMinutaAction(noticeId, minuta); return !r.ok ? r : validateTriageAction(noticeId, false); })}>Revisei e valido</Button>
          {canDeadline && hasCase && triage.dueDate ? <Button size="sm" loading={pending} onClick={() => run(async () => { const r = await saveMinutaAction(noticeId, minuta); return !r.ok ? r : validateTriageAction(noticeId, true); })}>Validar e criar prazo (rascunho)</Button> : null}
          <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => discardTriageAction(noticeId))}>Descartar</Button>
        </div>
      ) : null}
    </div>
  );
}
