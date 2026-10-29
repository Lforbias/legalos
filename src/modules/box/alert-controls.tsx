"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acknowledgeAlertAction, recheckHealthAction } from "./actions";

export function AcknowledgeButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div>
      <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => { setError(null); const r = await acknowledgeAlertAction(id); if (!r.ok) setError(r.message ?? "Não foi possível registrar."); router.refresh(); })}>Estou ciente</Button>
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function RecheckButton() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button variant="secondary" loading={pending} onClick={() => start(async () => { setMsg(null); const r = await recheckHealthAction(); setMsg(r.ok && r.data ? { tone: "success", text: `Verificação feita agora: ${r.data.opened} alerta(s) novo(s) ou agravado(s), ${r.data.resolved} resolvido(s).` } : { tone: "error", text: r.message ?? "Não foi possível reavaliar." }); router.refresh(); })}>Reavaliar agora</Button>
      <div aria-live="polite">{msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}</div>
    </div>
  );
}
