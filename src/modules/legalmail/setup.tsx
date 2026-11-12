"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createLegalMailWebhookKey, enableLegalMailOffice, saveLegalMailApiKey } from "./actions";

export function LegalMailPilotButton({ officeId, officeName }: { officeId: string; officeName: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div className="mt-2 space-y-2">
      <Button size="sm" variant="secondary" loading={pending} onClick={() => {
        if (!window.confirm(`Liberar o LegalMail somente para ${officeName}?`)) return;
        start(async () => {
          const result = await enableLegalMailOffice(officeId);
          setMessage(result.ok ? "LegalMail liberado." : result.message ?? "Não foi possível liberar o LegalMail.");
        });
      }}>Liberar LegalMail</Button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

export function LegalMailKeyForm({ configured }: { configured: boolean }) {
  const [pending, start] = useTransition();
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="space-y-2" onSubmit={(event) => {
      event.preventDefault();
      start(async () => {
        const result = await saveLegalMailApiKey(key);
        if (result.ok) setKey("");
        setMessage({ ok: result.ok, text: result.ok ? "Chave validada e salva." : result.message ?? "Não foi possível salvar a chave." });
      });
    }}>
      <Field label="Chave de API do LegalMail" htmlFor="legalmail-api-key">
        <Input id="legalmail-api-key" type="password" autoComplete="off" required maxLength={500} value={key} onChange={(event) => setKey(event.target.value)} placeholder={configured ? "Chave salva. Cole outra para substituir." : "Cole a chave gerada no painel LegalMail"} />
      </Field>
      <Button type="submit" size="sm" loading={pending}>Validar e salvar chave</Button>
      {message ? <Alert tone={message.ok ? "success" : "error"}>{message.text}</Alert> : null}
    </form>
  );
}

export function LegalMailWebhookKeyButton() {
  const [pending, start] = useTransition();
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => {
        const result = await createLegalMailWebhookKey();
        setToken(result.ok ? result.data?.token : undefined);
        setError(result.ok ? undefined : result.message ?? "Não foi possível gerar a chave.");
      })}>Gerar chave do webhook para 1 dia</Button>
      {token ? <Alert tone="success">
        <p>Copie a chave e cole no campo de autenticação do webhook no LegalMail.</p>
        <code className="block select-all break-all">{token}</code>
      </Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
