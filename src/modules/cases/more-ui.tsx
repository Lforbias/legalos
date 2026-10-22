"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { APPEAL_STATUSES, APPEAL_STATUS_LABEL, DEGREES, DEGREE_LABEL, FEE_KINDS, FEE_KIND_LABEL, LINK_KINDS, LINK_KIND_LABEL } from "./case-extras-schemas";
import { addFeeAction, linkCasesAction, manualIndexAction, removeAppealAction, removeFeeAction, saveAppealAction, setValuationAction, syncIndexesAction, unlinkCasesAction } from "./more-actions";

function Msg({ error, done }: { error: string | null; done: string | null }) {
  return (
    <>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
    </>
  );
}

export function FeeForm({ caseId }: { caseId: string }) {
  const [v, setV] = React.useState({ kind: "CONTRATUAL", description: "", amount: "", percent: "", notes: "" });
  const { run, pending, error, done } = useRun();
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => addFeeAction(caseId, v), "Honorário registrado.", () => setV({ ...v, description: "", amount: "", percent: "", notes: "" })); }}>
      <div className="sm:col-span-2"><Msg error={error} done={done} /></div>
      <Field label="Tipo" htmlFor="fee-kind"><Select id="fee-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>{FEE_KINDS.map((k) => <option key={k} value={k}>{FEE_KIND_LABEL[k]}</option>)}</Select></Field>
      <Field label="Descrição" htmlFor="fee-desc"><Input id="fee-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={200} /></Field>
      <Field label="Valor fixo (R$)" htmlFor="fee-amount"><Input id="fee-amount" inputMode="decimal" placeholder="3.000,00" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
      <Field label="ou percentual (%)" htmlFor="fee-pct"><Input id="fee-pct" inputMode="decimal" placeholder="30" value={v.percent} onChange={(e) => setV({ ...v, percent: e.target.value })} /></Field>
      <div className="sm:col-span-2"><Field label="Observações" htmlFor="fee-notes"><Textarea id="fee-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={1000} /></Field></div>
      <div className="sm:col-span-2"><Button type="submit" size="sm" loading={pending}>Registrar honorário</Button></div>
    </form>
  );
}

export function RemoveButton({ label, action }: { label: string; action: () => Promise<import("@/lib/validation/common").ActionState> }) {
  const { run, pending, error } = useRun();
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => run(action)}>{label}</Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
export const RemoveFee = ({ caseId, id }: { caseId: string; id: string }) => <RemoveButton label="Remover" action={() => removeFeeAction(caseId, id)} />;
export const RemoveLink = ({ caseId, id }: { caseId: string; id: string }) => <RemoveButton label="Desvincular" action={() => unlinkCasesAction(caseId, id)} />;
export const RemoveAppeal = ({ caseId, id }: { caseId: string; id: string }) => <RemoveButton label="Remover" action={() => removeAppealAction(caseId, id)} />;

export function LinkForm({ caseId, options }: { caseId: string; options: { id: string; label: string }[] }) {
  const [v, setV] = React.useState({ relatedCaseId: "", kind: "APENSO", notes: "" });
  const { run, pending, error, done } = useRun();
  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); run(() => linkCasesAction(caseId, v), "Processos vinculados.", () => setV({ ...v, relatedCaseId: "", notes: "" })); }}>
      <div className="sm:col-span-3"><Msg error={error} done={done} /></div>
      <Field label="Processo a vincular" htmlFor="link-case"><Select id="link-case" value={v.relatedCaseId} onChange={(e) => setV({ ...v, relatedCaseId: e.target.value })}><option value="">Escolha…</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></Field>
      <Field label="Tipo de vínculo" htmlFor="link-kind"><Select id="link-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>{LINK_KINDS.map((k) => <option key={k} value={k}>{LINK_KIND_LABEL[k]}</option>)}</Select></Field>
      <Field label="Observação" htmlFor="link-notes"><Input id="link-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={500} /></Field>
      <div className="sm:col-span-3"><Button type="submit" size="sm" loading={pending}>Vincular</Button></div>
    </form>
  );
}

export type AppealRow = { id?: string; degree: string; appealType: string; number: string; court: string; filedOn: string; status: string; judgedOn: string; notes: string };
const EMPTY_APPEAL: AppealRow = { degree: "SEGUNDO", appealType: "", number: "", court: "", filedOn: "", status: "PENDENTE", judgedOn: "", notes: "" };

export function AppealForm({ caseId, initial, onDone }: { caseId: string; initial?: AppealRow; onDone?: () => void }) {
  const [v, setV] = React.useState<AppealRow>(initial ?? EMPTY_APPEAL);
  const { run, pending, error, done } = useRun();
  const { id, ...body } = v;
  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); run(() => saveAppealAction(caseId, body, id), "Recurso salvo.", () => { if (!id) setV(EMPTY_APPEAL); onDone?.(); }); }}>
      <div className="sm:col-span-3"><Msg error={error} done={done} /></div>
      <Field label="Grau" htmlFor="ap-degree"><Select id="ap-degree" value={v.degree} onChange={(e) => setV({ ...v, degree: e.target.value })}>{DEGREES.map((d) => <option key={d} value={d}>{DEGREE_LABEL[d]}</option>)}</Select></Field>
      <Field label="Tipo" htmlFor="ap-type"><Input id="ap-type" placeholder="Apelação, agravo…" value={v.appealType} onChange={(e) => setV({ ...v, appealType: e.target.value })} maxLength={80} /></Field>
      <Field label="Número" htmlFor="ap-num"><Input id="ap-num" value={v.number} onChange={(e) => setV({ ...v, number: e.target.value })} maxLength={40} /></Field>
      <Field label="Tribunal / órgão" htmlFor="ap-court"><Input id="ap-court" value={v.court} onChange={(e) => setV({ ...v, court: e.target.value })} maxLength={120} /></Field>
      <Field label="Interposto em" htmlFor="ap-filed"><Input id="ap-filed" type="date" value={v.filedOn} onChange={(e) => setV({ ...v, filedOn: e.target.value })} /></Field>
      <Field label="Situação" htmlFor="ap-status"><Select id="ap-status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>{APPEAL_STATUSES.map((s) => <option key={s} value={s}>{APPEAL_STATUS_LABEL[s]}</option>)}</Select></Field>
      <Field label="Julgado em" htmlFor="ap-judged"><Input id="ap-judged" type="date" value={v.judgedOn} onChange={(e) => setV({ ...v, judgedOn: e.target.value })} /></Field>
      <div className="sm:col-span-2"><Field label="Observações" htmlFor="ap-notes"><Input id="ap-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={1000} /></Field></div>
      <div className="sm:col-span-3 flex gap-2"><Button type="submit" size="sm" loading={pending}>{id ? "Salvar recurso" : "Adicionar recurso"}</Button>{onDone ? <Button type="button" variant="ghost" size="sm" onClick={onDone}>Fechar</Button> : null}</div>
    </form>
  );
}

export function EditableAppeal({ caseId, row }: { caseId: string; row: AppealRow }) {
  const [open, setOpen] = React.useState(false);
  if (open) return <AppealForm caseId={caseId} initial={row} onDone={() => setOpen(false)} />;
  return <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>Editar</Button>;
}

export function ValuationForm({ caseId, initial, indexes }: { caseId: string; initial: { claimBaseDate: string; provisionValue: string; provisionBaseDate: string; correctionIndex: string }; indexes: { value: string; label: string }[] }) {
  const [v, setV] = React.useState(initial);
  const { run, pending, error, done } = useRun();
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => setValuationAction(caseId, v), "Valores salvos."); }}>
      <div className="sm:col-span-2"><Msg error={error} done={done} /></div>
      <Field label="Índice de correção" htmlFor="va-index"><Select id="va-index" value={v.correctionIndex} onChange={(e) => setV({ ...v, correctionIndex: e.target.value })}><option value="">Sem correção</option>{indexes.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}</Select></Field>
      <Field label="Data-base do valor da causa" htmlFor="va-claim" hint="Se vazio, usa a data de distribuição."><Input id="va-claim" type="date" value={v.claimBaseDate} onChange={(e) => setV({ ...v, claimBaseDate: e.target.value })} /></Field>
      <Field label="Provisão (R$)" htmlFor="va-prov"><Input id="va-prov" inputMode="decimal" placeholder="2.000,00" value={v.provisionValue} onChange={(e) => setV({ ...v, provisionValue: e.target.value })} /></Field>
      <Field label="Data da provisão" htmlFor="va-provdate"><Input id="va-provdate" type="date" value={v.provisionBaseDate} onChange={(e) => setV({ ...v, provisionBaseDate: e.target.value })} /></Field>
      <div className="sm:col-span-2"><Button type="submit" size="sm" loading={pending}>Salvar</Button></div>
    </form>
  );
}

export function IndexTools({ caseId, canManage, canFinance, series }: { caseId: string; canManage: boolean; canFinance: boolean; series: { value: string; label: string }[] }) {
  const [m, setM] = React.useState({ series: series[0]?.value ?? "INPC", month: "", rate: "" });
  const sync = useRun();
  const manual = useRun();
  const [summary, setSummary] = React.useState("");
  return (
    <div className="space-y-3">
      {canManage ? (
        <div className="space-y-2">
          <Msg error={sync.error} done={summary || null} />
          <Button type="button" size="sm" variant="secondary" loading={sync.pending} onClick={() => sync.run(() => syncIndexesAction(caseId), undefined, (d) => setSummary(d?.summary ?? ""))}>Atualizar índices oficiais (Banco Central)</Button>
        </div>
      ) : null}
      {canFinance ? (
        <form className="grid items-end gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); manual.run(() => manualIndexAction(caseId, m.series, m.month, m.rate), "Índice salvo."); }}>
          <div className="sm:col-span-4"><Msg error={manual.error} done={manual.done} /></div>
          <Field label="Índice" htmlFor="ix-series"><Select id="ix-series" value={m.series} onChange={(e) => setM({ ...m, series: e.target.value })}>{series.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
          <Field label="Mês" htmlFor="ix-month"><Input id="ix-month" type="month" value={m.month} onChange={(e) => setM({ ...m, month: e.target.value })} /></Field>
          <Field label="Taxa do mês (%)" htmlFor="ix-rate"><Input id="ix-rate" inputMode="decimal" placeholder="0.46" value={m.rate} onChange={(e) => setM({ ...m, rate: e.target.value })} /></Field>
          <Button type="submit" size="sm" variant="secondary" loading={manual.pending}>Lançar índice manual</Button>
        </form>
      ) : null}
    </div>
  );
}
