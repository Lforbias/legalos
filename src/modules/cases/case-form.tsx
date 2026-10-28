"use client";

import { COURT_SYSTEMS } from "@/lib/court-systems";
import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { UF_LIST } from "@/lib/validation/br-states";
import { ClientPicker } from "@/modules/clients/client-picker";
import { createCaseAction, updateCaseAction } from "./actions";
import { CASE_AREAS, CASE_NATURE_LABEL, CASE_STATUS_LABEL, PARTY_ROLE_LABEL, createCaseSchema, type CreateCaseInput } from "./schemas";

export const EMPTY_CASE: CreateCaseInput = {
  nature: "CASE", departmentId: "", courtSystem: "", number: "", legacyNumber: "", title: "", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE", phase: "",
  distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF",
};

export function CaseForm({
  caseId,
  initial,
  members,
  departments = [],
  initialClientLabel = "",
}: {
  caseId?: string;
  initial: CreateCaseInput;
  members: { id: string; name: string }[];
  departments?: { id: string; name: string; area: string }[];
  initialClientLabel?: string;
}) {
  const router = useRouter();
  const editing = Boolean(caseId);
  const [clientLabel, setClientLabel] = React.useState(initialClientLabel);
  const { form, submit, pending, message } = useServerForm<CreateCaseInput, { id: string }>({
    schema: createCaseSchema,
    defaultValues: initial,
    action: async (v) => {
      if (caseId) {
        const res = await updateCaseAction(caseId, v);
        return res.ok ? { ok: true, data: { id: caseId } } : { ok: false, message: res.message, fieldErrors: res.fieldErrors };
      }
      return createCaseAction(v);
    },
    onSuccess: (data) => {
      router.replace(`/processos/${data?.id ?? caseId}`);
      router.refresh();
    },
  });
  const err = (n: keyof CreateCaseInput) => fieldError(form, n);
  const clientId = form.watch("clientId");

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}

      <Card>
        <CardHeader title="Identificação" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Título do caso ou processo" htmlFor="title" error={err("title")} hint="Nome interno para identificar o caso (ex.: “Silva x Banco Alfa — revisional”).">
              <Input id="title" aria-invalid={Boolean(err("title"))} {...form.register("title")} />
            </Field>
          </div>
          <Field label="Natureza" htmlFor="nature" error={err("nature")} hint="Um caso pode virar processo judicial sem perder tarefas, documentos e histórico.">
            <Select id="nature" {...form.register("nature")}>
              {Object.entries(CASE_NATURE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Departamento" htmlFor="departmentId" error={err("departmentId")} hint="Automático encaminha para o departamento da área jurídica selecionada.">
            <Select id="departmentId" {...form.register("departmentId")}>
              <option value="">Automático pela área jurídica</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Número CNJ" htmlFor="number" error={err("number")} hint="Preencha apenas para processo judicial. Casos e procedimentos administrativos não precisam de CNJ.">
            <Input id="number" autoComplete="off" aria-invalid={Boolean(err("number"))} {...form.register("number")} />
          </Field>
          <Field label="Número antigo / outro" htmlFor="legacyNumber" error={err("legacyNumber")} hint="Numeração anterior à Resolução CNJ 65 ou administrativa.">
            <Input id="legacyNumber" {...form.register("legacyNumber")} />
          </Field>
          <Field label="Área" htmlFor="area" error={err("area")}>
            <Select id="area" {...form.register("area")} onChange={e => { form.setValue("area", e.target.value, { shouldDirty: true }); form.setValue("departmentId", "", { shouldDirty: true }); }}>
              <option value="">—</option>
              {CASE_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Situação" htmlFor="status" error={err("status")}>
            <Select id="status" {...form.register("status")}>
              {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável" htmlFor="responsibleId" error={err("responsibleId")} hint={editing ? undefined : "Se não escolher, você será o responsável."}>
            <Select id="responsibleId" {...form.register("responsibleId")}>
              <option value="">{editing ? "Manter atual" : "Eu mesmo(a)"}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fase" htmlFor="phase" error={err("phase")} hint="Ex.: conhecimento, recursal, execução.">
            <Input id="phase" {...form.register("phase")} />
          </Field>
        </CardBody>
      </Card>

      {!editing ? (
        <Card>
          <CardHeader title="Cliente" description="Opcional agora; partes e clientes também podem ser vinculados depois, na aba Partes." />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label="Cliente do escritório" htmlFor="clientId" error={err("clientId")}>
              <ClientPicker
                id="clientId"
                value={clientId}
                label={clientLabel}
                invalid={Boolean(err("clientId"))}
                onChange={(id, label) => {
                  form.setValue("clientId", id, { shouldDirty: true });
                  setClientLabel(label);
                }}
              />
            </Field>
            <Field label="Posição do cliente" htmlFor="clientRole" error={err("clientRole")}>
              <Select id="clientRole" disabled={!clientId} {...form.register("clientRole")}>
                {Object.entries(PARTY_ROLE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Juízo e valores" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label="Sistema do processo" htmlFor="case-system" hint="Escolha quando o tribunal usa mais de um sistema. Vazio usa o mapa do escritório.">
            <Select id="case-system" {...form.register("courtSystem")}><option value="">Usar mapa do tribunal</option>{COURT_SYSTEMS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
          </Field>
          <Field label="Tribunal / órgão" htmlFor="court" error={err("court")}>
            <Input id="court" placeholder="Ex.: TJSP" {...form.register("court")} />
          </Field>
          <Field label="Vara / unidade" htmlFor="courtUnit" error={err("courtUnit")}>
            <Input id="courtUnit" {...form.register("courtUnit")} />
          </Field>
          <Field label="UF" htmlFor="courtState" error={err("courtState")}>
            <Select id="courtState" {...form.register("courtState")}>
              <option value="">—</option>
              {UF_LIST.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data de distribuição" htmlFor="distributedAt" error={err("distributedAt")}>
            <Input id="distributedAt" type="date" {...form.register("distributedAt")} />
          </Field>
          <Field label="Valor da causa (R$)" htmlFor="claimValue" error={err("claimValue")} hint="Exemplo: 12.500,00">
            <Input id="claimValue" inputMode="decimal" {...form.register("claimValue")} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Assunto" htmlFor="subject" error={err("subject")}>
              <Textarea id="subject" rows={3} {...form.register("subject")} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sigilo e observações" />
        <CardBody className="grid gap-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" {...form.register("confidential")} />
            <span>
              Processo sigiloso
              <span className="block text-xs text-muted">
                Visível apenas para a equipe do processo e para quem administra o escritório. Vale também para os documentos do processo.
              </span>
            </span>
          </label>
          <Field label="Observações internas" htmlFor="notes" error={err("notes")}>
            <Textarea id="notes" rows={4} {...form.register("notes")} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          {editing ? "Salvar alterações" : "Cadastrar caso ou processo"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
