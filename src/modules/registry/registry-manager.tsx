"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatDocument } from "@/lib/validation/br-documents";
import { createRegistryAction, deleteRegistryAction, updateRegistryAction } from "@/modules/cases/extras-actions";
import { REGISTRY_KINDS, REGISTRY_KIND_LABEL, registrySchema, type RegistryInput } from "./schemas";

export type RegistryRow = { id: string; kind: string; name: string; document: string | null; profession: string | null; issuingOrgan: string | null; email: string | null; phone: string | null; notes: string | null; cases: number };

const EMPTY: RegistryInput = { kind: "PERSON", name: "", document: "", profession: "", issuingOrgan: "", email: "", phone: "", notes: "" };

function RegistryForm({ id, initial, onDone, onCancel }: { id?: string; initial: RegistryInput; onDone: () => void; onCancel: () => void }) {
  const { form, submit, pending, message } = useServerForm<RegistryInput, unknown>({
    schema: registrySchema,
    defaultValues: initial,
    action: (v) => (id ? updateRegistryAction(id, v) : createRegistryAction(v)),
    onSuccess: onDone,
  });
  const err = (n: keyof RegistryInput) => fieldError(form, n);
  const kind = form.watch("kind");
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-md border border-border bg-surface-2/50 p-3" aria-label={id ? "Editar parte" : "Nova parte"}>
      {message ? <Alert tone="error">{message}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Tipo" htmlFor="reg-kind" error={err("kind")}>
          <Select id="reg-kind" {...form.register("kind")}>
            {REGISTRY_KINDS.map((k) => <option key={k} value={k}>{REGISTRY_KIND_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field label="Nome" htmlFor="reg-name" error={err("name")}>
          <Input id="reg-name" {...form.register("name")} />
        </Field>
        <Field label={kind === "LAWYER" ? "OAB (número e UF)" : "CPF/CNPJ"} htmlFor="reg-doc" error={err("document")}>
          <Input id="reg-doc" {...form.register("document")} />
        </Field>
        <Field label="Profissão / ramo" htmlFor="reg-prof" error={err("profession")}>
          <Input id="reg-prof" {...form.register("profession")} />
        </Field>
        <Field label="Órgão expedidor do documento" htmlFor="reg-organ" error={err("issuingOrgan")}>
          <Input id="reg-organ" placeholder="Ex.: SSP/BA" {...form.register("issuingOrgan")} />
        </Field>
        <Field label="Telefone" htmlFor="reg-phone" error={err("phone")}>
          <Input id="reg-phone" {...form.register("phone")} />
        </Field>
        <div className="md:col-span-2">
          <Field label="E-mail" htmlFor="reg-email" error={err("email")}>
            <Input id="reg-email" type="email" {...form.register("email")} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Observações" htmlFor="reg-notes" error={err("notes")}>
            <Textarea id="reg-notes" rows={2} {...form.register("notes")} />
          </Field>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>{id ? "Salvar" : "Cadastrar parte"}</Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}

export function RegistryManager({ rows, canWrite }: { rows: RegistryRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const done = () => { setEditing(null); router.refresh(); };
  return (
    <Card>
      <CardHeader
        title="Cadastro único de partes"
        description="Adversários, advogados e órgãos reaproveitáveis em qualquer processo. Clientes ficam no cadastro de clientes."
        action={canWrite && editing === null ? <Button size="sm" onClick={() => setEditing("new")}>Nova parte</Button> : undefined}
      />
      <CardBody className="space-y-3">
        {editing === "new" ? <RegistryForm initial={EMPTY} onDone={done} onCancel={() => setEditing(null)} /> : null}
        {rows.length === 0 && editing !== "new" ? <p className="text-sm text-muted">Nenhuma parte cadastrada.</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) =>
            editing === r.id ? (
              <li key={r.id} className="py-3">
                <RegistryForm id={r.id} initial={{ kind: r.kind as RegistryInput["kind"], name: r.name, document: r.document ?? "", profession: r.profession ?? "", issuingOrgan: r.issuingOrgan ?? "", email: r.email ?? "", phone: r.phone ?? "", notes: r.notes ?? "" }} onDone={done} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5" data-testid="registry-row">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {r.name} <Badge>{REGISTRY_KIND_LABEL[r.kind as (typeof REGISTRY_KINDS)[number]]}</Badge>
                    {r.cases > 0 ? <Badge tone="info">{r.cases} processo(s)</Badge> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {r.document ? (r.document.length === 11 ? formatDocument("PERSON", r.document) : r.document.length === 14 ? formatDocument("COMPANY", r.document) : r.document) : "Documento não informado"}
                    {r.profession ? ` · ${r.profession}` : ""}
                    {r.phone ? ` · ${r.phone}` : ""}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(r.id)}>Editar</Button>
                    <ConfirmAction label="Excluir" confirmLabel="Excluir parte" description="Os processos já vinculados mantêm os dados da parte." action={() => deleteRegistryAction(r.id)} onDone={() => router.refresh()} />
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      </CardBody>
    </Card>
  );
}
