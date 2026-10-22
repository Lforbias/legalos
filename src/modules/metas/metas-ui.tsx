"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { applyDistributionAction, deleteGoalAction, setGoalAction } from "./actions";

export function GoalForm({ month, members, metrics }: { month: string; members: { id: string; name: string }[]; metrics: { key: string; label: string }[] }) {
  const { run, pending, error } = useRun();
  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => setGoalAction({ userId: fd.get("userId"), month, metric: fd.get("metric"), target: String(fd.get("target") ?? "").replace(",", ".") }));
      }}
    >
      <Field label="Para quem" htmlFor="g-u"><Select id="g-u" name="userId" defaultValue=""><option value="">Equipe toda</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
      <Field label="Medida" htmlFor="g-m"><Select id="g-m" name="metric">{metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select></Field>
      <Field label="Meta do mês" htmlFor="g-t"><Input id="g-t" name="target" inputMode="decimal" required /></Field>
      <div className="flex items-end"><Button type="submit" loading={pending}>Salvar meta</Button></div>
      {error ? <div className="sm:col-span-4"><Alert tone="error">{error}</Alert></div> : null}
    </form>
  );
}

export function DeleteGoalButton({ id }: { id: string }) {
  const { run, pending } = useRun();
  return <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => deleteGoalAction(id))}>Remover</Button>;
}

export type Sug = { taskId: string; title: string; points: number; userId: string; userName: string };

export function DistributionPanel({ suggestions, members, canApply }: { suggestions: Sug[]; members: { id: string; name: string }[]; canApply: boolean }) {
  const { run, pending, error } = useRun();
  const [rows, setRows] = React.useState(suggestions.map((s) => ({ ...s, on: true })));
  if (!rows.length) return <p className="text-sm text-muted">Nenhuma tarefa em aberto sem responsável.</p>;
  const chosen = rows.filter((r) => r.on);
  return (
    <div className="space-y-3">
      <Alert tone="info">Sugestão por peso: as tarefas mais pesadas vão primeiro para quem está com menos pontos. Nada muda até você confirmar.</Alert>
      <ul className="space-y-2 text-sm">
        {rows.map((r, i) => (
          <li key={r.taskId} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
            <input type="checkbox" aria-label={`Atribuir: ${r.title}`} checked={r.on} disabled={!canApply} onChange={() => setRows((x) => x.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} />
            <span className="min-w-0 flex-1">{r.title} <span className="text-xs text-muted">· {r.points} pt</span></span>
            <Select aria-label="Responsável" value={r.userId} disabled={!canApply} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, userId: e.target.value } : y)))}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
          </li>
        ))}
      </ul>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {canApply ? <Button loading={pending} disabled={!chosen.length} onClick={() => run(() => applyDistributionAction(chosen.map((r) => ({ taskId: r.taskId, userId: r.userId }))))}>Confirmar {chosen.length} atribuição(ões)</Button> : <p className="text-xs text-muted">Você pode ver a sugestão, mas não tem permissão para atribuir tarefas.</p>}
    </div>
  );
}
