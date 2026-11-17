"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { startClientWhatsappAction, startLeadWhatsappAction } from "./actions";

export function StartClientWhatsapp({ contact, label = "Iniciar conversa" }: { contact: { clientId: string } | { leadId: string }; label?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button size="sm" loading={pending} onClick={() => start(async () => {
        setError(null);
        const result = "leadId" in contact
          ? await startLeadWhatsappAction(contact.leadId)
          : await startClientWhatsappAction(contact.clientId);
        if (!result.ok) setError(result.message ?? "Não foi possível abrir a conversa.");
      })}>
        {label}
      </Button>
    </div>
  );
}
