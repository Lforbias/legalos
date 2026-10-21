"use client";

import { useRouter } from "next/navigation";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { registerPaymentAction } from "./actions";
import { PAYMENT_METHODS, paymentSchema, type PaymentInput } from "./schemas";

export function PaymentForm({ entryId, accounts, defaultAccountId, remaining, today }: { entryId: string; accounts: { id: string; name: string }[]; defaultAccountId: string; remaining: string; today: string }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<PaymentInput, unknown>({
    schema: paymentSchema,
    defaultValues: { amount: remaining.replace(".", ","), paidOn: today, accountId: defaultAccountId || accounts[0]?.id || "", method: "PIX", note: "" },
    action: async (v) => registerPaymentAction(entryId, v),
    onSuccess: () => router.refresh(),
  });
  const err = (n: keyof PaymentInput) => fieldError(form, n);
  if (accounts.length === 0) return <Alert tone="warning">Cadastre uma conta em Financeiro → Cadastros para registrar baixas.</Alert>;
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-2">
      {message ? <div className="md:col-span-2"><Alert tone="error">{message}</Alert></div> : null}
      <Field label="Valor da baixa (R$)" htmlFor="pay-amount" error={err("amount")}>
        <Input id="pay-amount" inputMode="decimal" aria-invalid={Boolean(err("amount"))} {...form.register("amount")} />
      </Field>
      <Field label="Data do pagamento" htmlFor="pay-date" error={err("paidOn")}>
        <Input id="pay-date" type="date" max={today} {...form.register("paidOn")} />
      </Field>
      <Field label="Conta" htmlFor="pay-account" error={err("accountId")}>
        <Select id="pay-account" {...form.register("accountId")}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Forma" htmlFor="pay-method" error={err("method")}>
        <Select id="pay-method" {...form.register("method")}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Observação (opcional)" htmlFor="pay-note" error={err("note")}>
          <Input id="pay-note" {...form.register("note")} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" loading={pending}>Registrar baixa</Button>
      </div>
    </form>
  );
}
