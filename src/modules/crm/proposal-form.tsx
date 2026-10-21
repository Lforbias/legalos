"use client";

import { useRouter } from "next/navigation";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { createProposalAction, updateProposalAction } from "./actions";
import { proposalSchema, type ProposalInput } from "./schemas";

export function ProposalForm({ leadId, proposalId, initial }: { leadId: string; proposalId?: string; initial: ProposalInput }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<ProposalInput, unknown>({
    schema: proposalSchema,
    defaultValues: initial,
    action: async (v) => (proposalId ? updateProposalAction(proposalId, v) : createProposalAction(leadId, v)),
    onSuccess: () => {
      router.replace(`/crm/${leadId}`);
      router.refresh();
    },
  });
  const err = (n: keyof ProposalInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Título" htmlFor="prop-title" error={err("title")}>
              <Input id="prop-title" aria-invalid={Boolean(err("title"))} {...form.register("title")} />
            </Field>
          </div>
          <Field label="Valor (R$)" htmlFor="prop-amount" error={err("amount")}>
            <Input id="prop-amount" inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(err("amount"))} {...form.register("amount")} />
          </Field>
          <Field label="Válida até" htmlFor="prop-valid" error={err("validUntil")}>
            <Input id="prop-valid" type="date" {...form.register("validUntil")} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Escopo e condições" htmlFor="prop-desc" error={err("description")}>
              <Textarea id="prop-desc" rows={6} {...form.register("description")} />
            </Field>
          </div>
        </CardBody>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{proposalId ? "Salvar proposta" : "Criar proposta"}</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
