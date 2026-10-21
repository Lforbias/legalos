"use client";

import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { TIMEZONE_OPTIONS } from "@/lib/validation/timezone";
import { createOrganizationAction } from "./actions";
import { createOrganizationSchema, type CreateOrganizationInput } from "./schemas";

export function CreateOrganizationForm() {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<CreateOrganizationInput, { redirectTo: string }>({
    schema: createOrganizationSchema,
    defaultValues: { name: "", legalName: "", timezone: "America/Sao_Paulo" },
    action: createOrganizationAction,
    onSuccess: (data) => {
      router.replace(data?.redirectTo ?? "/");
      router.refresh();
    },
  });
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Field label="Nome do escritório" htmlFor="name" error={fieldError(form, "name")}>
        <Input id="name" autoComplete="organization" aria-invalid={!!form.formState.errors.name} {...form.register("name")} />
      </Field>
      <Field label="Razão social (opcional)" htmlFor="legalName" error={fieldError(form, "legalName")}>
        <Input id="legalName" {...form.register("legalName")} />
      </Field>
      <Field label="Fuso horário" htmlFor="timezone" error={fieldError(form, "timezone")} hint="Usado para exibir datas e, futuramente, calcular prazos.">
        <Select id="timezone" {...form.register("timezone")}>
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Criar escritório
      </Button>
    </form>
  );
}
