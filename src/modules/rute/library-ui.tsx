"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { deleteInstructionAction, saveInstructionAction, setGovernanceAction } from "./actions";

export type Instr = { id: string; area: string; kind: string; title: string; body: string; active: boolean };

export function InstructionForm({ item, areas, onDone }: { item?: Instr; areas: Record<string, string>; onDone?: () => void }) {
  const { run, pending, error } = useRun();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveInstructionAction({ id: item?.id, area: String(fd.get("area")), kind: String(fd.get("kind")), title: String(fd.get("title")), body: String(fd.get("body")), active: fd.get("active") === "on" }), undefined, () => onDone?.());
        if (!item) e.currentTarget.reset();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Área" htmlFor={`li-a${item?.id ?? ""}`}><Select id={`li-a${item?.id ?? ""}`} name="area" defaultValue={item?.area ?? "GERAL"}>{Object.entries(areas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Tipo" htmlFor={`li-k${item?.id ?? ""}`}><Select id={`li-k${item?.id ?? ""}`} name="kind" defaultValue={item?.kind ?? "INSTRUCAO"}><option value="INSTRUCAO">Instrução</option><option value="MODELO">Modelo</option></Select></Field>
        <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={item?.active ?? true} />Ativo</label></div>
      </div>
      <Field label="Título" htmlFor={`li-t${item?.id ?? ""}`}><Input id={`li-t${item?.id ?? ""}`} name="title" required minLength={3} maxLength={120} defaultValue={item?.title} /></Field>
      <Field label="Texto" htmlFor={`li-b${item?.id ?? ""}`} hint="Instrução: como o escritório quer que a IA trabalhe. Modelo: peça-base. Não coloque dados de clientes."><Textarea id={`li-b${item?.id ?? ""}`} name="body" rows={8} required minLength={10} maxLength={20000} defaultValue={item?.body} /></Field>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="submit" size="sm" loading={pending}>{item ? "Salvar alterações" : "Adicionar à biblioteca"}</Button>
    </form>
  );
}

export function InstructionRow({ item, areas, canEdit }: { item: Instr; areas: Record<string, string>; canEdit: boolean }) {
  const [open, setOpen] = React.useState(false);
  const del = useRun();
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{item.title} <Badge tone="neutral">{areas[item.area] ?? item.area}</Badge> <Badge tone={item.kind === "MODELO" ? "accent" : "info"}>{item.kind === "MODELO" ? "Modelo" : "Instrução"}</Badge>{item.active ? null : <Badge tone="warning">Inativo</Badge>}</p>
        {canEdit ? (
          <span className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>{open ? "Fechar" : "Editar"}</Button>
            <Button size="sm" variant="danger" loading={del.pending} onClick={() => del.run(() => deleteInstructionAction(item.id))}>Apagar</Button>
          </span>
        ) : null}
      </div>
      {open ? <InstructionForm item={item} areas={areas} onDone={() => setOpen(false)} /> : <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted">{item.body}</p>}
      {del.error ? <Alert tone="error">{del.error}</Alert> : null}
    </li>
  );
}

export function GovernanceForm({ retentionDays, monthlyTokenLimit, roleLimits, roles }: { retentionDays: number; monthlyTokenLimit: number | null; roleLimits: Record<string, number>; roles: { key: string; name: string }[] }) {
  const { run, pending, error, done } = useRun();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const rl: Record<string, number> = {};
        for (const r of roles) {
          const v = String(fd.get(`role_${r.key}`) ?? "").trim();
          if (v) rl[r.key] = Number(v);
        }
        const lim = String(fd.get("limit") ?? "").trim();
        run(() => setGovernanceAction({ retentionDays: Number(fd.get("retention")), monthlyTokenLimit: lim ? Number(lim) : null, roleLimits: rl }), "Salvo.");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Guardar conversas e histórico por (dias)" htmlFor="gv-r" hint="Depois disso são apagados automaticamente."><Input id="gv-r" name="retention" type="number" min={1} max={730} defaultValue={retentionDays} required /></Field>
        <Field label="Limite mensal do escritório (tokens)" htmlFor="gv-l" hint="Vazio = limite do plano."><Input id="gv-l" name="limit" type="number" min={1000} defaultValue={monthlyTokenLimit ?? ""} /></Field>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted">Limite mensal por pessoa, conforme o perfil (tokens; vazio = sem limite próprio)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {roles.map((r) => <Field key={r.key} label={r.name} htmlFor={`gv-${r.key}`}><Input id={`gv-${r.key}`} name={`role_${r.key}`} type="number" min={0} defaultValue={roleLimits[r.key] ?? ""} /></Field>)}
        </div>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      <Button type="submit" size="sm" loading={pending}>Salvar</Button>
    </form>
  );
}
