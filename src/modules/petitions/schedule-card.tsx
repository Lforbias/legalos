"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { schedulePetitionAction, setScheduleSwitchAction, unschedulePetitionAction } from "./queue-actions";

/** Agendar o envio de uma petição APROVADA. Em protocolo real, a pessoa confirma digitando o número do processo. */
export function ScheduleCard({ id, enabled, scheduledLabel, note, real, caseNumber, stale }: { id: string; enabled: boolean; scheduledLabel: string | null; note: string | null; real: boolean; caseNumber: string | null; stale: boolean }) {
  const router = useRouter();
  const [at, setAt] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg(r.message ?? "Não foi possível concluir.");
      router.refresh();
    });
  if (!enabled) return <p className="text-sm text-muted">O agendamento de protocolos está desligado neste escritório (um administrador liga em Peticionamento → Fila de protocolos).</p>;
  return (
    <div className="space-y-3" data-testid="schedule-card">
      {note ? <Alert tone="warning">Último agendamento não executado: {note}</Alert> : null}
      {scheduledLabel ? (
        <div className="space-y-2">
          <p className="text-sm">Envio agendado para <strong data-testid="scheduled-for">{scheduledLabel}</strong>.</p>
          <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => unschedulePetitionAction(id))}>Cancelar agendamento</Button>
        </div>
      ) : stale ? (
        <p className="text-sm text-muted">O documento mudou depois da aprovação; devolva ao rascunho antes de agendar.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Enviar em" htmlFor={`sch-at-${id}`}>
              <Input id={`sch-at-${id}`} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
            </Field>
            {real ? (
              <Field label="Digite o número do processo para confirmar" htmlFor={`sch-confirm-${id}`} hint={`Número: ${caseNumber ?? "sem número"}`}>
                <Input id={`sch-confirm-${id}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
              </Field>
            ) : null}
            <Button size="sm" loading={pending} disabled={!at} onClick={() => run(() => schedulePetitionAction(id, new Date(at).toISOString(), real ? confirm : undefined))}>Agendar envio</Button>
          </div>
          <p className="text-xs text-muted">O sistema envia a versão aprovada no horário escolhido. Se algo mudar, o agendamento é cancelado e você é avisado.</p>
        </div>
      )}
      {msg ? <p role="alert" className="text-xs text-danger">{msg}</p> : null}
    </div>
  );
}

export function ScheduleSwitch({ on, canManage }: { on: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3 text-sm">
      <span>Agendamento de protocolos: <strong data-testid="schedule-state">{on ? "LIGADO" : "desligado"}</strong></span>
      {canManage ? (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => { setMsg(null); const r = await setScheduleSwitchAction(!on); if (!r.ok) setMsg(r.message ?? "Erro."); router.refresh(); })}>
          {on ? "Desligar (cancela os agendados)" : "Ligar"}
        </Button>
      ) : null}
      {msg ? <span role="alert" className="text-xs text-danger">{msg}</span> : null}
    </div>
  );
}
