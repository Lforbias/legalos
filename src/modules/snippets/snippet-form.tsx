"use client";

import { useRouter } from "next/navigation";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { createSnippetAction, updateSnippetAction } from "./actions";
import { snippetSchema, type SnippetFormInput } from "./schemas";

export function SnippetForm({ snippetId, initial }: { snippetId?: string; initial: SnippetFormInput }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<SnippetFormInput, { id: string }>({
    schema: snippetSchema,
    defaultValues: initial,
    action: async (v) => {
      if (snippetId) {
        const res = await updateSnippetAction(snippetId, v);
        return res.ok ? { ok: true, data: { id: snippetId } } : { ok: false, message: res.message, fieldErrors: res.fieldErrors };
      }
      return createSnippetAction(v);
    },
    onSuccess: () => {
      router.replace("/documentos/autotextos");
      router.refresh();
    },
  });
  const err = (n: keyof SnippetFormInput) => fieldError(form, n);
  const slug = form.watch("slug");
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome" htmlFor="sn-name" error={err("name")}>
              <Input id="sn-name" aria-invalid={Boolean(err("name"))} {...form.register("name")} />
            </Field>
            <Field label="Código (usado nos modelos)" htmlFor="sn-slug" error={err("slug")} hint={slug ? `No modelo, escreva {{autotexto.${slug}}}.` : "Ex.: pedidos-finais"}>
              <Input id="sn-slug" aria-invalid={Boolean(err("slug"))} {...form.register("slug")} />
            </Field>
          </div>
          <Field label="Descrição (opcional)" htmlFor="sn-desc" error={err("description")}>
            <Input id="sn-desc" {...form.register("description")} />
          </Field>
          <Field label="Texto" htmlFor="sn-body" error={err("body")} hint="Pode usar os campos de mesclagem ({{cliente.nome}}, {{processo.numero}}…). Não pode usar outro autotexto.">
            <Textarea id="sn-body" rows={12} className="font-mono text-[13px]" aria-invalid={Boolean(err("body"))} {...form.register("body")} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" {...form.register("active")} /> Autotexto ativo
          </label>
        </CardBody>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{snippetId ? "Salvar autotexto" : "Criar autotexto"}</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
