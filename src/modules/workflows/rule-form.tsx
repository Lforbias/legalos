"use client";

import { useRouter } from "next/navigation";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createRuleAction, updateRuleAction } from "./actions";
import { ASSIGNEE_LABEL, ruleSchema, TASK_PRIORITIES, TASK_PRIORITY_LABEL, TRIGGER_HINT, TRIGGER_LABEL, WORKFLOW_ASSIGNEES, WORKFLOW_TRIGGERS, type RuleInput } from "./schemas";

export function RuleForm({ ruleId, initial, members }: { ruleId?: string; initial: RuleInput; members: { id: string; name: string }[] }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<RuleInput, { id: string }>({
    schema: ruleSchema,
    defaultValues: initial,
    action: async (v) => {
      if (ruleId) {
        const res = await updateRuleAction(ruleId, v);
        return res.ok ? { ok: true, data: { id: ruleId } } : { ok: false, message: res.message, fieldErrors: res.fieldErrors };
      }
      return createRuleAction(v);
    },
    onSuccess: () => {
      router.replace("/automacoes");
      router.refresh();
    },
  });
  const err = (n: keyof RuleInput) => fieldError(form, n);
  const trigger = form.watch("trigger");
  const mode = form.watch("assigneeMode");
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Nome da regra" htmlFor="rule-name" error={err("name")}>
              <Input id="rule-name" aria-invalid={Boolean(err("name"))} {...form.register("name")} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Gatilho" htmlFor="rule-trigger" error={err("trigger")} hint={TRIGGER_HINT[trigger]}>
              <Select id="rule-trigger" {...form.register("trigger")}>
                {WORKFLOW_TRIGGERS.map((t) => (
                  <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Título da tarefa criada" htmlFor="rule-title" error={err("taskTitle")} hint="Use {{gatilho}} para inserir o nome do item que disparou a regra.">
              <Input id="rule-title" aria-invalid={Boolean(err("taskTitle"))} {...form.register("taskTitle")} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Descrição (opcional)" htmlFor="rule-desc" error={err("taskDescription")}>
              <Textarea id="rule-desc" rows={3} {...form.register("taskDescription")} />
            </Field>
          </div>
          <Field label="Prazo da tarefa (dias corridos)" htmlFor="rule-days" error={err("dueDays")}>
            <Input id="rule-days" inputMode="numeric" {...form.register("dueDays")} />
          </Field>
          <Field label="Prioridade" htmlFor="rule-priority" error={err("priority")}>
            <Select id="rule-priority" {...form.register("priority")}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável pela tarefa" htmlFor="rule-mode" error={err("assigneeMode")}>
            <Select id="rule-mode" {...form.register("assigneeMode")}>
              {WORKFLOW_ASSIGNEES.map((a) => (
                <option key={a} value={a}>{ASSIGNEE_LABEL[a]}</option>
              ))}
            </Select>
          </Field>
          {mode === "FIXED" ? (
            <Field label="Membro" htmlFor="rule-assignee" error={err("assigneeId")}>
              <Select id="rule-assignee" {...form.register("assigneeId")}>
                <option value="">Escolha…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" className="h-4 w-4" {...form.register("active")} /> Regra ativa
          </label>
        </CardBody>
      </Card>
      <Alert tone="info">Esta versão cria apenas <strong>tarefas</strong>. A regra roda uma única vez por item (repetir o gatilho não duplica a tarefa) e nunca impede a ação original.</Alert>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{ruleId ? "Salvar regra" : "Criar regra"}</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
