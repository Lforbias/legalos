"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import type { ActionState } from "@/lib/validation/common";
import { reactivateOrganizationAction, setSubscriptionAction, updatePlanAction, setUserDisabledAction, suspendOrganizationAction, unlockUserAction } from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const run = (fn: () => Promise<ActionState>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível concluir.");
      else after?.();
      router.refresh();
    });
  };
  return { run, pending, error };
}

export function OrgSuspendControl({ orgId, suspended }: { orgId: string; suspended: boolean }) {
  const { run, pending, error } = useRun();
  const [asking, setAsking] = React.useState(false);
  const [reason, setReason] = React.useState("");
  if (suspended)
    return (
      <div className="space-y-1">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => reactivateOrganizationAction(orgId))}>Reativar</Button>
      </div>
    );
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {asking ? (
        <div className="space-y-2">
          <label htmlFor={`reason-${orgId}`} className="block text-xs text-muted">Motivo (fica registrado)</label>
          <Input id={`reason-${orgId}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: inadimplência" />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={pending} onClick={() => run(() => suspendOrganizationAction(orgId, reason), () => { setAsking(false); setReason(""); })}>Confirmar suspensão</Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>Suspender…</Button>
      )}
    </div>
  );
}

export function UserControls({ userId, disabled, locked, protectedUser }: { userId: string; disabled: boolean; locked: boolean; protectedUser: boolean }) {
  const { run, pending, error } = useRun();
  if (protectedUser) return <span className="text-xs text-muted">Protegido</span>;
  return (
    <div className="space-y-1">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setUserDisabledAction(userId, !disabled))}>{disabled ? "Reativar" : "Desativar"}</Button>
        {locked ? <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => unlockUserAction(userId))}>Desbloquear</Button> : null}
      </div>
    </div>
  );
}

const STATUS_OPTIONS = [["TRIALING", "Em teste"], ["ACTIVE", "Ativa (paga)"], ["PAST_DUE", "Pagamento em atraso"], ["CANCELED", "Cancelada"]] as const;

export function SubscriptionControl({ orgId, plans, current }: { orgId: string; plans: { key: string; name: string }[]; current: { planKey: string; status: string } | null }) {
  const { run, pending, error } = useRun();
  const [open, setOpen] = React.useState(false);
  const [planKey, setPlanKey] = React.useState(current?.planKey ?? plans[0]?.key ?? "");
  const [status, setStatus] = React.useState(current?.status ?? "TRIALING");
  const [days, setDays] = React.useState("");
  const [note, setNote] = React.useState("");
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)} data-testid={`sub-open-${orgId}`}>Plano…</Button>;
  const n = days.trim() === "" ? null : Number(days);
  return (
    <div className="mt-2 space-y-2 rounded-md border border-border p-2" data-testid={`sub-form-${orgId}`}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label className="block text-xs text-muted" htmlFor={`plan-${orgId}`}>Plano</label>
      <Select id={`plan-${orgId}`} value={planKey} onChange={(e) => setPlanKey(e.target.value)}>
        {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
      </Select>
      <label className="block text-xs text-muted" htmlFor={`st-${orgId}`}>Situação</label>
      <Select id={`st-${orgId}`} value={status} onChange={(e) => setStatus(e.target.value)}>
        {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      {status === "TRIALING" || status === "ACTIVE" ? (
        <>
          <label className="block text-xs text-muted" htmlFor={`d-${orgId}`}>{status === "TRIALING" ? "Teste termina daqui a (dias)" : "Período pago termina daqui a (dias)"}</label>
          <Input id={`d-${orgId}`} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder="vazio = manter" />
        </>
      ) : null}
      <label className="block text-xs text-muted" htmlFor={`n-${orgId}`}>Observação (fica registrada)</label>
      <Input id={`n-${orgId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: pago via PIX em 20/10" />
      <div className="flex gap-2">
        <Button size="sm" loading={pending} onClick={() => run(() => setSubscriptionAction(orgId, { planKey, status, ...(status === "TRIALING" ? { trialDays: n } : status === "ACTIVE" ? { periodDays: n } : {}), note: note || null }), () => setOpen(false))}>Salvar</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </div>
  );
}

type PlanRow = { key: string; name: string; priceCents: number | null; maxUsers: number | null; maxStorageMb: number | null; maxAiTokensMonth: number | null };

/** Edita preço (em reais) e limites de um plano. Campo vazio = sem preço / sem limite. */
export function PlanEditor({ plan }: { plan: PlanRow }) {
  const { run, pending, error } = useRun();
  const [saved, setSaved] = React.useState(false);
  const [price, setPrice] = React.useState(plan.priceCents == null ? "" : (plan.priceCents / 100).toFixed(2).replace(".", ","));
  const [users, setUsers] = React.useState(plan.maxUsers == null ? "" : String(plan.maxUsers));
  const [storage, setStorage] = React.useState(plan.maxStorageMb == null ? "" : String(plan.maxStorageMb));
  const [ai, setAi] = React.useState(plan.maxAiTokensMonth == null ? "" : String(plan.maxAiTokensMonth));
  const toInt = (v: string) => (v.trim() === "" ? null : Number(v.trim()));
  const toCents = (v: string) => {
    const t = v.trim().replace(/\./g, "").replace(",", ".");
    return t === "" ? null : Math.round(Number(t) * 100);
  };
  return (
    <div className="space-y-2" data-testid={`plan-edit-${plan.key}`}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved && !error ? <Alert tone="success">Plano salvo.</Alert> : null}
      <div className="grid gap-2 sm:grid-cols-4">
        <div><label htmlFor={`price-${plan.key}`} className="mb-1 block text-xs text-muted">Preço mensal (R$)</label><Input id={`price-${plan.key}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="sem preço" /></div>
        <div><label htmlFor={`users-${plan.key}`} className="mb-1 block text-xs text-muted">Usuários</label><Input id={`users-${plan.key}`} inputMode="numeric" value={users} onChange={(e) => setUsers(e.target.value)} placeholder="ilimitado" /></div>
        <div><label htmlFor={`storage-${plan.key}`} className="mb-1 block text-xs text-muted">Armazenamento (MB)</label><Input id={`storage-${plan.key}`} inputMode="numeric" value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="ilimitado" /></div>
        <div><label htmlFor={`ai-${plan.key}`} className="mb-1 block text-xs text-muted">IA (tokens/mês; 0 = sem IA)</label><Input id={`ai-${plan.key}`} inputMode="numeric" value={ai} onChange={(e) => setAi(e.target.value)} placeholder="ilimitado" /></div>
      </div>
      <Button size="sm" loading={pending} onClick={() => { setSaved(false); run(() => updatePlanAction(plan.key, { priceCents: toCents(price), maxUsers: toInt(users), maxStorageMb: toInt(storage), maxAiTokensMonth: toInt(ai) }), () => setSaved(true)); }} data-testid={`plan-save-${plan.key}`}>Salvar plano</Button>
    </div>
  );
}
