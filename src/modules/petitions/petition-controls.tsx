"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Textarea } from "@/components/ui/form";
import type { ActionState } from "@/lib/validation/common";
import { approvePetitionAction, cancelPetitionAction, requestReviewAction, returnPetitionAction, submitPetitionAction } from "./actions";
import { returnSchema, type ReturnInput } from "./schemas";

function StepButton({ label, action, variant = "primary" }: { label: string; action: () => Promise<ActionState<unknown>>; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div>
      <Button variant={variant} loading={pending} onClick={() => start(async () => {
        setError(null);
        const res = await action();
        if (!res.ok) setError(res.message ?? "Não foi possível concluir a operação.");
        router.refresh();
      })}>{label}</Button>
      {error ? <p role="alert" className="mt-1 max-w-xs text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function ReturnForm({ id }: { id: string }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<ReturnInput, undefined>({
    schema: returnSchema,
    defaultValues: { note: "" },
    action: (v) => returnPetitionAction(id, v),
    onSuccess: () => router.refresh(),
  });
  const err = fieldError(form, "note");
  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Field label="Devolver para ajustes" htmlFor="return-note" error={err}>
        <Textarea id="return-note" rows={3} placeholder="O que precisa ser corrigido?" aria-invalid={Boolean(err)} {...form.register("note")} />
      </Field>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>Devolver ao rascunho</Button>
    </form>
  );
}

/** O que dizer depois de um envio. Teste nunca é chamado de protocolo; sem recibo oficial, não se afirma que foi protocolada. */
function describeResult(r: { protocol: string | null; isDemo: boolean; status: string; environment: string; officiallyFiled: boolean }): string {
  if (r.officiallyFiled) return `Petição protocolada com confirmação oficial. Protocolo: ${r.protocol}.`;
  if (r.status === "AWAITING_CONFIRMATION") return `O tribunal respondeu${r.protocol ? ` (protocolo informado: ${r.protocol})` : ""}, mas sem o recibo oficial. Confira no tribunal e registre o recibo abaixo.`;
  if (r.isDemo) return `Envio de DEMONSTRAÇÃO concluído${r.protocol ? ` (protocolo de teste: ${r.protocol})` : ""}. Nenhum tribunal recebeu esta petição.`;
  return `Envio de TESTE concluído${r.protocol ? ` (protocolo de teste: ${r.protocol})` : ""}. Nenhum tribunal real recebeu esta petição.`;
}

export function PetitionControls({
  id,
  status,
  stale,
  canWrite,
  canApprove,
  real = false,
  caseNumber = null,
  canResend = true,
  resendBlockedReason = null,
}: {
  real?: boolean;
  caseNumber?: string | null;
  /** Falso quando não há certeza de que o tribunal não recebeu a petição: só a conferência por uma pessoa libera. */
  canResend?: boolean;
  resendBlockedReason?: string | null;
  id: string;
  status: string;
  stale: boolean;
  canWrite: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState("");
  const open = ["DRAFT", "IN_REVIEW", "APPROVED", "FAILED"].includes(status);
  return (
    <div className="space-y-4">
      {result ? <Alert tone="success">{result}</Alert> : null}
      {stale && ["IN_REVIEW", "APPROVED", "FAILED"].includes(status) ? (
        <Alert tone="warning">O documento recebeu uma nova versão depois do envio para revisão. Devolva a petição ao rascunho e reenvie para revisão.</Alert>
      ) : null}
      <div className="flex flex-wrap items-start gap-3">
        {status === "DRAFT" && canWrite ? <StepButton label="Enviar para revisão" action={() => requestReviewAction(id)} /> : null}
        {status === "IN_REVIEW" && canApprove ? <StepButton label="Aprovar" action={() => approvePetitionAction(id)} /> : null}
        {["APPROVED", "FAILED"].includes(status) && canApprove && !stale && canResend ? (
          <div className="space-y-2">
            {real ? (
              <Field label="Para protocolar no tribunal, digite o número do processo" htmlFor={`confirm-${id}`} hint={`Ato irreversível. Número: ${caseNumber ?? "sem número"}`}>
                <Input id={`confirm-${id}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" data-testid="petition-confirm" />
              </Field>
            ) : null}
            <StepButton
              label={real ? "Protocolar no tribunal" : status === "FAILED" ? "Tentar enviar de novo" : "Enviar (demonstração)"}
              action={async () => {
                const res = await submitPetitionAction(id, real ? confirm : undefined);
                if (res.ok && res.data) setResult(describeResult(res.data));
                return res;
              }}
            />
          </div>
        ) : null}
        {["APPROVED", "FAILED"].includes(status) && canApprove && !canResend && resendBlockedReason ? (
          <Alert tone="warning" className="max-w-md" data-testid="petition-resend-blocked">{resendBlockedReason}</Alert>
        ) : null}
        {open && canWrite ? (
          <ConfirmAction label="Cancelar petição" confirmLabel="Cancelar petição" description="A petição fica cancelada e não pode mais ser enviada." action={() => cancelPetitionAction(id)} onDone={() => router.refresh()} />
        ) : null}
      </div>
      {["IN_REVIEW", "APPROVED"].includes(status) && canApprove ? <ReturnForm id={id} /> : null}
    </div>
  );
}
