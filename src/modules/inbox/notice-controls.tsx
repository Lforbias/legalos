"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input, Select } from "@/components/ui/form";
import type { ActionState } from "@/lib/validation/common";
import { assignNoticeAction, deleteNoticeAction, discardNoticeAction, linkNoticeCaseAction, processNoticeAction, reopenNoticeAction } from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const run = (fn: () => Promise<ActionState>, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message ?? "Não foi possível concluir a operação.");
      else after?.();
      router.refresh();
    });
  };
  return { run, pending, error, router };
}

export function AssignControl({ id, members, current, disabled }: { id: string; members: { id: string; name: string }[]; current: string; disabled?: boolean }) {
  const { run, pending, error } = useRun();
  const [value, setValue] = React.useState(current);
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label htmlFor="assign" className="sr-only">Responsável</label>
      <Select id="assign" value={value} disabled={disabled || pending} onChange={(e) => setValue(e.target.value)}>
        <option value="">Selecione…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </Select>
      <Button size="sm" variant="secondary" disabled={disabled || !value || value === current} loading={pending} onClick={() => run(() => assignNoticeAction(id, { userId: value }))}>
        Distribuir
      </Button>
    </div>
  );
}

export function LinkCaseControl({ id, cases, current, disabled }: { id: string; cases: { id: string; title: string; number: string | null }[]; current: string; disabled?: boolean }) {
  const { run, pending, error } = useRun();
  const [value, setValue] = React.useState(current);
  const options = current && !cases.some((c) => c.id === current) ? [{ id: current, title: "Processo vinculado", number: null }, ...cases] : cases;
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label htmlFor="link-case" className="sr-only">Processo</label>
      <Select id="link-case" value={value} disabled={disabled || pending} onChange={(e) => setValue(e.target.value)}>
        <option value="">Sem processo</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>{c.title}{c.number ? ` — ${c.number}` : ""}</option>
        ))}
      </Select>
      <Button size="sm" variant="secondary" disabled={disabled || value === current} loading={pending} onClick={() => run(() => linkNoticeCaseAction(id, value))}>
        Salvar vínculo
      </Button>
    </div>
  );
}

export function StatusControls({ id, status, canWrite, canDelete }: { id: string; status: string; canWrite: boolean; canDelete: boolean }) {
  const { run, pending, error, router } = useRun();
  const [discarding, setDiscarding] = React.useState(false);
  const [reason, setReason] = React.useState("");
  if (!canWrite) return null;
  const open = status === "NEW" || status === "DISTRIBUTED";
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {open ? (
        <>
          <Button loading={pending} onClick={() => run(() => processNoticeAction(id))}>Marcar como tratada</Button>
          {discarding ? (
            <div className="space-y-2">
              <label htmlFor="discard-reason" className="block text-xs text-muted">Motivo do descarte</label>
              <Input id="discard-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: duplicada, não é do escritório" />
              <div className="flex gap-2">
                <Button variant="danger" size="sm" loading={pending} onClick={() => run(() => discardNoticeAction(id, { reason }), () => setDiscarding(false))}>Confirmar descarte</Button>
                <Button variant="ghost" size="sm" onClick={() => setDiscarding(false)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setDiscarding(true)}>Descartar…</Button>
          )}
        </>
      ) : (
        <Button variant="secondary" loading={pending} onClick={() => run(() => reopenNoticeAction(id))}>Reabrir</Button>
      )}
      {canDelete ? (
        <ConfirmAction label="Excluir intimação" confirmLabel="Sim, excluir" description="Exclusão lógica, registrada na auditoria." action={() => deleteNoticeAction(id)} onDone={() => router.replace("/caixa-de-entrada")} />
      ) : null}
    </div>
  );
}
