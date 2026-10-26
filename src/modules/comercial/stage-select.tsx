"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { STAGE_INFO, STAGE_KEYS, type StageKey } from "@/lib/comercial/stages";
import { moveStageAction } from "./actions";
import { useRun } from "./use-run";

/** Muda a etapa. Perdido pede o motivo; Ganho pede o valor mensal fechado. */
export function StageSelect({ id, stage, expectedCents, compact = false }: { id: string; stage: StageKey; expectedCents?: number | null; compact?: boolean }) {
  const { run, pending, error } = useRun();
  const [next, setNext] = React.useState<StageKey | null>(null);
  const [reason, setReason] = React.useState("");
  const [value, setValue] = React.useState(expectedCents ? (expectedCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
  const needsExtra = next === "PERDIDO" || next === "GANHO";
  return (
    <div className="space-y-1.5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Select aria-label="Etapa do funil" value={next ?? stage} disabled={pending} className={compact ? "h-8 text-xs" : ""} onChange={(e) => {
        const v = e.target.value as StageKey;
        if (v === stage) return setNext(null);
        if (v === "PERDIDO" || v === "GANHO") return setNext(v);
        setNext(null);
        run(() => moveStageAction(id, { stage: v }));
      }}>
        {STAGE_KEYS.map((k) => <option key={k} value={k}>{STAGE_INFO[k].label}</option>)}
      </Select>
      {needsExtra ? (
        <div className="space-y-1.5 rounded-md border border-border bg-surface-2 p-2">
          {next === "PERDIDO" ? <Input aria-label="Motivo da perda" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (ex.: já usa outro sistema)" /> : <Input aria-label="Valor mensal fechado" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Valor mensal fechado (R$)" inputMode="decimal" />}
          <div className="flex gap-2">
            <Button size="sm" loading={pending} onClick={() => run(() => moveStageAction(id, next === "PERDIDO" ? { stage: next, lostReason: reason } : { stage: next, wonMonthlyCents: value }), () => setNext(null))}>Confirmar</Button>
            <Button size="sm" variant="ghost" onClick={() => setNext(null)}>Cancelar</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
