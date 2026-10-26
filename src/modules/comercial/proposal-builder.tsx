"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { brl2 } from "@/lib/comercial/format";
import type { Quote } from "@/lib/comercial/pricing";
import { reaisToCents } from "@/lib/comercial/schemas";
import { createProposalAction, quoteAction } from "./actions";
import { useRun } from "./use-run";

type Plan = { key: string; name: string; priceCents: number | null; maxUsers: number | null };
type Addon = { key: string; name: string; priceCents: number | null; perUser: boolean };

/** Calculadora de proposta: plano + aditivos − desconto. `prospectId` vazio = só simulação. */
export function ProposalBuilder({ prospectId, plans, addons, defaults }: { prospectId?: string; plans: Plan[]; addons: Addon[]; defaults?: { planKey?: string | null; users?: number | null; addonKeys?: string[] } }) {
  const { run, pending, error, ok } = useRun();
  const [planKey, setPlanKey] = React.useState(defaults?.planKey ?? plans[0]?.key ?? "");
  const [users, setUsers] = React.useState(String(defaults?.users ?? 5));
  const [picked, setPicked] = React.useState<string[]>(defaults?.addonKeys ?? []);
  const [discount, setDiscount] = React.useState("0");
  const [setup, setSetup] = React.useState("");
  const [valid, setValid] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [qerr, setQerr] = React.useState<string | null>(null);
  React.useEffect(() => {
    const n = Number(users);
    if (!planKey || !Number.isFinite(n) || n < 1) return;
    const t = setTimeout(async () => {
      const r = await quoteAction({ planKey, users: Math.round(n), addonKeys: picked, discountPct: Math.min(100, Math.max(0, Math.round(Number(discount) || 0))), setupCents: reaisToCents(setup) ?? 0 });
      if (r.ok && r.data) { setQuote(r.data); setQerr(null); } else setQerr(r.message ?? "Não foi possível calcular.");
    }, 250);
    return () => clearTimeout(t);
  }, [planKey, users, picked, discount, setup]);
  const toggle = (k: string) => setPicked((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="success">{ok}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Plano" htmlFor="pb-plan"><Select id="pb-plan" value={planKey} onChange={(e) => setPlanKey(e.target.value)}>{plans.map((p) => <option key={p.key} value={p.key}>{p.name}{p.priceCents == null ? " (sem preço)" : ""}</option>)}</Select></Field>
        <Field label="Usuários" htmlFor="pb-users"><Input id="pb-users" value={users} onChange={(e) => setUsers(e.target.value)} inputMode="numeric" /></Field>
        <Field label="Desconto (%)" htmlFor="pb-disc"><Input id="pb-disc" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="numeric" /></Field>
        <Field label="Implantação única (R$)" htmlFor="pb-setup"><Input id="pb-setup" value={setup} onChange={(e) => setSetup(e.target.value)} inputMode="decimal" placeholder="0,00" /></Field>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-muted">Aditivos</legend>
        {addons.map((a) => (
          <label key={a.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(a.key)} onChange={() => toggle(a.key)} /> {a.name} <span className="text-muted">{a.priceCents == null ? "(sem preço)" : `${brl2(a.priceCents)}${a.perUser ? " por usuário" : ""}`}</span></label>
        ))}
        {addons.length === 0 ? <p className="text-xs text-muted">Nenhum aditivo ativo.</p> : null}
      </fieldset>
      {qerr ? <Alert tone="error">{qerr}</Alert> : null}
      {quote ? (
        <div className="rounded-md border border-border bg-surface-2 p-3 text-sm">
          <ul className="space-y-1">{quote.lines.map((l) => <li key={l.label} className="flex justify-between"><span>{l.label}</span><span className="tabular-nums">{brl2(l.cents)}</span></li>)}</ul>
          {quote.discountCents ? <p className="mt-1 flex justify-between text-muted"><span>Desconto</span><span className="tabular-nums">− {brl2(quote.discountCents)}</span></p> : null}
          <p className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold"><span>Mensal</span><span className="tabular-nums">{brl2(quote.monthlyCents)}</span></p>
          {quote.setupCents ? <p className="flex justify-between text-muted"><span>Implantação (uma vez)</span><span className="tabular-nums">{brl2(quote.setupCents)}</span></p> : null}
          <p className="mt-1 text-xs text-muted">Por ano: {brl2(quote.monthlyCents * 12)}</p>
          {quote.missing.map((m) => <p key={m} className="mt-1 text-xs text-danger">{m}. Defina em Preços e planos.</p>)}
          {quote.warnings.map((m) => <p key={m} className="mt-1 text-xs text-warning">{m}</p>)}
        </div>
      ) : null}
      {prospectId ? (
        <div className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Validade da proposta" htmlFor="pb-valid"><Input id="pb-valid" type="date" value={valid} onChange={(e) => setValid(e.target.value)} /></Field>
            <Field label="Observações" htmlFor="pb-notes"><Textarea id="pb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-10" /></Field>
          </div>
          <Button loading={pending} disabled={!quote || quote.missing.length > 0} onClick={() => run(() => createProposalAction(prospectId, { planKey, users: Number(users), addonKeys: picked, discountPct: Number(discount) || 0, setupCents: setup, validUntil: valid || null, notes }), undefined, "Proposta salva e valor previsto atualizado.")}>Salvar proposta</Button>
        </div>
      ) : null}
    </div>
  );
}
