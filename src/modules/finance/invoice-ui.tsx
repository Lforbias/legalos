"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { formatMoneyBR } from "@/lib/validation/money";
import { useRun } from "@/modules/kanban/use-run";
import { ReasonAction } from "./reason-action";
import { cancelInvoiceAction, issueInvoiceAction, setBoletoAction } from "./invoice-actions";

export type ToBillGroup = { clientId: string; clientName: string; total: string; items: { id: string; description: string; amount: string; due: string; installment: string | null }[] };

export function ToBillList({ groups, canWrite }: { groups: ToBillGroup[]; canWrite: boolean }) {
  const [sel, setSel] = React.useState<Record<string, Set<string>>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const { run, pending, error, done } = useRun();
  const toggle = (cid: string, id: string) =>
    setSel((s) => {
      const n = new Set(s[cid] ?? []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { ...s, [cid]: n };
    });
  if (groups.length === 0) return <p className="p-6 text-center text-sm text-muted">Nenhum honorário aguardando fatura.</p>;
  return (
    <div className="divide-y divide-border">
      {error ? <div className="p-3"><Alert tone="error">{error}</Alert></div> : null}
      {done ? <div className="p-3"><Alert tone="success">{done}</Alert></div> : null}
      {groups.map((g) => {
        const chosen = sel[g.clientId] ?? new Set<string>();
        return (
          <section key={g.clientId} className="p-4" aria-label={g.clientName}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{g.clientName}</h3>
              <span className="text-xs text-muted tabular-nums">{formatMoneyBR(g.total)} a faturar</span>
            </div>
            <ul className="mt-2 space-y-1">
              {g.items.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-sm">
                  {canWrite ? <input type="checkbox" aria-label={`Incluir ${i.description}`} checked={chosen.has(i.id)} onChange={() => toggle(g.clientId, i.id)} /> : null}
                  <span className="min-w-0 flex-1 truncate">{i.description}{i.installment ? ` (${i.installment})` : ""}</span>
                  <span className="text-xs text-muted">vence {i.due}</span>
                  <span className="tabular-nums">{formatMoneyBR(i.amount)}</span>
                </li>
              ))}
            </ul>
            {canWrite ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input className="max-w-xs" aria-label="Observação da fatura" placeholder="Observação (opcional)" maxLength={500} value={notes[g.clientId] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [g.clientId]: e.target.value }))} />
                <Button size="sm" loading={pending} disabled={chosen.size === 0} onClick={() => run(() => issueInvoiceAction({ clientId: g.clientId, entryIds: [...chosen], notes: notes[g.clientId] }), "Fatura emitida.", () => setSel((s) => ({ ...s, [g.clientId]: new Set() })))}>
                  Emitir fatura ({chosen.size})
                </Button>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function CancelInvoiceButton({ id }: { id: string }) {
  return <ReasonAction label="Cancelar fatura" confirmLabel="Confirmar cancelamento" placeholder="Motivo do cancelamento" action={(reason) => cancelInvoiceAction(id, reason)} />;
}

export function BoletoForm({ entryId, code, url }: { entryId: string; code: string; url: string }) {
  const [c, setC] = React.useState(code);
  const [u, setU] = React.useState(url);
  const { run, pending, error, done } = useRun();
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => setBoletoAction(entryId, { code: c, url: u }), "Boleto salvo."); }}>
      <p className="text-xs text-muted">O sistema não emite boleto: guarde aqui a linha digitável e o link que o banco gerou, para aparecerem na fatura e no fluxo.</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      <Input aria-label="Linha digitável do boleto" placeholder="Linha digitável" value={c} onChange={(e) => setC(e.target.value)} maxLength={80} />
      <Input aria-label="Link do boleto" placeholder="https://…" value={u} onChange={(e) => setU(e.target.value)} maxLength={500} />
      <Button size="sm" type="submit" loading={pending}>Salvar boleto</Button>
    </form>
  );
}
