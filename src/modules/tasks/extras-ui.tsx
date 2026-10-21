"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Select } from "@/components/ui/form";
import { addTaskAttachmentAction, deleteTaskAttachmentAction, deleteTaskLabelAction, deleteTaskTypeAction, saveTaskLabelAction, saveTaskTypeAction, setTaskClassificationAction } from "./extras-actions";
import { LABEL_COLORS, LABEL_COLOR_LABEL, taskLabelSchema, taskTypeSchema, type TaskLabelInput, type TaskTypeInput } from "./extras-schemas";

export const LABEL_TONE = { gray: "neutral", blue: "info", green: "success", amber: "warning", red: "danger", purple: "accent" } as const;
export function LabelBadge({ name, color }: { name: string; color: string }) {
  return <Badge tone={LABEL_TONE[color as keyof typeof LABEL_TONE] ?? "neutral"}>{name}</Badge>;
}

/* ---------- Configurações: tipos de tarefa ---------- */
type TypeRow = { id: string; name: string; points: number };
function TypeForm({ id, initial, onDone, onCancel }: { id?: string; initial: TaskTypeInput; onDone: () => void; onCancel: () => void }) {
  const { form, submit, pending, message } = useServerForm<TaskTypeInput, unknown>({ schema: taskTypeSchema, defaultValues: initial, action: (v) => saveTaskTypeAction(id ?? null, v), onSuccess: onDone });
  const err = (n: keyof TaskTypeInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-md border border-border bg-surface-2/50 p-3" aria-label={id ? "Editar tipo de tarefa" : "Novo tipo de tarefa"}>
      {message ? <Alert tone="error">{message}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-[1fr_160px]">
        <Field label="Nome do tipo" htmlFor="tt-name" error={err("name")}><Input id="tt-name" {...form.register("name")} /></Field>
        <Field label="Pontos" htmlFor="tt-points" error={err("points")}><Input id="tt-points" type="number" min={0} max={100} {...form.register("points", { valueAsNumber: true })} /></Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>{id ? "Salvar" : "Cadastrar tipo"}</Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}

export function TaskTypesAdmin({ rows, canEdit }: { rows: TypeRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const done = () => { setEditing(null); router.refresh(); };
  return (
    <Card>
      <CardHeader
        title="Tipos de tarefa e pontuação"
        description="Cada tipo vale uma pontuação. Ao concluir tarefas com tipo, os pontos aparecem no relatório do mês, por responsável."
        action={canEdit && editing === null ? <Button size="sm" onClick={() => setEditing("new")}>Novo tipo</Button> : undefined}
      />
      <CardBody className="space-y-3">
        {editing === "new" ? <TypeForm initial={{ name: "", points: 1 }} onDone={done} onCancel={() => setEditing(null)} /> : null}
        {rows.length === 0 && editing !== "new" ? <p className="text-sm text-muted">Nenhum tipo cadastrado.</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) =>
            editing === r.id ? (
              <li key={r.id} className="py-3"><TypeForm id={r.id} initial={{ name: r.name, points: r.points }} onDone={done} onCancel={() => setEditing(null)} /></li>
            ) : (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5" data-testid="task-type-row">
                <p className="text-sm font-medium">{r.name} <Badge tone="info">{r.points} pt</Badge></p>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(r.id)}>Editar</Button>
                    <ConfirmAction label="Excluir" confirmLabel="Excluir tipo" description="As tarefas que usam este tipo ficam sem tipo." action={() => deleteTaskTypeAction(r.id)} onDone={() => router.refresh()} />
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      </CardBody>
    </Card>
  );
}

/* ---------- Configurações: etiquetas ---------- */
type LabelRow = { id: string; name: string; color: string };
function LabelForm({ id, initial, onDone, onCancel }: { id?: string; initial: TaskLabelInput; onDone: () => void; onCancel: () => void }) {
  const { form, submit, pending, message } = useServerForm<TaskLabelInput, unknown>({ schema: taskLabelSchema, defaultValues: initial, action: (v) => saveTaskLabelAction(id ?? null, v), onSuccess: onDone });
  const err = (n: keyof TaskLabelInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-md border border-border bg-surface-2/50 p-3" aria-label={id ? "Editar etiqueta" : "Nova etiqueta"}>
      {message ? <Alert tone="error">{message}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-[1fr_200px]">
        <Field label="Nome da etiqueta" htmlFor="tl-name" error={err("name")}><Input id="tl-name" {...form.register("name")} /></Field>
        <Field label="Cor" htmlFor="tl-color" error={err("color")}>
          <Select id="tl-color" {...form.register("color")}>{LABEL_COLORS.map((c) => <option key={c} value={c}>{LABEL_COLOR_LABEL[c]}</option>)}</Select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>{id ? "Salvar" : "Cadastrar etiqueta"}</Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}

export function TaskLabelsAdmin({ rows, canEdit }: { rows: LabelRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const done = () => { setEditing(null); router.refresh(); };
  return (
    <Card>
      <CardHeader title="Etiquetas" description="Marcadores coloridos para organizar e filtrar tarefas." action={canEdit && editing === null ? <Button size="sm" onClick={() => setEditing("new")}>Nova etiqueta</Button> : undefined} />
      <CardBody className="space-y-3">
        {editing === "new" ? <LabelForm initial={{ name: "", color: "blue" }} onDone={done} onCancel={() => setEditing(null)} /> : null}
        {rows.length === 0 && editing !== "new" ? <p className="text-sm text-muted">Nenhuma etiqueta cadastrada.</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) =>
            editing === r.id ? (
              <li key={r.id} className="py-3"><LabelForm id={r.id} initial={{ name: r.name, color: r.color as TaskLabelInput["color"] }} onDone={done} onCancel={() => setEditing(null)} /></li>
            ) : (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5" data-testid="task-label-row">
                <LabelBadge name={r.name} color={r.color} />
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(r.id)}>Editar</Button>
                    <ConfirmAction label="Excluir" confirmLabel="Excluir etiqueta" description="Ela é retirada de todas as tarefas." action={() => deleteTaskLabelAction(r.id)} onDone={() => router.refresh()} />
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      </CardBody>
    </Card>
  );
}

/* ---------- Tarefa: tipo + etiquetas ---------- */
export function ClassificationCard({ taskId, types, labels, typeId, labelIds, canWrite }: { taskId: string; types: TypeRow[]; labels: LabelRow[]; typeId: string; labelIds: string[]; canWrite: boolean }) {
  const router = useRouter();
  const [type, setType] = React.useState(typeId);
  const [sel, setSel] = React.useState<string[]>(labelIds);
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await setTaskClassificationAction(taskId, { typeId: type, labelIds: sel });
      setMsg(res.ok ? "Salvo." : (res.message ?? "Não foi possível salvar."));
      router.refresh();
    });
  };
  return (
    <Card>
      <CardHeader title="Tipo e etiquetas" />
      <CardBody className="space-y-3">
        <div>
          <label htmlFor="cls-type" className="text-xs text-muted">Tipo (pontuação)</label>
          <Select id="cls-type" value={type} disabled={!canWrite || pending} onChange={(e) => setType(e.target.value)}>
            <option value="">Sem tipo</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.points} pt)</option>)}
          </Select>
        </div>
        <fieldset disabled={!canWrite || pending}>
          <legend className="text-xs text-muted">Etiquetas</legend>
          {labels.length === 0 ? <p className="text-xs text-muted">Nenhuma etiqueta cadastrada (Configurações → Tarefas).</p> : null}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1.5">
            {labels.map((l) => (
              <label key={l.id} className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={sel.includes(l.id)} onChange={(e) => setSel((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))} />
                <LabelBadge name={l.name} color={l.color} />
              </label>
            ))}
          </div>
        </fieldset>
        {canWrite ? <Button size="sm" onClick={save} loading={pending}>Salvar classificação</Button> : null}
        {msg ? <p role="status" className="text-xs text-muted">{msg}</p> : null}
      </CardBody>
    </Card>
  );
}

/* ---------- Tarefa: anexos ---------- */
export function AttachmentsCard({ taskId, items, canWrite, tz: _tz }: { taskId: string; items: { id: string; name: string; sizeBytes: number; createdAt: string; uploadedByName: string | null }[]; canWrite: boolean; tz?: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <Card>
      <CardHeader title={`Anexos (${items.length})`} />
      <CardBody className="space-y-3">
        {items.length === 0 ? <p className="text-sm text-muted">Nenhum anexo.</p> : null}
        <ul className="divide-y divide-border">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm" data-testid="task-attachment">
              <span className="min-w-0 truncate">
                <a className="hover:underline" href={`/api/tasks/attachments/${a.id}`}>{a.name}</a>
                <span className="ml-2 text-xs text-muted">{kb(a.sizeBytes)}{a.uploadedByName ? ` · ${a.uploadedByName}` : ""}</span>
              </span>
              {canWrite ? <ConfirmAction label="Remover" confirmLabel="Remover anexo" description="O anexo deixa de aparecer na tarefa." action={() => deleteTaskAttachmentAction(taskId, a.id)} onDone={() => router.refresh()} /> : null}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form
            ref={formRef}
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setMsg(null);
              start(async () => {
                const res = await addTaskAttachmentAction(taskId, fd);
                if (res.ok) formRef.current?.reset();
                setMsg(res.ok ? "Anexo adicionado." : (res.fieldErrors?.file?.[0] ?? res.message ?? "Não foi possível anexar."));
                router.refresh();
              });
            }}
          >
            <label htmlFor="att-file" className="sr-only">Arquivo</label>
            <input id="att-file" name="file" type="file" className="text-xs" />
            <Button type="submit" size="sm" variant="secondary" loading={pending}>Anexar</Button>
          </form>
        ) : null}
        {msg ? <p role="status" className="text-xs text-muted">{msg}</p> : null}
      </CardBody>
    </Card>
  );
}

/* ---------- Comentário: inserir menção ---------- */
export function MentionPicker({ members, onPick }: { members: { id: string; name: string }[]; onPick: (name: string) => void }) {
  return (
    <div>
      <label htmlFor="mention-pick" className="sr-only">Mencionar alguém</label>
      <Select id="mention-pick" className="h-8 text-xs" value="" onChange={(e) => { if (e.target.value) onPick(e.target.value); }}>
        <option value="">@ Mencionar…</option>
        {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
      </Select>
    </div>
  );
}
