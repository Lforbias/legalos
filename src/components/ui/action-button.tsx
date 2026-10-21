"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/validation/common";

/** Botão que executa uma Server Action, mostra o erro devolvido e atualiza a página. */
export function ActionButton({
  label,
  action,
  variant = "primary",
  size,
  onDone,
}: {
  label: string;
  action: () => Promise<ActionState<unknown>>;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  onDone?: (res: ActionState<unknown>) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div>
      <Button
        variant={variant}
        size={size}
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await action();
            if (!res.ok) setError(res.message ?? "Não foi possível concluir a operação.");
            onDone?.(res);
            router.refresh();
          })
        }
      >
        {label}
      </Button>
      {error ? <p role="alert" className="mt-1 max-w-xs text-xs text-danger">{error}</p> : null}
    </div>
  );
}
