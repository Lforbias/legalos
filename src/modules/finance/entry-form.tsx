"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ClientPicker } from "@/modules/clients/client-picker";
import { createEntryAction, updateEntryAction } from "./actions";
import { ENTRY_KIND_LABEL, ENTRY_KINDS, ENTRY_TYPE_LABEL, ENTRY_TYPES, entrySchema, type EntryInput } from "./schemas";

type Opt = { id: string; name: string };

export function EntryForm({
  entryId,
  initial,
  accounts,
  categories,
  costCenters,
  cases,
  clientLabel,
  locked,
}: {
  entryId?: string;
  initial: EntryInput;
  accounts: Opt[];
  categories: Opt[];
  costCenters: Opt[];
  cases: Opt[];
  clientLabel: string;
  /** Na edição, o tipo (a receber/a pagar) não muda. */
  locked?: boolean;
}) {
  const router = useRouter();
  const [label, setLabel] = React.useState(clientLabel);
  const { form, submit, pending, message } = useServerForm<EntryInput, { id: string; count: number }>({
    schema: entrySchema,
    defaultValues: initial,
    action: async (v) => {
      if (!entryId) return createEntryAction(v);
      const r = await updateEntryAction(entryId, v);
      return { ...r, data: r.ok ? { id: entryId, count: 1 } : undefined };
    },
    onSuccess: (d) => {
      router.replace(entryId ? `/financeiro/lancamentos/${entryId}` : d && d.count > 1 ? "/financeiro/lancamentos?status=todos" : `/financeiro/lancamentos/${d?.id ?? ""}`);
      router.refresh();
    },
  });
  const err = (n: keyof EntryInput) => fieldError(form, n);
  const installments = Number(form.watch("installments") || "1");
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label="Tipo de lançamento" htmlFor="fe-kind" error={err("kind")}>
            <Select id="fe-kind" disabled={locked} {...form.register("kind")}>
              {ENTRY_KINDS.map((k) => (
                <option key={k} value={k}>{ENTRY_KIND_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Natureza" htmlFor="fe-type" error={err("type")}>
            <Select id="fe-type" {...form.register("type")}>
              {ENTRY_TYPES.map((k) => (
                <option key={k} value={k}>{ENTRY_TYPE_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Descrição" htmlFor="fe-desc" error={err("description")}>
              <Input id="fe-desc" aria-invalid={Boolean(err("description"))} {...form.register("description")} />
            </Field>
          </div>
          <Field label={entryId ? "Valor (R$)" : installments > 1 ? "Valor total (R$)" : "Valor (R$)"} htmlFor="fe-amount" error={err("amount")}>
            <Input id="fe-amount" inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(err("amount"))} {...form.register("amount")} />
          </Field>
          {entryId ? null : (
            <Field label="Parcelas" htmlFor="fe-inst" error={err("installments")} hint="Mensais, a partir do 1º vencimento. O total é dividido sem perder centavos.">
              <Input id="fe-inst" inputMode="numeric" {...form.register("installments")} />
            </Field>
          )}
          <Field label="Emissão" htmlFor="fe-issue" error={err("issueDate")}>
            <Input id="fe-issue" type="date" {...form.register("issueDate")} />
          </Field>
          <Field label={installments > 1 && !entryId ? "Vencimento da 1ª parcela" : "Vencimento"} htmlFor="fe-due" error={err("dueDate")}>
            <Input id="fe-due" type="date" {...form.register("dueDate")} />
          </Field>
          <Field label="Conta" htmlFor="fe-account" error={err("accountId")} hint="Opcional. A conta é escolhida de fato na hora da baixa.">
            <Select id="fe-account" {...form.register("accountId")}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria" htmlFor="fe-cat" error={err("categoryId")}>
            <Select id="fe-cat" {...form.register("categoryId")}>
              <option value="">—</option>
              {categories.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Centro de custo" htmlFor="fe-cc" error={err("costCenterId")}>
            <Select id="fe-cc" {...form.register("costCenterId")}>
              <option value="">—</option>
              {costCenters.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fornecedor / pagador" htmlFor="fe-cp" error={err("counterparty")}>
            <Input id="fe-cp" {...form.register("counterparty")} />
          </Field>
          <Field label="Cliente" htmlFor="fe-client" error={err("clientId")}>
            <ClientPicker
              id="fe-client"
              value={form.watch("clientId")}
              label={label}
              onChange={(id, l) => {
                form.setValue("clientId", id, { shouldDirty: true });
                setLabel(l);
              }}
              invalid={Boolean(err("clientId"))}
            />
          </Field>
          <Field label="Processo" htmlFor="fe-case" error={err("caseId")}>
            <Select id="fe-case" {...form.register("caseId")}>
              <option value="">—</option>
              {cases.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Observações" htmlFor="fe-notes" error={err("notes")}>
              <Textarea id="fe-notes" rows={3} {...form.register("notes")} />
            </Field>
          </div>
        </CardBody>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{entryId ? "Salvar alterações" : "Criar lançamento"}</Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}
