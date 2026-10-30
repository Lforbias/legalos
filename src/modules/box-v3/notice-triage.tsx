"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { formatYmd } from "@/lib/dates/ymd";
import { useRun } from "@/modules/kanban/use-run";
import { discardBoxV3NoticeTriageAction, runBoxV3NoticeTriageAction, saveBoxV3NoticeDraftAction, validateBoxV3NoticeTriageAction } from "@/app/(dashboard)/box-v3/entrada/[id]/actions";

export type BoxV3Triage = { summary: string; requirement: string; actLabel: string | null; days: number | null; countType: string | null; dueDate: string | null; minuta: string; source: string; status: string };

export function BoxV3NoticeTriage({ noticeId, triage, canWrite, canDeadline, hasCase }: { noticeId: string; triage: BoxV3Triage | null; canWrite: boolean; canDeadline: boolean; hasCase: boolean }) {
  const { run, pending, error, done } = useRun();
  const [minuta, setMinuta] = React.useState(triage?.minuta ?? "");
  if (!triage) return <div className="space-y-3"><p className="text-sm text-muted">A triagem por regras indica uma providência provável e prepara uma minuta para conferência. Não usa IA e não cria atos automaticamente.</p>{error ? <Alert tone="error">{error}</Alert> : null}{canWrite ? <Button size="sm" loading={pending} onClick={() => run(() => runBoxV3NoticeTriageAction(noticeId))}>Gerar triagem</Button> : null}</div>;
  const draft = triage.status === "DRAFT";
  return <div className="space-y-3 text-sm">
    <div className="flex flex-wrap items-center gap-2"><Badge tone={draft ? "warning" : triage.status === "VALIDATED" ? "success" : "neutral"}>{draft ? "Rascunho — falta validar" : triage.status === "VALIDATED" ? "Validada por uma pessoa" : "Descartada"}</Badge><Badge tone="info">{triage.source === "AI" ? "Com IA" : "Por regras"}</Badge></div>
    <p><span className="text-xs text-muted">Resumo</span><br />{triage.summary}</p>
    <p><span className="text-xs text-muted">O que exige</span><br />{triage.requirement}</p>
    <p><span className="text-xs text-muted">Ato / prazo provável</span><br />{triage.actLabel ?? "Não identificado"}{triage.days ? ` · ${triage.days} dia(s) ${triage.countType === "CALENDAR" ? "corridos" : "úteis"}` : ""}{triage.dueDate ? ` · sugestão de data ${formatYmd(triage.dueDate)}` : ""}</p>
    <Alert tone="warning">É uma leitura auxiliar. Confira o teor, a contagem aplicável e feriados locais; a data sugerida não é definitiva.</Alert>
    <label className="block text-sm font-medium" htmlFor="box-v3-triage-draft">Minuta para revisão</label><Textarea id="box-v3-triage-draft" rows={10} maxLength={30_000} value={minuta} disabled={!draft || !canWrite} onChange={(event) => setMinuta(event.target.value)} />
    {error ? <Alert tone="error">{error}</Alert> : null}{done ? <Alert tone="success">{done}</Alert> : null}
    {draft && canWrite ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => saveBoxV3NoticeDraftAction(noticeId, minuta), "Minuta salva.")}>Salvar minuta</Button><Button size="sm" loading={pending} onClick={() => run(async () => { const saved = await saveBoxV3NoticeDraftAction(noticeId, minuta); return saved.ok ? validateBoxV3NoticeTriageAction(noticeId, false) : saved; }, "Triagem validada internamente.")}>Revisei e validar</Button>{canDeadline && hasCase && triage.dueDate ? <Button size="sm" loading={pending} onClick={() => run(async () => { const saved = await saveBoxV3NoticeDraftAction(noticeId, minuta); return saved.ok ? validateBoxV3NoticeTriageAction(noticeId, true) : saved; }, "Triagem validada; prazo criado como rascunho.")}>Validar e criar prazo (rascunho)</Button> : null}<Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => discardBoxV3NoticeTriageAction(noticeId), "Triagem descartada.")}>Descartar</Button></div> : null}
  </div>;
}
