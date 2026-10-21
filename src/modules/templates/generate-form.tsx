"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { ClientPicker } from "@/modules/clients/client-picker";
import { generateDocumentAction } from "./actions";
import { generateSchema, type GenerateInput } from "./schemas";

export function GenerateForm({
  templates,
  cases,
  initial,
  initialClientLabel = "",
}: {
  templates: { id: string; name: string }[];
  cases: { id: string; title: string; number: string | null }[];
  initial: GenerateInput;
  initialClientLabel?: string;
}) {
  const router = useRouter();
  const [clientLabel, setClientLabel] = React.useState(initialClientLabel);
  const { form, submit, pending, message } = useServerForm<GenerateInput, { id: string; missing: string[] }>({
    schema: generateSchema,
    defaultValues: initial,
    action: generateDocumentAction,
    onSuccess: (data) => {
      const q = data && data.missing.length ? `?faltam=${encodeURIComponent(data.missing.join("|"))}` : "";
      router.replace(`/documentos/${data?.id}${q}`);
      router.refresh();
    },
  });
  const err = (n: keyof GenerateInput) => fieldError(form, n);
  const target = form.watch("target");
  const clientId = form.watch("clientId");

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label="Modelo" htmlFor="gen-template" error={err("templateId")}>
            <Select id="gen-template" aria-invalid={Boolean(err("templateId"))} {...form.register("templateId")}>
              <option value="">Escolha um modelo…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Título do documento" htmlFor="gen-title" error={err("title")} hint="Opcional. Padrão: nome do modelo.">
            <Input id="gen-title" {...form.register("title")} />
          </Field>
          <Field label="Salvar em" htmlFor="gen-target" error={err("target")}>
            <Select id="gen-target" {...form.register("target")}>
              <option value="case">Um processo (usa dados do processo e do cliente vinculado)</option>
              <option value="client">Um cliente</option>
            </Select>
          </Field>
          {target === "case" ? (
            <Field label="Processo" htmlFor="gen-case" error={err("caseId")} hint="Lista os 200 processos mais recentes que você pode ver.">
              <Select id="gen-case" aria-invalid={Boolean(err("caseId"))} {...form.register("caseId")}>
                <option value="">Escolha o processo…</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}{c.number ? ` — ${c.number}` : ""}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Cliente" htmlFor="gen-client" error={err("clientId")}>
              <ClientPicker
                id="gen-client"
                value={clientId}
                label={clientLabel}
                invalid={Boolean(err("clientId"))}
                onChange={(id, label) => {
                  form.setValue("clientId", id, { shouldDirty: true });
                  setClientLabel(label);
                }}
              />
            </Field>
          )}
        </CardBody>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>Gerar documento (.docx)</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
