"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { TEMPLATE_VARIABLES } from "@/lib/templates/merge";
import { createTemplateAction, updateTemplateAction } from "./actions";
import { templateSchema, TEMPLATE_EXAMPLE, type TemplateFormInput } from "./schemas";

export function TemplateForm({ templateId, initial, snippets = [] }: { templateId?: string; initial: TemplateFormInput; snippets?: { slug: string; name: string }[] }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<TemplateFormInput, { id: string }>({
    schema: templateSchema,
    defaultValues: initial,
    action: async (v) => {
      if (templateId) {
        const res = await updateTemplateAction(templateId, v);
        return res.ok ? { ok: true, data: { id: templateId } } : { ok: false, message: res.message, fieldErrors: res.fieldErrors };
      }
      return createTemplateAction(v);
    },
    onSuccess: () => {
      router.replace("/documentos/modelos");
      router.refresh();
    },
  });
  const err = (n: keyof TemplateFormInput) => fieldError(form, n);
  const bodyReg = form.register("body");
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);

  const insert = (key: string) => {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    const current = form.getValues("body");
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    form.setValue("body", current.slice(0, start) + token + current.slice(end), { shouldDirty: true });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const groups = [...new Set(TEMPLATE_VARIABLES.map((v) => v.group))];

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome do modelo" htmlFor="tpl-name" error={err("name")}>
                <Input id="tpl-name" aria-invalid={Boolean(err("name"))} {...form.register("name")} />
              </Field>
              <Field label="Categoria (opcional)" htmlFor="tpl-category" error={err("category")} hint="Ex.: PETICAO, PROCURACAO, CONTRATO.">
                <Input id="tpl-category" {...form.register("category")} />
              </Field>
            </div>
            <Field label="Descrição (opcional)" htmlFor="tpl-desc" error={err("description")}>
              <Input id="tpl-desc" {...form.register("description")} />
            </Field>
            <Field label="Texto do modelo" htmlFor="tpl-body" error={err("body")} hint="Use campos como {{cliente.nome}}. Linha iniciada por “# ” vira título; linha em branco separa parágrafos.">
              <Textarea
                id="tpl-body"
                rows={18}
                className="font-mono text-[13px]"
                aria-invalid={Boolean(err("body"))}
                {...bodyReg}
                ref={(el) => {
                  bodyReg.ref(el);
                  bodyRef.current = el;
                }}
              />
            </Field>
            {!form.watch("body") ? (
              <button type="button" className="text-xs text-primary-text underline" onClick={() => form.setValue("body", TEMPLATE_EXAMPLE, { shouldDirty: true })}>
                Começar a partir de um exemplo (procuração)
              </button>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" {...form.register("active")} /> Modelo ativo (disponível para gerar documentos)
            </label>
          </CardBody>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Campos disponíveis" description="Clique para inserir no cursor." />
          <CardBody className="space-y-3">
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1 text-xs font-medium text-muted">{g}</p>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.filter((v) => v.group === g).map((v) => (
                    <button key={v.key} type="button" title={v.label} onClick={() => insert(v.key)} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] hover:bg-surface-3">
                      {v.key}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Autotextos</p>
              {snippets.length ? (
                <div className="flex flex-wrap gap-1">
                  {snippets.map((sn) => (
                    <button key={sn.slug} type="button" title={sn.name} onClick={() => insert(`autotexto.${sn.slug}`)} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] hover:bg-surface-3">
                      autotexto.{sn.slug}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">Nenhum autotexto ativo. Crie em Documentos → Modelos → Autotextos.</p>
              )}
            </div>
            <p className="text-xs text-muted">Dados ausentes no cadastro aparecem no documento como [PREENCHER: …]; nada é inventado.</p>
          </CardBody>
        </Card>
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{templateId ? "Salvar modelo" : "Criar modelo"}</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
