"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Calculator } from "lucide-react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatYmd } from "@/lib/dates/ymd";
import { calculateDeadlineAction, createDeadlineAction, updateDeadlineAction } from "./actions";
import { COUNT_TYPES, COUNT_TYPE_LABEL, DEADLINE_KINDS, deadlineSchema, type DeadlineInput } from "./schemas";


export function DeadlineForm({
  deadlineId,
  initial,
  members,
  cases,
  lockCase,
  noticeId,
}: {
  deadlineId?: string;
  initial: DeadlineInput;
  members: { id: string; name: string }[];
  cases: { id: string; title: string; number: string | null }[];
  lockCase?: boolean;
  noticeId?: string;
}) {
  const router = useRouter();
  const [calcMsg, setCalcMsg] = React.useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [calculating, startCalc] = React.useTransition();
  const [notice, setNotice] = React.useState<string | null>(null);
  const { form, submit, pending, message } = useServerForm<DeadlineInput, { id: string }>({
    schema: deadlineSchema,
    defaultValues: initial,
    action: async (v) => {
      if (deadlineId) {
        const res = await updateDeadlineAction(deadlineId, v);
        if (res.ok && res.data?.revalidate) setNotice("A data foi alterada: a validação anterior foi desfeita e o prazo precisa ser validado novamente.");
        return res.ok ? { ok: true, data: { id: deadlineId } } : { ok: false, message: res.message, fieldErrors: res.fieldErrors };
      }
      return createDeadlineAction(v, noticeId);
    },
    onSuccess: (data) => {
      router.replace(`/prazos/${data?.id ?? deadlineId}`);
      router.refresh();
    },
  });
  const err = (n: keyof DeadlineInput) => fieldError(form, n);

  const calculate = () => {
    setCalcMsg(null);
    const [startDate, days, countType] = form.getValues(["startDate", "days", "countType"]);
    startCalc(async () => {
      const res = await calculateDeadlineAction({ startDate, days, countType });
      if (!res.ok || !res.data) {
        setCalcMsg({ tone: "error", text: res.message ?? "Não foi possível calcular. Confira a data de início, os dias e o tipo de contagem." });
        return;
      }
      form.setValue("dueDate", res.data.dueDate, { shouldDirty: true, shouldValidate: true });
      form.setValue("calculationNote", res.data.note, { shouldDirty: true });
      setCalcMsg({ tone: "info", text: `Sugestão: ${formatYmd(res.data.dueDate)}. Confira o resultado antes de salvar — o cálculo é apenas um auxílio.` });
    });
  };

  const caseOptions = cases.some((c) => c.id === initial.caseId) || !initial.caseId ? cases : [{ id: initial.caseId, title: "Processo vinculado", number: null }, ...cases];

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      {notice ? <Alert tone="warning">{notice}</Alert> : null}
      <Alert tone="warning">
        Todo prazo cadastrado fica <strong>aguardando validação</strong> até que um profissional habilitado o confira e valide. A calculadora é uma sugestão
        (considera fins de semana, feriados nacionais, recesso forense e Sexta-feira Santa) e <strong>não substitui a conferência humana</strong> — feriados locais e suspensões de prazo não são considerados.
      </Alert>

      <Card>
        <CardHeader title="Identificação" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Processo" htmlFor="caseId" error={err("caseId")}>
              <Select id="caseId" disabled={lockCase} aria-invalid={Boolean(err("caseId"))} {...form.register("caseId")}>
                <option value="">Selecione…</option>
                {caseOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}{c.number ? ` — ${c.number}` : ""}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Título" htmlFor="title" error={err("title")}>
            <Input id="title" aria-invalid={Boolean(err("title"))} {...form.register("title")} />
          </Field>
          <Field label="Tipo" htmlFor="kind" error={err("kind")}>
            <Input id="kind" list="deadline-kinds" {...form.register("kind")} />
            <datalist id="deadline-kinds">
              {DEADLINE_KINDS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>
          <Field label="Responsável" htmlFor="responsibleId" error={err("responsibleId")}>
            <Select id="responsibleId" {...form.register("responsibleId")}>
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contagem" description="Opcional: preencha para calcular a data sugerida. Você pode informar a data fatal diretamente." />
        <CardBody className="grid gap-4 md:grid-cols-4">
          <Field label="Ciência / publicação" htmlFor="startDate" error={err("startDate")} hint="O início da contagem é o primeiro dia útil seguinte.">
            <Input id="startDate" type="date" {...form.register("startDate")} />
          </Field>
          <Field label="Dias" htmlFor="days" error={err("days")}>
            <Input id="days" inputMode="numeric" {...form.register("days")} />
          </Field>
          <Field label="Contagem" htmlFor="countType" error={err("countType")}>
            <Select id="countType" {...form.register("countType")}>
              <option value="">—</option>
              {COUNT_TYPES.map((c) => (
                <option key={c} value={c}>{COUNT_TYPE_LABEL[c]}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button variant="secondary" onClick={calculate} loading={calculating}>
              <Calculator className="h-4 w-4" aria-hidden /> Calcular sugestão
            </Button>
          </div>
          {calcMsg ? (
            <div className="md:col-span-4">
              <Alert tone={calcMsg.tone === "error" ? "error" : "info"}>{calcMsg.text}</Alert>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Datas" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label="Data fatal" htmlFor="dueDate" error={err("dueDate")}>
            <Input id="dueDate" type="date" aria-invalid={Boolean(err("dueDate"))} {...form.register("dueDate")} />
          </Field>
          <Field label="Prazo interno" htmlFor="internalDueDate" error={err("internalDueDate")} hint="Meta de entrega anterior à data fatal.">
            <Input id="internalDueDate" type="date" aria-invalid={Boolean(err("internalDueDate"))} {...form.register("internalDueDate")} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Memória do cálculo" htmlFor="calculationNote" error={err("calculationNote")}>
              <Textarea id="calculationNote" rows={2} {...form.register("calculationNote")} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Observações" htmlFor="notes" error={err("notes")}>
              <Textarea id="notes" rows={3} {...form.register("notes")} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{deadlineId ? "Salvar alterações" : "Cadastrar prazo"}</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
