"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Trash2 } from "lucide-react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ClientPicker } from "@/modules/clients/client-picker";
import { createEventAction, deleteEventAction, updateEventAction } from "./actions";
import { EVENT_KINDS, EVENT_KIND_LABEL, eventSchema, type EventInput } from "./schemas";


export function EventForm({
  eventId,
  initial,
  cases,
  initialClientLabel = "",
  members = [],
}: {
  members?: {id:string;name:string}[];
  eventId?: string;
  initial: EventInput;
  cases: { id: string; title: string; number: string | null }[];
  initialClientLabel?: string;
}) {
  const router = useRouter();
  const [clientLabel, setClientLabel] = React.useState(initialClientLabel);
  const { form, submit, pending, message } = useServerForm<EventInput, { id: string }>({
    schema: eventSchema,
    defaultValues: initial,
    action: async (v) => {
      if (eventId) {
        const res = await updateEventAction(eventId, v);
        return res.ok ? { ok: true, data: { id: eventId } } : { ok: false, message: res.message, fieldErrors: res.fieldErrors };
      }
      return createEventAction(v);
    },
    onSuccess: () => {
      router.replace(`/agenda?mes=${form.getValues("date").slice(0, 7)}`);
      router.refresh();
    },
  });
  const err = (n: keyof EventInput) => fieldError(form, n);
  const allDay = form.watch("allDay");
  const clientId = form.watch("clientId");
  const caseOptions = cases.some((c) => c.id === initial.caseId) || !initial.caseId ? cases : [{ id: initial.caseId, title: "Processo vinculado", number: null }, ...cases];

  return (
    <div className="space-y-4">
      <form onSubmit={submit} noValidate className="space-y-4">
        {message ? <Alert tone="error">{message}</Alert> : null}
        <Card>
          <CardBody className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Título" htmlFor="title" error={err("title")}>
                <Input id="title" aria-invalid={Boolean(err("title"))} {...form.register("title")} />
              </Field>
            </div>
            <Field label="Tipo" htmlFor="kind" error={err("kind")}>
              <Select id="kind" {...form.register("kind")}>
                {EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>{EVENT_KIND_LABEL[k]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Responsável" htmlFor="assigneeId" error={err("assigneeId")}><Select id="assigneeId" {...form.register("assigneeId")}><option value="">Sem responsável</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            <Field label="Data" htmlFor="date" error={err("date")}>
              <Input id="date" type="date" aria-invalid={Boolean(err("date"))} {...form.register("date")} />
            </Field>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" className="h-4 w-4" {...form.register("allDay")} /> Dia inteiro
            </label>
            {!allDay ? (
              <>
                <Field label="Início" htmlFor="startTime" error={err("startTime")}>
                  <Input id="startTime" type="time" aria-invalid={Boolean(err("startTime"))} {...form.register("startTime")} />
                </Field>
                <Field label="Término" htmlFor="endTime" error={err("endTime")}>
                  <Input id="endTime" type="time" aria-invalid={Boolean(err("endTime"))} {...form.register("endTime")} />
                </Field>
              </>
            ) : null}
            <div className="md:col-span-2">
              <Field label="Local / link" htmlFor="location" error={err("location")}>
                <Input id="location" {...form.register("location")} />
              </Field>
            </div>
            <Field label="Processo" htmlFor="caseId" error={err("caseId")}>
              <Select id="caseId" {...form.register("caseId")}>
                <option value="">Sem processo</option>
                {caseOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}{c.number ? ` — ${c.number}` : ""}</option>
                ))}
              </Select>
            </Field>
            <Field label="Cliente" htmlFor="clientId" error={err("clientId")}>
              <ClientPicker
                id="clientId"
                value={clientId}
                label={clientLabel}
                onChange={(id, label) => {
                  form.setValue("clientId", id, { shouldDirty: true });
                  setClientLabel(label);
                }}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Descrição" htmlFor="description" error={err("description")}>
                <Textarea id="description" rows={3} {...form.register("description")} />
              </Field>
            </div>
          </CardBody>
        </Card>
        <div className="flex gap-2">
          <Button type="submit" loading={pending}>{eventId ? "Salvar alterações" : "Agendar"}</Button>
          <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
        </div>
      </form>
      {eventId ? (
        <ConfirmAction
          label="Excluir compromisso"
          confirmLabel="Sim, excluir"
          icon={<Trash2 className="h-4 w-4" aria-hidden />}
          action={() => deleteEventAction(eventId)}
          onDone={() => {
            router.replace("/agenda");
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
