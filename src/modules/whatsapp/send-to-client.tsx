"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { sendToClientAction } from "./actions";

export type SendTarget = { clientId: string; name: string; blockedReason: string | null; suggested: string };

/**
 * "Enviar por WhatsApp": mostra o texto sugerido, a pessoa lê/edita e clica em enviar. Nada sai sem esse clique.
 * `compact` mostra só um botão pequeno que abre o campo (para listas).
 */
export function SendToClient({ target, source, caseId, compact = false }: { target: SendTarget; source: "case" | "client" | "birthday"; caseId?: string; compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(target.suggested);
  const [msg, setMsg] = React.useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  const send = () => start(async () => {
    const r = await sendToClientAction({ clientId: target.clientId, caseId: caseId ?? null, text }, source);
    if (r.ok && r.data && !r.data.error) { setMsg({ tone: "success", text: `Enviado para ${target.name}.` }); setOpen(false); }
    else setMsg({ tone: "error", text: r.ok && r.data?.error ? `Não foi entregue: ${r.data.error}` : (r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "") || r.message || "Não foi possível enviar." });
  });
  return (
    <div className={compact ? (open ? "block w-full basis-full" : "inline-block") : "space-y-2"} data-testid="send-client">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {target.blockedReason ? (
        <p className="text-xs text-muted" data-testid="send-client-blocked">{target.name}: {target.blockedReason}</p>
      ) : !open ? (
        <Button size="sm" variant="secondary" onClick={() => { setOpen(true); setMsg(null); }} data-testid="send-client-open">Enviar por WhatsApp{compact ? "" : ` para ${target.name}`}</Button>
      ) : (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted">Revise a mensagem para <strong>{target.name}</strong>. Ela só é enviada quando você clicar em Enviar.</p>
          <Textarea rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Mensagem para ${target.name}`} data-testid="send-client-text" />
          <div className="flex gap-2">
            <Button size="sm" loading={pending} onClick={send} data-testid="send-client-submit">Enviar</Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
