"use client";

import { useRouter } from "next/navigation";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { logTimeAction } from "./actions";
import { timeEntrySchema, type TimeEntryInput } from "./schemas";

export function TimeForm({ today, cases }: { today: string; cases: { id: string; title: string }[] }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<TimeEntryInput, undefined>({
    schema: timeEntrySchema,
    defaultValues: { date: today, duration: "", description: "", caseId: "" },
    action: (v) => logTimeAction(v),
    onSuccess: (_d, f) => {
      f.reset({ date: today, duration: "", description: "", caseId: "" });
      router.refresh();
    },
  });
  const err = (n: keyof TimeEntryInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-4">
      {message ? <div className="md:col-span-4"><Alert tone="error">{message}</Alert></div> : null}
      <Field label="Data" htmlFor="t-date" error={err("date")}>
        <Input id="t-date" type="date" {...form.register("date")} />
      </Field>
      <Field label="Duração" htmlFor="t-duration" error={err("duration")} hint="Ex.: 1:30, 1,5 ou 45min">
        <Input id="t-duration" autoComplete="off" aria-invalid={Boolean(err("duration"))} {...form.register("duration")} />
      </Field>
      <div className="md:col-span-2">
        <Field label="Processo (opcional)" htmlFor="t-case" error={err("caseId")}>
          <Select id="t-case" {...form.register("caseId")}>
            <option value="">Sem processo</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="md:col-span-3">
        <Field label="Atividade" htmlFor="t-desc" error={err("description")}>
          <Input id="t-desc" aria-invalid={Boolean(err("description"))} {...form.register("description")} />
        </Field>
      </div>
      <div className="flex items-end">
        <Button type="submit" loading={pending}>Registrar horas</Button>
      </div>
    </form>
  );
}
