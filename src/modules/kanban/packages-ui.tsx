"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Select } from "@/components/ui/form";
import { deletePackageAction, runPackageAction, savePackageAction } from "./actions";
import { useRun } from "./use-run";

export type StepRow = { id?: string; title: string; description: string; dueDays: number; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"; assigneeId: string; ask: string };
export type PackageRow = { id: string; name: string; description: string; active: boolean; steps: StepRow[] };
const PRIORITY: Record<StepRow["priority"], string> = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente" };
const blank = (): StepRow => ({ title: "", description: "", dueDays: 1, priority: "NORMAL", assigneeId: "", ask: "" });

function PackageForm({ id, initial, members, onDone }: { id: string | null; initial: Omit<PackageRow, "id">; members: { id: string; name: string }[]; onDone: () => void }) {
  const { run, pending, error } = useRun();
  const [name, setName] = React.useState(initial.name);
  const [description, setDescription] = React.useState(initial.description);
  const [active, setActive] = React.useState(initial.active);
  const [steps, setSteps] = React.useState<StepRow[]>(initial.steps.length ? initial.steps : [blank()]);
  const set = (i: number, patch: Partial<StepRow>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setSteps((s) => { const j = i + d; if (j < 0 || j >= s.length) return s; const c = [...s]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; });
  return (
    <form
      className="space-y-3 rounded-md border border-border bg-surface-2/50 p-3"
      onSubmit={(e) => { e.preventDefault(); run(() => savePackageAction(id, { name, description, active, steps: steps.map(({ id: _i, ...s }) => s) }), undefined, onDone); }}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <Field label="Nome do pacote" htmlFor="pk-name"><Input id="pk-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Descrição (opcional)" htmlFor="pk-desc"><Input id="pk-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> pacote ativo (pode ser executado)</label>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="grid gap-2 rounded-md border border-border bg-surface p-2 md:grid-cols-[2fr_90px_110px_1.2fr_1.5fr_auto]">
            <Field label={`Tarefa ${i + 1}`} htmlFor={`st-t-${i}`}><Input id={`st-t-${i}`} value={s.title} onChange={(e) => set(i, { title: e.target.value })} /></Field>
            <Field label="Prazo (dias)" htmlFor={`st-d-${i}`}><Input id={`st-d-${i}`} type="number" min={0} max={365} value={s.dueDays} onChange={(e) => set(i, { dueDays: Number(e.target.value) })} /></Field>
            <Field label="Prioridade" htmlFor={`st-p-${i}`}><Select id={`st-p-${i}`} value={s.priority} onChange={(e) => set(i, { priority: e.target.value as StepRow["priority"] })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Responsável fixo" htmlFor={`st-a-${i}`}><Select id={`st-a-${i}`} value={s.assigneeId} onChange={(e) => set(i, { assigneeId: e.target.value })}><option value="">Definir ao executar</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            <Field label="Pergunta ao executar (opcional)" htmlFor={`st-q-${i}`}><Input id={`st-q-${i}`} value={s.ask} onChange={(e) => set(i, { ask: e.target.value })} placeholder="Ex.: Valor do acordo" /></Field>
            <div className="flex items-end gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">↑</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Descer">↓</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} disabled={steps.length === 1} aria-label="Remover tarefa">✕</Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setSteps((s) => [...s, blank()])} disabled={steps.length >= 20}>Adicionar tarefa</Button>
        <Button type="submit" size="sm" loading={pending}>{id ? "Salvar pacote" : "Criar pacote"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}

export function PackagesAdmin({ rows, members, canEdit }: { rows: PackageRow[]; members: { id: string; name: string }[]; canEdit: boolean }) {
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  return (
    <Card>
      <CardHeader
        title="Pacotes de tarefas"
        description="Rotinas prontas: ao executar, o sistema cria todas as tarefas de uma vez, com prazos contados a partir da data que você escolher. Os três modelos iniciais podem ser editados."
        action={canEdit && editing === null ? <Button size="sm" onClick={() => setEditing("new")}>Novo pacote</Button> : undefined}
      />
      <CardBody className="space-y-3">
        {editing === "new" ? <PackageForm id={null} initial={{ name: "", description: "", active: true, steps: [] }} members={members} onDone={() => setEditing(null)} /> : null}
        <ul className="divide-y divide-border">
          {rows.map((p) =>
            editing === p.id ? (
              <li key={p.id} className="py-3"><PackageForm id={p.id} initial={p} members={members} onDone={() => setEditing(null)} /></li>
            ) : (
              <li key={p.id} className="space-y-1 py-3" data-testid="package-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{p.name} {p.active ? null : <Badge tone="warning">desativado</Badge>}</p>
                  {canEdit ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(p.id)}>Editar</Button>
                      <ConfirmAction label="Excluir" confirmLabel="Excluir pacote" description="As tarefas já criadas não são afetadas." action={() => deletePackageAction(p.id)} />
                    </div>
                  ) : null}
                </div>
                {p.description ? <p className="text-xs text-muted">{p.description}</p> : null}
                <ol className="list-decimal pl-5 text-xs text-muted">{p.steps.map((s, i) => <li key={i}>{s.title} <span>(+{s.dueDays} dia{s.dueDays === 1 ? "" : "s"})</span></li>)}</ol>
              </li>
            ),
          )}
        </ul>
      </CardBody>
    </Card>
  );
}

/** Cartão "Executar pacote" (tela do processo). */
export function RunPackageCard({ caseId, packages, boards, today, history }: { caseId: string; packages: { id: string; name: string; steps: { id: string; title: string; ask: string }[] }[]; boards: { id: string; name: string }[]; today: string; history: { id: string; name: string; taskCount: number; when: string }[] }) {
  const { run, pending, error, done } = useRun();
  const [pid, setPid] = React.useState(packages[0]?.id ?? "");
  const [baseDate, setBaseDate] = React.useState(today);
  const [boardId, setBoardId] = React.useState("");
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [confirmAgain, setConfirmAgain] = React.useState(false);
  const pkg = packages.find((p) => p.id === pid);
  const asks = pkg?.steps.filter((s) => s.ask) ?? [];
  if (packages.length === 0) return <p className="text-sm text-muted">Nenhum pacote ativo. Quem administra o escritório cria em Configurações → Pacotes de tarefas.</p>;
  return (
    <div className="space-y-3 text-sm">
      {error ? <Alert tone="error">{error}{error.includes("já foi executado") ? " Marque a confirmação abaixo para repetir." : ""}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Pacote" htmlFor="rp-pkg"><Select id="rp-pkg" value={pid} onChange={(e) => { setPid(e.target.value); setAnswers({}); }}>{packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Data base dos prazos" htmlFor="rp-date"><Input id="rp-date" type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} /></Field>
        <Field label="Cartão no quadro (opcional)" htmlFor="rp-board"><Select id="rp-board" value={boardId} onChange={(e) => setBoardId(e.target.value)}><option value="">Não criar cartão</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
      </div>
      {asks.map((s) => (
        <Field key={s.id} label={s.ask} htmlFor={`rp-a-${s.id}`}><Input id={`rp-a-${s.id}`} value={answers[s.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [s.id]: e.target.value }))} /></Field>
      ))}
      <p className="text-xs text-muted">Serão criadas {pkg?.steps.length ?? 0} tarefas neste processo. Depois você pode editar cada uma em Tarefas.</p>
      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={confirmAgain} onChange={(e) => setConfirmAgain(e.target.checked)} /> já executei este pacote aqui e quero executar de novo</label>
      <Button size="sm" loading={pending} disabled={!pid} onClick={() => run(() => runPackageAction(pid, { caseId, baseDate, answers, boardId, force: confirmAgain }), undefined, undefined)} data-testid="run-package">Executar pacote</Button>
      {history.length ? (
        <ul className="border-t border-border pt-2 text-xs text-muted">{history.map((h) => <li key={h.id}>{h.name}: {h.taskCount} tarefa(s) em {h.when}</li>)}</ul>
      ) : null}
    </div>
  );
}
