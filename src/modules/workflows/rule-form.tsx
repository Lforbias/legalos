"use client";
import { BOX_AVAILABLE } from "@/lib/box-retirement";

import { CONDITION_FIELDS, EMPTY_CONDITIONS } from "./conditions";
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
    defaultValues: { ...initial, conditions: initial.conditions ?? EMPTY_CONDITIONS, noticeAssigneeId: initial.noticeAssigneeId ?? "", noticeTags: initial.noticeTags ?? "" },
    action: async (v) => {
      if (ruleId) {
        const res = await updateRuleAction(ruleId, { ...v, ...(v.trigger !== "NOTICE_RECEIVED" ? { noticeAssigneeId: "", noticeTags: "" } : {}) });
        return res.ok ? { ok: true, data: { id: ruleId } } : { ok: false, message: res.message, fieldErrors: res.fieldErrors };
      }
      return createRuleAction({ ...v, ...(v.trigger !== "NOTICE_RECEIVED" ? { noticeAssigneeId: "", noticeTags: "" } : {}) });
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
              <Select id="rule-trigger" {...form.register("trigger")} onChange={e => {
                const next = e.target.value as RuleInput["trigger"];
                form.setValue("trigger", next, { shouldDirty: true });
                if (next !== "NOTICE_RECEIVED") { form.setValue("noticeAssigneeId", ""); form.setValue("noticeTags", ""); }
              }}>
                {WORKFLOW_TRIGGERS.filter(t => BOX_AVAILABLE || t !== "NOTICE_RECEIVED").map((t) => (
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
      <Card><CardBody className="space-y-3">
        <h2 className="font-medium">Condições</h2>
        <label className="text-sm">Combinação<Select {...form.register("conditions.mode")}><option value="ALL">E — todas devem ser atendidas</option><option value="ANY">OU — ao menos uma deve ser atendida</option></Select></label>
        {(form.watch("conditions.items") ?? []).map((_, i) => <div key={i} className="flex flex-wrap gap-2">
          <label className="text-sm">Campo<Select {...form.register(`conditions.items.${i}.field`)}>{Object.entries(CONDITION_FIELDS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Select></label>
          <label className="text-sm">Comparação<Select {...form.register(`conditions.items.${i}.operator`)}><option value="CONTAINS">Contém</option><option value="EQUALS">Igual a</option><option value="NOT_CONTAINS">Não contém</option></Select></label>
          <label className="text-sm">Valor<Input maxLength={200} {...form.register(`conditions.items.${i}.value`)} />{form.formState.errors.conditions?.items?.[i]?.value?.message ? <span role="alert" className="block text-xs text-danger">{form.formState.errors.conditions.items[i]?.value?.message}</span> : null}</label>
          <Button type="button" variant="ghost" onClick={() => form.setValue("conditions.items", (form.getValues("conditions.items") ?? []).filter((_, j) => i !== j))}>Remover condição</Button>
        </div>)}
        <Button type="button" variant="secondary" disabled={(form.watch("conditions.items")?.length ?? 0) >= 10} onClick={() => form.setValue("conditions.items", [...(form.getValues("conditions.items") ?? []), { field: "label", operator: "CONTAINS", value: "" }])}>Adicionar condição</Button>
        <p className="text-xs text-muted">Sem condições, executa para todo item do gatilho. Comparações ignoram maiúsculas e acentos.</p>
        {trigger === "NOTICE_RECEIVED" ? <><label className="block text-sm">Distribuir intimação para<Select {...form.register("noticeAssigneeId")}><option value="">Preservar distribuição</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></label><label className="block text-sm">Adicionar etiquetas à intimação<Input {...form.register("noticeTags")} placeholder="urgente, revisar" /></label></> : null}
      </CardBody></Card>
      <Alert tone="info">A regra cria uma <strong>tarefa</strong> e pode distribuir e etiquetar intimações. A regra roda uma única vez por item (repetir o gatilho não duplica a tarefa) e nunca impede a ação original.</Alert>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{ruleId ? "Salvar regra" : "Criar regra"}</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
