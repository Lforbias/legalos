"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
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

export function CommentForm({ taskId, members = [] }: { taskId: string; members?: { id: string; name: string }[] }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<CommentInput, undefined>({
    schema: commentSchema,
    defaultValues: { body: "" },
    action: (v) => addTaskCommentAction(taskId, v),
    onSuccess: (_d, f) => {
      f.reset({ body: "" });
      router.refresh();
    },
  });
  const err = fieldError(form, "body");
  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <label htmlFor="comment-body" className="sr-only">Comentário</label>
      <Textarea id="comment-body" rows={3} placeholder="Escreva um comentário…" aria-invalid={Boolean(err)} {...form.register("body")} />
      {err ? <p role="alert" className="text-xs text-danger">{err}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" loading={pending}>Comentar</Button>
        {members.length ? <MentionPicker members={members} onPick={(name) => form.setValue("body", `${form.getValues("body")}${form.getValues("body") && !form.getValues("body").endsWith(" ") ? " " : ""}@${name} `, { shouldDirty: true })} /> : null}
      </div>
    </form>
  );
}
