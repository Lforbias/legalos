"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { UF_LIST } from "@/lib/validation/br-states";
import { createClientAction, updateClientAction } from "./actions";
import { CLIENT_STATUS_LABEL, CLIENT_TYPE_LABEL, clientSchema, type ClientInput } from "./schemas";

export const EMPTY_CLIENT: ClientInput = {
  type: "PERSON", status: "ACTIVE", name: "", tradeName: "", document: "", email: "", phone: "", birthDate: "", tags: "", notes: "",
  addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "",
};

export function ClientForm({ clientId, initial }: { clientId?: string; initial: ClientInput }) {
  const router = useRouter();
  const editing = Boolean(clientId);
  const { form, submit, pending, message } = useServerForm<ClientInput, { id: string }>({
    schema: clientSchema,
    defaultValues: initial,
    action: (v) => (clientId ? updateClientAction(clientId, v) : createClientAction(v)),
    onSuccess: (data) => {
      router.replace(`/clientes/${data?.id ?? clientId}`);
      router.refresh();
    },
  });
  const type = form.watch("type");
  const isPerson = type === "PERSON";
  const err = (n: keyof ClientInput) => fieldError(form, n);

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}

      <Card>
        <CardHeader title="Identificação" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label="Tipo de pessoa" htmlFor="type" error={err("type")} hint={editing ? "O tipo não pode ser alterado depois do cadastro." : undefined}>
            <Select id="type" disabled={editing} {...form.register("type")}>
              {Object.entries(CLIENT_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Situação" htmlFor="status" error={err("status")}>
            <Select id="status" {...form.register("status")}>
              {Object.entries(CLIENT_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={isPerson ? "Nome completo" : "Razão social"} htmlFor="name" error={err("name")}>
            <Input id="name" aria-invalid={Boolean(err("name"))} {...form.register("name")} />
          </Field>
          <Field label={isPerson ? "Nome social / como prefere ser chamado" : "Nome fantasia"} htmlFor="tradeName" error={err("tradeName")}>
            <Input id="tradeName" {...form.register("tradeName")} />
          </Field>
          <Field
            label={isPerson ? "CPF" : "CNPJ"}
            htmlFor="document"
            error={err("document")}
            hint={isPerson ? "Opcional. Validado pelos dígitos verificadores." : "Opcional. Aceita CNPJ numérico e alfanumérico."}
          >
            <Input id="document" inputMode={isPerson ? "numeric" : "text"} autoComplete="off" aria-invalid={Boolean(err("document"))} {...form.register("document")} />
          </Field>
          {isPerson ? (
            <Field label="Data de nascimento" htmlFor="birthDate" error={err("birthDate")}>
              <Input id="birthDate" type="date" {...form.register("birthDate")} />
            </Field>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contato principal" description="Contatos adicionais (pessoas de referência) são cadastrados no perfil do cliente." />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label="E-mail" htmlFor="email" error={err("email")}>
            <Input id="email" type="email" autoComplete="off" {...form.register("email")} />
          </Field>
          <Field label="Telefone / WhatsApp" htmlFor="phone" error={err("phone")}>
            <Input id="phone" inputMode="tel" autoComplete="off" {...form.register("phone")} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Endereço" />
        <CardBody className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <Field label="CEP" htmlFor="addressZip" error={err("addressZip")}>
              <Input id="addressZip" inputMode="numeric" {...form.register("addressZip")} />
            </Field>
          </div>
          <div className="md:col-span-3">
            <Field label="Logradouro" htmlFor="addressStreet" error={err("addressStreet")}>
              <Input id="addressStreet" {...form.register("addressStreet")} />
            </Field>
          </div>
          <div className="md:col-span-1">
            <Field label="Número" htmlFor="addressNumber" error={err("addressNumber")}>
              <Input id="addressNumber" {...form.register("addressNumber")} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Complemento" htmlFor="addressComplement" error={err("addressComplement")}>
              <Input id="addressComplement" {...form.register("addressComplement")} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Bairro" htmlFor="addressDistrict" error={err("addressDistrict")}>
              <Input id="addressDistrict" {...form.register("addressDistrict")} />
            </Field>
          </div>
          <div className="md:col-span-1">
            <Field label="Cidade" htmlFor="addressCity" error={err("addressCity")}>
              <Input id="addressCity" {...form.register("addressCity")} />
            </Field>
          </div>
          <div className="md:col-span-1">
            <Field label="UF" htmlFor="addressState" error={err("addressState")}>
              <Select id="addressState" {...form.register("addressState")}>
                <option value="">—</option>
                {UF_LIST.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Classificação e observações" />
        <CardBody className="grid gap-4">
          <Field label="Etiquetas" htmlFor="tags" error={err("tags")} hint="Separe por vírgula. Até 10 etiquetas.">
            <Input id="tags" {...form.register("tags")} />
          </Field>
          <Field label="Observações internas" htmlFor="notes" error={err("notes")}>
            <Textarea id="notes" rows={4} {...form.register("notes")} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          {editing ? "Salvar alterações" : "Cadastrar cliente"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
