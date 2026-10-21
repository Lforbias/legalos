"use client";

import { useRouter } from "next/navigation";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { createPetitionAction, updatePetitionAction } from "./actions";
import { petitionSchema, type PetitionFormInput } from "./schemas";

export function PetitionForm({ petitionId, initial, documents }: { petitionId?: string; initial: PetitionFormInput; documents: { id: string; name: string; currentVersion: number }[] }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<PetitionFormInput, { id: string }>({
    schema: petitionSchema,
    defaultValues: initial,
    action: async (v) => {
      if (petitionId) {
        const res = await updatePetitionAction(petitionId, v);
        return res.ok ? { ok: true, data: { id: petitionId } } : { ok: false, message: res.message, fieldErrors: res.fieldErrors };
      }
      return createPetitionAction(v);
    },
    onSuccess: (data) => {
      router.replace(`/peticoes/${data?.id ?? petitionId}`);
      router.refresh();
    },
  });
  const err = (n: keyof PetitionFormInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <input type="hidden" {...form.register("caseId")} />
      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Título da petição" htmlFor="pet-title" error={err("title")}>
              <Input id="pet-title" aria-invalid={Boolean(err("title"))} {...form.register("title")} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Documento" htmlFor="pet-doc" error={err("documentId")} hint="Documentos anexados a este processo. A versão atual fica registrada quando a petição vai para revisão.">
              <Select id="pet-doc" aria-invalid={Boolean(err("documentId"))} {...form.register("documentId")}>
                <option value="">Escolha o documento…</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} (v{d.currentVersion})</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Tipo da peça (opcional)" htmlFor="pet-kind" error={err("kind")} hint="Ex.: Contestação, Recurso de apelação.">
            <Input id="pet-kind" {...form.register("kind")} />
          </Field>
          <Field label="Juízo / tribunal (opcional)" htmlFor="pet-court" error={err("court")} hint="Padrão: tribunal cadastrado no processo.">
            <Input id="pet-court" {...form.register("court")} />
          </Field>
        </CardBody>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{petitionId ? "Salvar alterações" : "Criar petição"}</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
