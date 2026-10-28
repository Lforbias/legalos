"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { addTaskCommentAction, changeTaskStatusAction } from "./actions";
import { selectStageAction } from "./stage-actions";
import { MentionPicker } from "./extras-ui";
import { commentSchema, TASK_STATUSES, TASK_STATUS_LABEL, type CommentInput } from "./schemas";

/** Troca a situação da tarefa (alternativa acessível ao arrastar cartões). */
export function TaskStatusSelect({ taskId, status, disabled, compact, stages = [], stageId }: { taskId: string; status: string; disabled?: boolean; compact?: boolean; stages?: { id: string; name: string; active: boolean }[]; stageId?: string | null }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div>
      <label className="sr-only" htmlFor={`st-${taskId}`}>Situação da tarefa</label>
      <Select
        id={`st-${taskId}`}
        value={stageId && stages.some(s => s.id === stageId) ? `stage:${stageId}` : status}
        disabled={disabled || pending}
        className={compact ? "h-8 text-xs" : undefined}
        onChange={(e) => {
          const next = e.target.value;
          setError(null);
          start(async () => {
            const res = next.startsWith("stage:") ? await selectStageAction(taskId, next.slice(6)) : await changeTaskStatusAction(taskId, next);
            if (!res.ok) setError(res.message ?? "Não foi possível alterar a situação.");
            router.refresh();
          });
        }}
      >
        {stages.filter(s => s.active || s.id === stageId).map(s => <option key={s.id} value={`stage:${s.id}`}>{s.name}{!s.active ? " (desativada)" : ""}</option>)}
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
        ))}
      </Select>
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function CommentForm({ taskId, members = [], dueDate, updatedAt }: { taskId: string; members?: { id: string; name: string }[]; dueDate?: string; updatedAt?: string }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<CommentInput, undefined>({
    schema: commentSchema,
    defaultValues: { body: "" },
    action: (v) => addTaskCommentAction(taskId, { ...v, dueDate: v.reschedule ? v.dueDate : undefined, expectedUpdatedAt: v.reschedule ? updatedAt : undefined }),
    onSuccess: (_d, f) => {
      f.reset({ body: "", reschedule: false });
      router.refresh();
    },
  });
  const reschedule = form.watch("reschedule");
  const err = fieldError(form, "body");
  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <label htmlFor="comment-body" className="sr-only">Comentário</label>
      <Textarea id="comment-body" rows={3} placeholder="Registre o retorno do cliente ou mencione um colega com @Nome…" aria-invalid={Boolean(err)} {...form.register("body")} />
      {err ? <p role="alert" className="text-xs text-danger">{err}</p> : null}
      <p className="text-xs text-muted">Use Mencionar colega para escolher quem deve receber uma notificação. Menções respeitam o acesso à tarefa.</p>
      {updatedAt ? <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...form.register("reschedule")} onChange={e => { form.setValue("reschedule", e.target.checked); form.setValue("dueDate", e.target.checked ? dueDate : undefined); }} />Alterar vencimento com este comentário</label>
        {reschedule ? <div><label htmlFor="comment-due" className="text-xs text-muted">Novo vencimento</label><Input id="comment-due" type="date" {...form.register("dueDate")} required aria-invalid={Boolean(fieldError(form, "dueDate"))} />{fieldError(form, "dueDate") ? <p role="alert" className="text-xs text-danger">{fieldError(form, "dueDate")}</p> : null}</div> : null}
      </div> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" loading={pending}>{reschedule ? "Comentar e remarcar" : "Comentar"}</Button>
        {members.length ? <MentionPicker members={members} onPick={(name) => form.setValue("body", `${form.getValues("body")}${form.getValues("body") && !form.getValues("body").endsWith(" ") ? " " : ""}@${name} `, { shouldDirty: true })} /> : null}
      </div>
    </form>
  );
}
