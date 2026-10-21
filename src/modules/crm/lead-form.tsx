"use client";

import { useRouter } from "next/navigation";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createLeadAction, updateLeadAction } from "./actions";
import { leadSchema, type LeadInput } from "./schemas";

export function LeadForm({ leadId, initial, members }: { leadId?: string; initial: LeadInput; members: { id: string; name: string }[] }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<LeadInput, { id: string }>({
    schema: leadSchema,
    defaultValues: initial,
    action: async (v) => {
      if (leadId) {
        const res = await updateLeadAction(leadId, v);
        return res.ok ? { ok: true, data: { id: leadId } } : { ok: false, message: res.message, fieldErrors: res.fieldErrors };
      }
      return createLeadAction(v);
    },
    onSuccess: (d) => {
      router.replace(`/crm/${d?.id ?? leadId}`);
      router.refresh();
    },
  });
  const err = (n: keyof LeadInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label="Nome" htmlFor="lead-name" error={err("name")}>
            <Input id="lead-name" aria-invalid={Boolean(err("name"))} {...form.register("name")} />
          </Field>
          <Field label="Tipo" htmlFor="lead-type" error={err("type")}>
            <Select id="lead-type" {...form.register("type")}>
              <option value="PERSON">Pessoa física</option>
              <option value="COMPANY">Pessoa jurídica</option>
            </Select>
          </Field>
          <Field label="E-mail" htmlFor="lead-email" error={err("email")}>
            <Input id="lead-email" type="email" {...form.register("email")} />
          </Field>
          <Field label="Telefone" htmlFor="lead-phone" error={err("phone")}>
            <Input id="lead-phone" {...form.register("phone")} />
          </Field>
          <Field label="Origem" htmlFor="lead-source" error={err("source")} hint="Ex.: indicação, site, evento.">
            <Input id="lead-source" {...form.register("source")} />
          </Field>
          <Field label="Interesse / área" htmlFor="lead-interest" error={err("interest")}>
            <Input id="lead-interest" {...form.register("interest")} />
          </Field>
          <Field label="Valor estimado (R$)" htmlFor="lead-value" error={err("estimatedValue")}>
            <Input id="lead-value" inputMode="decimal" placeholder="0,00" {...form.register("estimatedValue")} />
          </Field>
          <Field label="Responsável" htmlFor="lead-owner" error={err("ownerId")} hint="Padrão: você.">
            <Select id="lead-owner" {...form.register("ownerId")}>
              <option value="">Eu mesmo</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Próximo contato" htmlFor="lead-next" error={err("nextActionDate")}>
            <Input id="lead-next" type="date" {...form.register("nextActionDate")} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Observações" htmlFor="lead-notes" error={err("notes")}>
              <Textarea id="lead-notes" rows={4} {...form.register("notes")} />
            </Field>
          </div>
        </CardBody>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{leadId ? "Salvar alterações" : "Cadastrar lead"}</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
