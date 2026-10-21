"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ClientPicker } from "@/modules/clients/client-picker";
import { createTaskAction, updateTaskAction } from "./actions";
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, taskSchema, type TaskInput } from "./schemas";


export function TaskForm({
  taskId,
  initial,
  members,
  cases,
  initialClientLabel = "",
  noticeId,
}: {
  taskId?: string;
  initial: TaskInput;
  members: { id: string; name: string }[];
  cases: { id: string; title: string; number: string | null }[];
  initialClientLabel?: string;
  noticeId?: string;
}) {
  const router = useRouter();
  const [clientLabel, setClientLabel] = React.useState(initialClientLabel);
  const { form, submit, pending, message } = useServerForm<TaskInput, { id: string }>({
    schema: taskSchema,
    defaultValues: initial,
    action: async (v) => {
      if (taskId) {
        const res = await updateTaskAction(taskId, v);
        return res.ok ? { ok: true, data: { id: taskId } } : { ok: false, message: res.message, fieldErrors: res.fieldErrors };
      }
      return createTaskAction(v, noticeId);
    },
    onSuccess: (data) => {
      router.replace(`/tarefas/${data?.id ?? taskId}`);
      router.refresh();
    },
  });
  const err = (n: keyof TaskInput) => fieldError(form, n);
  const clientId = form.watch("clientId");
  const caseOptions = cases.some((c) => c.id === initial.caseId) || !initial.caseId ? cases : [{ id: initial.caseId, title: "Processo vinculado", number: null }, ...cases];

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Título" htmlFor="title" error={err("title")}>
              <Input id="title" aria-invalid={Boolean(err("title"))} {...form.register("title")} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Descrição" htmlFor="description" error={err("description")}>
              <Textarea id="description" rows={4} {...form.register("description")} />
            </Field>
          </div>
          <Field label="Situação" htmlFor="status" error={err("status")}>
            <Select id="status" {...form.register("status")}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade" htmlFor="priority" error={err("priority")}>
            <Select id="priority" {...form.register("priority")}>
              {TASK_PRIORITIES.map((s) => (
                <option key={s} value={s}>{TASK_PRIORITY_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Vencimento" htmlFor="dueDate" error={err("dueDate")}>
            <Input id="dueDate" type="date" aria-invalid={Boolean(err("dueDate"))} {...form.register("dueDate")} />
          </Field>
          <Field label="Responsável" htmlFor="assigneeId" error={err("assigneeId")}>
            <Select id="assigneeId" {...form.register("assigneeId")}>
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Processo" htmlFor="caseId" error={err("caseId")} hint="Opcional. Lista os 200 processos mais recentes que você pode ver.">
            <Select id="caseId" {...form.register("caseId")}>
              <option value="">Sem processo</option>
              {caseOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.title}{c.number ? ` — ${c.number}` : ""}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cliente" htmlFor="clientId" error={err("clientId")} hint="Opcional.">
            <ClientPicker
              id="clientId"
              value={clientId}
              label={clientLabel}
              invalid={Boolean(err("clientId"))}
              onChange={(id, label) => {
                form.setValue("clientId", id, { shouldDirty: true });
                setClientLabel(label);
              }}
            />
          </Field>
        </CardBody>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{taskId ? "Salvar alterações" : "Criar tarefa"}</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
