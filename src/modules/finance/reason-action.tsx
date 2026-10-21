"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import type { ActionState } from "@/lib/validation/common";
import { cancelEntryAction, reversePaymentAction } from "./actions";

/** Ação sensível que exige um motivo escrito (cancelar lançamento, estornar baixa). Sem `window.prompt`. */
export function ReasonAction({ label, confirmLabel, placeholder = "Motivo", action }: { label: string; confirmLabel: string; placeholder?: string; action: (reason: string) => Promise<ActionState> }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  if (!open) {
    return (
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label className="sr-only" htmlFor={`reason-${label}`}>{placeholder}</label>
      <Input id={`reason-${label}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} maxLength={500} />
      <div className="flex gap-2">
        <Button
          variant="danger"
          size="sm"
          loading={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await action(reason);
              if (!res.ok) {
                setError(res.fieldErrors?.reason?.[0] ?? res.message ?? "Não foi possível concluir.");
                return;
              }
              setOpen(false);
              setReason("");
              router.refresh();
            })
          }
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Voltar
        </Button>
      </div>
    </div>
  );
}

export function ReversePaymentButton({ paymentId, entryId }: { paymentId: string; entryId: string }) {
  return <ReasonAction label="Estornar" confirmLabel="Confirmar estorno" placeholder="Motivo do estorno" action={(reason) => reversePaymentAction(paymentId, entryId, reason)} />;
}

export function CancelEntryButton({ entryId }: { entryId: string }) {
  return <ReasonAction label="Cancelar lançamento" confirmLabel="Confirmar cancelamento" placeholder="Motivo do cancelamento" action={(reason) => cancelEntryAction(entryId, reason)} />;
}
