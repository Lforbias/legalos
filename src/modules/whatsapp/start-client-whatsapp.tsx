"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { startClientWhatsappAction } from "./actions";

export function StartClientWhatsapp({ clientId }: { clientId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button size="sm" loading={pending} onClick={() => start(async () => {
        setError(null);
        const result = await startClientWhatsappAction(clientId);
        if (!result.ok) setError(result.message ?? "Não foi possível abrir a conversa.");
      })}>
        Iniciar conversa
      </Button>
    </div>
  );
}
