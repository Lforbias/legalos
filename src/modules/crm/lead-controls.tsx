"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { ActionButton } from "@/components/ui/action-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { addLeadActivityAction, changeLeadStageAction, convertLeadAction, deleteLeadAction, markLeadLostAction, reopenLeadAction } from "./actions";
import { ACTIVITY_KINDS, ACTIVITY_LABEL, activitySchema, convertSchema, LEAD_STAGE_LABEL, lostSchema, OPEN_STAGES, type ActivityInput, type ConvertInput, type LostInput } from "./schemas";

export function StageSelect({ leadId, stage, compact }: { leadId: string; stage: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div>
      <label className="sr-only" htmlFor={`stage-${leadId}`}>Etapa do lead</label>
      <Select
        id={`stage-${leadId}`}
        value={stage}
        disabled={pending}
        className={compact ? "h-8 text-xs" : undefined}
        onChange={(e) => {
          const next = e.target.value;
          setError(null);
          start(async () => {
            const res = await changeLeadStageAction(leadId, next);
            if (!res.ok) setError(res.message ?? "Não foi possível mover o lead.");
            router.refresh();
          });
        }}
      >
        {OPEN_STAGES.map((s) => (
          <option key={s} value={s}>{LEAD_STAGE_LABEL[s]}</option>
        ))}
      </Select>
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function ActivityForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<ActivityInput, undefined>({
    schema: activitySchema,
    defaultValues: { kind: "NOTE", body: "" },
    action: (v) => addLeadActivityAction(leadId, v),
    onSuccess: (_d, f) => {
      f.reset({ kind: "NOTE", body: "" });
      router.refresh();
    },
  });
  const err = fieldError(form, "body");
  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="act-kind">Tipo de contato</label>
        <Select id="act-kind" className="w-40" {...form.register("kind")}>
          {ACTIVITY_KINDS.map((k) => (
            <option key={k} value={k}>{ACTIVITY_LABEL[k]}</option>
          ))}
        </Select>
      </div>
      <label className="sr-only" htmlFor="act-body">Registro do contato</label>
      <Textarea id="act-body" rows={3} placeholder="O que foi conversado ou combinado?" aria-invalid={Boolean(err)} {...form.register("body")} />
      {err ? <p role="alert" className="text-xs text-danger">{err}</p> : null}
      <Button type="submit" size="sm" loading={pending}>Registrar contato</Button>
    </form>
  );
}

export function LostForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<LostInput, undefined>({
    schema: lostSchema,
    defaultValues: { reason: "" },
    action: (v) => markLeadLostAction(leadId, v),
    onSuccess: () => router.refresh(),
  });
  const err = fieldError(form, "reason");
  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Field label="Marcar como perdido" htmlFor="lost-reason" error={err}>
        <Input id="lost-reason" placeholder="Motivo da perda" aria-invalid={Boolean(err)} {...form.register("reason")} />
      </Field>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>Marcar como perdido</Button>
    </form>
  );
}

export function ConvertForm({ leadId, type }: { leadId: string; type: "PERSON" | "COMPANY" }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<ConvertInput, { clientId: string }>({
    schema: convertSchema,
    defaultValues: { document: "" },
    action: (v) => convertLeadAction(leadId, v),
    onSuccess: (d) => {
      if (d) router.push(`/clientes/${d.clientId}`);
      router.refresh();
    },
  });
  const err = fieldError(form, "document");
  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Field label={`Converter em cliente — ${type === "PERSON" ? "CPF" : "CNPJ"} (opcional)`} htmlFor="conv-doc" error={err} hint="Cria o cliente ativo com os dados do lead e marca o lead como ganho.">
        <Input id="conv-doc" aria-invalid={Boolean(err)} {...form.register("document")} />
      </Field>
      <Button type="submit" size="sm" loading={pending}>Converter em cliente</Button>
    </form>
  );
}

export function ReopenButton({ leadId }: { leadId: string }) {
  return <ActionButton label="Reabrir lead" variant="secondary" size="sm" action={() => reopenLeadAction(leadId)} />;
}

export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      label="Excluir lead"
      confirmLabel="Excluir lead"
      description="O lead deixa de aparecer no funil."
      action={() => deleteLeadAction(leadId)}
      onDone={() => router.push("/crm")}
    />
  );
}
