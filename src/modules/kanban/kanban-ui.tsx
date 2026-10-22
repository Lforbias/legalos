"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Select } from "@/components/ui/form";
import { addColumnAction, archiveBoardAction, createBoardAction, createCardAction, deleteCardAction, deleteColumnAction, moveCardAction, renameBoardAction, renameColumnAction, shiftColumnAction } from "./actions";
import { useRun } from "./use-run";

export type KCard = { id: string; columnId: string; title: string; assigneeName: string | null; dueLabel: string | null; overdue: boolean; caseTitle: string | null; clientName: string | null; closed: boolean };
export type KColumn = { id: string; name: string; isDone: boolean };

export function KanbanBoardView({ boardId, columns, cards, members, canWrite }: { boardId: string; columns: KColumn[]; cards: KCard[]; members: { id: string; name: string }[]; canWrite: boolean }) {
  const { run, pending, error } = useRun();
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [columnId, setColumnId] = React.useState(columns[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {canWrite ? (
        adding ? (
          <form
            className="grid gap-3 rounded-md border border-border bg-surface-2/50 p-3 md:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createCardAction(boardId, { title, columnId, assigneeId, dueDate }), undefined, () => { setTitle(""); setAdding(false); });
            }}
          >
            <Field label="Título do cartão" htmlFor="kc-title"><Input id="kc-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Coluna" htmlFor="kc-col"><Select id="kc-col" value={columnId} onChange={(e) => setColumnId(e.target.value)}>{columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Responsável" htmlFor="kc-ass"><Select id="kc-ass" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}><option value="">Ninguém</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            <Field label="Prazo" htmlFor="kc-due"><Input id="kc-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            <div className="flex items-end gap-2">
              <Button type="submit" size="sm" loading={pending}>Criar cartão</Button>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={pending}>Cancelar</Button>
            </div>
          </form>
        ) : (
          <Button size="sm" onClick={() => setAdding(true)} data-testid="kanban-new-card">Novo cartão</Button>
        )
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="kanban-columns">
        {columns.map((col) => {
          const list = cards.filter((c) => c.columnId === col.id);
          return (
            <section key={col.id} aria-label={col.name} className="rounded-md border border-border bg-surface p-2">
              <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">{col.name}<Badge tone={col.isDone ? "success" : "neutral"}>{list.length}</Badge></h3>
              <ul className="space-y-2">
                {list.length === 0 ? <li className="px-1 text-xs text-muted">Nenhum cartão.</li> : null}
                {list.map((c) => (
                  <li key={c.id} className="rounded-md border border-border bg-surface-2 p-2 text-sm" data-testid="kanban-card">
                    <p className="font-medium">{c.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[c.assigneeName, c.caseTitle, c.clientName].filter(Boolean).join(" · ") || "Sem vínculo"}
                    </p>
                    {c.dueLabel ? <p className={`text-xs ${c.overdue && !c.closed ? "text-danger" : "text-muted"}`}>Prazo: {c.dueLabel}{c.overdue && !c.closed ? " (atrasado)" : ""}</p> : null}
                    {canWrite ? (
                      <div className="mt-2 flex items-center gap-2">
                        <Select aria-label={`Mover "${c.title}"`} value={c.columnId} disabled={pending} onChange={(e) => run(() => moveCardAction(c.id, e.target.value))} className="h-8 text-xs">
                          {columns.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </Select>
                        <ConfirmAction label="Excluir" confirmLabel="Excluir cartão" description="O cartão sai do quadro." action={() => deleteCardAction(c.id)} onDone={() => undefined} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function NewBoardForm() {
  const { run, pending, error } = useRun();
  const [name, setName] = React.useState("");
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => createBoardAction(name), undefined, () => setName("")); }}>
      <Field label="Novo quadro" htmlFor="nb-name" error={error ?? undefined}><Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Contratos e novos casos" /></Field>
      <Button type="submit" size="sm" loading={pending}>Criar quadro</Button>
    </form>
  );
}

export function BoardAdmin({ boardId, name, columns }: { boardId: string; name: string; columns: KColumn[] }) {
  const { run, pending, error } = useRun();
  const [boardName, setBoardName] = React.useState(name);
  const [newCol, setNewCol] = React.useState("");
  const [newDone, setNewDone] = React.useState(false);
  return (
    <Card>
      <CardHeader title="Gerenciar este quadro" description="Só quem administra o escritório. Colunas marcadas como concluído fecham o cartão." />
      <CardBody className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => renameBoardAction(boardId, boardName), "Nome salvo."); }}>
          <Field label="Nome do quadro" htmlFor="ba-name"><Input id="ba-name" value={boardName} onChange={(e) => setBoardName(e.target.value)} /></Field>
          <Button type="submit" size="sm" variant="secondary" loading={pending}>Salvar nome</Button>
          <ConfirmAction label="Arquivar quadro" confirmLabel="Arquivar" description="O quadro some da lista; os cartões ficam guardados." action={() => archiveBoardAction(boardId)} />
        </form>
        <ul className="divide-y divide-border text-sm">
          {columns.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <ColumnRow c={c} disabled={pending} onSave={(n, d) => run(() => renameColumnAction(c.id, n, d), "Coluna salva.")} />
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" disabled={pending || i === 0} onClick={() => run(() => shiftColumnAction(c.id, -1))} aria-label={`Mover ${c.name} para a esquerda`}>←</Button>
                <Button size="sm" variant="ghost" disabled={pending || i === columns.length - 1} onClick={() => run(() => shiftColumnAction(c.id, 1))} aria-label={`Mover ${c.name} para a direita`}>→</Button>
                <ConfirmAction label="Excluir" confirmLabel="Excluir coluna" description="Só colunas vazias podem ser excluídas." action={() => deleteColumnAction(c.id)} />
              </div>
            </li>
          ))}
        </ul>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addColumnAction(boardId, newCol, newDone), undefined, () => setNewCol("")); }}>
          <Field label="Nova coluna" htmlFor="ba-col"><Input id="ba-col" value={newCol} onChange={(e) => setNewCol(e.target.value)} /></Field>
          <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" checked={newDone} onChange={(e) => setNewDone(e.target.checked)} /> conta como concluído</label>
          <Button type="submit" size="sm" loading={pending}>Adicionar coluna</Button>
        </form>
      </CardBody>
    </Card>
  );
}

function ColumnRow({ c, onSave, disabled }: { c: KColumn; onSave: (name: string, done: boolean) => void; disabled: boolean }) {
  const [name, setName] = React.useState(c.name);
  const [done, setDone] = React.useState(c.isDone);
  const dirty = name !== c.name || done !== c.isDone;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label={`Nome da coluna ${c.name}`} value={name} onChange={(e) => setName(e.target.value)} className="w-44" />
      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} /> concluído</label>
      {dirty ? <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onSave(name, done)}>Salvar</Button> : null}
    </div>
  );
}
