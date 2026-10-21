"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import type { ActionState } from "@/lib/validation/common";
import { createAccountAction, createCategoryAction, createCostCenterAction, setAccountActiveAction, setCategoryActiveAction, setCostCenterActiveAction } from "./actions";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABEL, accountSchema, categorySchema, costCenterSchema, EMPTY_ACCOUNT, EMPTY_CATEGORY, type AccountInput, type CategoryInput, type CostCenterInput } from "./schemas";

function ToggleButton({ active, canManage, action }: { active: boolean; canManage: boolean; action: (next: boolean) => Promise<ActionState> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  if (!canManage) return null;
  return (
    <span className="flex items-center gap-2">
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action(!active);
            if (!r.ok) setError(r.message ?? "Não foi possível alterar.");
            else {
              setError(null);
              router.refresh();
            }
          })
        }
      >
        {active ? "Desativar" : "Reativar"}
      </Button>
    </span>
  );
}

type Row = { id: string; name: string; active: boolean; detail?: string };

function RowList({ rows, canManage, toggle, empty }: { rows: Row[]; canManage: boolean; toggle: (id: string, next: boolean) => Promise<ActionState>; empty: string }) {
  if (rows.length === 0) return <p className="p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {r.name} {!r.active ? <Badge tone="warning">inativa</Badge> : null}
            </p>
            {r.detail ? <p className="text-xs text-muted">{r.detail}</p> : null}
          </div>
          <ToggleButton active={r.active} canManage={canManage} action={(next) => toggle(r.id, next)} />
        </li>
      ))}
    </ul>
  );
}

function AccountForm() {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<AccountInput, unknown>({
    schema: accountSchema,
    defaultValues: EMPTY_ACCOUNT,
    action: async (v) => createAccountAction(v),
    onSuccess: () => {
      form.reset(EMPTY_ACCOUNT);
      router.refresh();
    },
  });
  const err = (n: keyof AccountInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 border-t border-border p-4 md:grid-cols-4" aria-label="Nova conta">
      {message ? <div className="md:col-span-4"><Alert tone="error">{message}</Alert></div> : null}
      <Field label="Nome da conta" htmlFor="acc-name" error={err("name")}>
        <Input id="acc-name" {...form.register("name")} />
      </Field>
      <Field label="Tipo" htmlFor="acc-kind" error={err("kind")}>
        <Select id="acc-kind" {...form.register("kind")}>
          {ACCOUNT_KINDS.map((k) => <option key={k} value={k}>{ACCOUNT_KIND_LABEL[k]}</option>)}
        </Select>
      </Field>
      <Field label="Saldo inicial (R$)" htmlFor="acc-balance" error={err("initialBalance")}>
        <Input id="acc-balance" inputMode="decimal" placeholder="0,00" {...form.register("initialBalance")} />
      </Field>
      <Field label="Data do saldo inicial" htmlFor="acc-date" error={err("openingDate")}>
        <Input id="acc-date" type="date" {...form.register("openingDate")} />
      </Field>
      <div className="md:col-span-4"><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Adicionar conta"}</Button></div>
    </form>
  );
}

function CategoryForm() {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<CategoryInput, unknown>({
    schema: categorySchema,
    defaultValues: EMPTY_CATEGORY,
    action: async (v) => createCategoryAction(v),
    onSuccess: () => {
      form.reset(EMPTY_CATEGORY);
      router.refresh();
    },
  });
  const err = (n: keyof CategoryInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 border-t border-border p-4 md:grid-cols-3" aria-label="Nova categoria">
      {message ? <div className="md:col-span-3"><Alert tone="error">{message}</Alert></div> : null}
      <Field label="Nome da categoria" htmlFor="cat-name" error={err("name")}>
        <Input id="cat-name" {...form.register("name")} />
      </Field>
      <Field label="Cor (opcional, #RRGGBB)" htmlFor="cat-color" error={err("color")}>
        <Input id="cat-color" placeholder="#2F6FED" {...form.register("color")} />
      </Field>
      <div className="flex items-end"><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Adicionar categoria"}</Button></div>
    </form>
  );
}

function CostCenterForm() {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<CostCenterInput, unknown>({
    schema: costCenterSchema,
    defaultValues: { name: "" },
    action: async (v) => createCostCenterAction(v),
    onSuccess: () => {
      form.reset({ name: "" });
      router.refresh();
    },
  });
  const err = (n: keyof CostCenterInput) => fieldError(form, n);
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 border-t border-border p-4 md:grid-cols-3" aria-label="Novo centro de custo">
      {message ? <div className="md:col-span-3"><Alert tone="error">{message}</Alert></div> : null}
      <Field label="Nome do centro de custo" htmlFor="cc-name" error={err("name")}>
        <Input id="cc-name" {...form.register("name")} />
      </Field>
      <div className="flex items-end"><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Adicionar centro de custo"}</Button></div>
    </form>
  );
}

export function Cadastros({ canManage, accounts, categories, costCenters }: { canManage: boolean; accounts: Row[]; categories: Row[]; costCenters: Row[] }) {
  return (
    <div className="space-y-4">
      {!canManage ? <Alert tone="info">Você pode consultar os cadastros, mas só quem tem permissão de gestão financeira pode alterá-los.</Alert> : null}
      <Card>
        <CardHeader title="Contas" description="Onde o dinheiro entra e sai (conta bancária, caixa). O saldo é calculado a partir das baixas." />
        <RowList rows={accounts} canManage={canManage} toggle={setAccountActiveAction} empty="Nenhuma conta cadastrada." />
        {canManage ? <AccountForm /> : null}
      </Card>
      <Card>
        <CardHeader title="Categorias" />
        <RowList rows={categories} canManage={canManage} toggle={setCategoryActiveAction} empty="Nenhuma categoria cadastrada." />
        {canManage ? <CategoryForm /> : null}
      </Card>
      <Card>
        <CardHeader title="Centros de custo" />
        <RowList rows={costCenters} canManage={canManage} toggle={setCostCenterActiveAction} empty="Nenhum centro de custo cadastrado." />
        {canManage ? <CostCenterForm /> : null}
      </Card>
    </div>
  );
}
