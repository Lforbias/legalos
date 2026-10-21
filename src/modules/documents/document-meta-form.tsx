"use client";

import { useRouter } from "next/navigation";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { updateDocumentMetaAction } from "./actions";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL, documentMetaSchema, type DocumentMetaInput } from "./schemas";

export function DocumentMetaForm({ id, initial }: { id: string; initial: DocumentMetaInput }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<DocumentMetaInput, undefined>({
    schema: documentMetaSchema,
    defaultValues: initial,
    action: (v) => updateDocumentMetaAction(id, v),
    onSuccess: () => router.refresh(),
  });
  const err = (n: keyof DocumentMetaInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {message ? <Alert tone="error">{message}</Alert> : null}
      {form.formState.isSubmitSuccessful && !message ? <Alert tone="success">Dados salvos.</Alert> : null}
      <Field label="Nome" htmlFor="doc-name" error={err("name")}>
        <Input id="doc-name" aria-invalid={Boolean(err("name"))} {...form.register("name")} />
      </Field>
      <Field label="Categoria" htmlFor="doc-category" error={err("category")}>
        <Select id="doc-category" {...form.register("category")}>
          <option value="">Sem categoria</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>
          ))}
        </Select>
      </Field>
      <Field label="Descrição" htmlFor="doc-desc" error={err("description")}>
        <Textarea id="doc-desc" rows={3} {...form.register("description")} />
      </Field>
      <Button type="submit" size="sm" loading={pending}>Salvar dados</Button>
    </form>
  );
}
