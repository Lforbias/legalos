"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { BadgeCheck, CheckCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { cancelDeadlineAction, fulfillDeadlineAction, validateDeadlineAction } from "./actions";

export function DeadlineControls({ id, status, canWrite, canValidate }: { id: string; status: string; canWrite: boolean; canValidate: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const run = (fn: () => ReturnType<typeof validateDeadlineAction>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message ?? "Não foi possível concluir a operação.");
      router.refresh();
    });
  };
  const open = status === "DRAFT" || status === "VALIDATED";
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {status === "DRAFT" ? (
        canValidate ? (
          <Button loading={pending} onClick={() => run(() => validateDeadlineAction(id))}>
            <BadgeCheck className="h-4 w-4" aria-hidden /> Validar prazo
          </Button>
        ) : (
          <p className="text-xs text-muted">Aguardando validação de um profissional com a permissão “Validar prazos”.</p>
        )
      ) : null}
      {status === "VALIDATED" && canWrite ? (
        <Button variant="secondary" loading={pending} onClick={() => run(() => fulfillDeadlineAction(id))}>
          <CheckCheck className="h-4 w-4" aria-hidden /> Marcar como cumprido
        </Button>
      ) : null}
      {open && canWrite ? (
        <ConfirmAction label="Cancelar prazo" confirmLabel="Sim, cancelar" description="Use quando o prazo foi cadastrado por engano ou deixou de existir. Fica registrado na auditoria." action={() => cancelDeadlineAction(id)} onDone={() => router.refresh()} />
      ) : null}
    </div>
  );
}
