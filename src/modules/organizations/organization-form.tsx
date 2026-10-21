"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { TIMEZONE_OPTIONS } from "@/lib/validation/timezone";
import { updateOrganizationAction } from "./actions";
import { updateOrganizationSchema, type UpdateOrganizationInput } from "./schemas";

export function OrganizationForm({ initial, canEdit }: { initial: UpdateOrganizationInput; canEdit: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(false);
  const { form, submit, pending, message } = useServerForm<UpdateOrganizationInput, undefined>({
    schema: updateOrganizationSchema,
    defaultValues: initial,
    action: async (v) => {
      setSaved(false);
      return updateOrganizationAction(v);
    },
    onSuccess: () => {
      setSaved(true);
      router.refresh();
    },
  });
  const tzOptions = TIMEZONE_OPTIONS.includes(initial.timezone as never) ? TIMEZONE_OPTIONS : [initial.timezone, ...TIMEZONE_OPTIONS];
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      {saved ? <Alert tone="success">Dados do escritório salvos.</Alert> : null}
      {!canEdit ? <Alert tone="info">Somente leitura: seu perfil não permite editar os dados do escritório.</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome do escritório" htmlFor="name" error={fieldError(form, "name")}>
          <Input id="name" disabled={!canEdit} {...form.register("name")} />
        </Field>
        <Field label="Razão social" htmlFor="legalName" error={fieldError(form, "legalName")}>
          <Input id="legalName" disabled={!canEdit} {...form.register("legalName")} />
        </Field>
        <Field label="CNPJ / documento" htmlFor="document" error={fieldError(form, "document")} hint="Campo informativo; a validação de CPF/CNPJ chega com o módulo de clientes.">
          <Input id="document" disabled={!canEdit} {...form.register("document")} />
        </Field>
        <Field label="Fuso horário" htmlFor="timezone" error={fieldError(form, "timezone")}>
          <Select id="timezone" disabled={!canEdit} {...form.register("timezone")}>
            {tzOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {canEdit ? (
        <Button type="submit" loading={pending}>
          Salvar alterações
        </Button>
      ) : null}
    </form>
  );
}
