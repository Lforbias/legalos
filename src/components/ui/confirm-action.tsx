"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/validation/common";

/** Ação destrutiva em duas etapas (sem `window.confirm`): primeiro clique pede confirmação explícita. */
export function ConfirmAction({
  label,
  confirmLabel = "Confirmar",
  description,
  action,
  onDone,
  size = "sm",
  icon,
}: {
  label: string;
  confirmLabel?: string;
  description?: string;
  action: () => Promise<ActionState>;
  onDone?: () => void;
  size?: "sm" | "md";
  icon?: React.ReactNode;
}) {
  const [asking, setAsking] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setError(res.message ?? "Não foi possível concluir a operação.");
          return;
        }
        setAsking(false);
        onDone?.();
      } catch {
        setError("Falha de comunicação com o servidor.");
      }
    });
  };

  if (!asking) {
    return (
      <Button variant="danger" size={size} onClick={() => setAsking(true)}>
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={`Confirmar: ${label}`}>
      {description ? <p className="text-xs text-muted">{description}</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button variant="danger" size={size} loading={pending} onClick={run}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" size={size} disabled={pending} onClick={() => setAsking(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
