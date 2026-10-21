"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/validation/common";
import { retryDeliveryAction, retryMailAction, runJobAction, switchOffAction, testIntegrationAction } from "./developer-actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const run = <T,>(fn: () => Promise<ActionState<T>>, text: (d: T) => string) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: text(r.data as T) } : { ok: false, text: r.message ?? "Não foi possível concluir." });
      router.refresh();
    });
  };
  return { run, pending, msg };
}

export function RunJobButton({ job }: { job: string }) {
  const { run, pending, msg } = useRun();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => runJobAction(job), (d: { message: string }) => d.message)}>{pending ? "Rodando…" : "Rodar agora"}</Button>
      {msg ? <span role="status" className={`text-xs ${msg.ok ? "text-muted" : "text-danger"}`}>{msg.text}</span> : null}
    </span>
  );
}

export function TestButton({ k, label }: { k: string; label: string }) {
  const { run, pending, msg } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-2 last:border-0">
      <span className="min-w-56 text-sm font-medium">{label}</span>
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => testIntegrationAction(k), (d: { ok: boolean; ms: number; message: string }) => `${d.ok ? "OK" : "FALHOU"} (${d.ms} ms) — ${d.message}`)}>{pending ? "Testando…" : "Testar"}</Button>
      {msg ? <span role="status" className={`text-sm ${msg.ok && msg.text.startsWith("OK") ? "text-success" : "text-danger"}`}>{msg.text}</span> : null}
    </div>
  );
}

export function RetryButton({ id, kind }: { id: string; kind: "delivery" | "mail" }) {
  const { run, pending, msg } = useRun();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => (kind === "delivery" ? retryDeliveryAction(id) : retryMailAction(id)), () => "Reenfileirado.")}>Reenviar</Button>
      {msg ? <span role="status" className={`text-xs ${msg.ok ? "text-muted" : "text-danger"}`}>{msg.text}</span> : null}
    </span>
  );
}

export function SwitchOffButton({ orgId, k, orgName, label }: { orgId: string; k: string; orgName: string; label: string }) {
  const { run, pending, msg } = useRun();
  const [asking, setAsking] = React.useState(false);
  if (!asking) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <Button type="button" variant="secondary" size="sm" onClick={() => setAsking(true)} aria-label={`Desligar ${label} de ${orgName}`}>Desligar</Button>
        {msg ? <span role="status" className={`text-xs ${msg.ok ? "text-muted" : "text-danger"}`}>{msg.text}</span> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Alert tone="warning">Desligar {label} de {orgName}? Só o escritório pode religar.</Alert>
      <span className="flex gap-2">
        <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => run(() => switchOffAction(orgId, k), (d: { changed: number }) => `Desligado (${d.changed} item(ns)).`)}>Confirmar</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setAsking(false)}>Cancelar</Button>
      </span>
    </span>
  );
}
