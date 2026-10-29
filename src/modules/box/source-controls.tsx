"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CheckOutcome } from "@/server/judicial/onboarding.service";
import { checkSourceAction, setSourceEnabledAction } from "./actions";

const TONE = { success: "success", warning: "warning", error: "error" } as const;

/** Ações de uma fonte: consultar agora (resultado real e explicado) e ligar/desligar. */
export function SourceControls({ kind, id, enabled, canCheck, canToggle }: { kind: "DJEN" | "MNI" | "PORTAL"; id: string; enabled: boolean; canCheck: boolean; canToggle: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [outcome, setOutcome] = React.useState<CheckOutcome | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const check = () =>
    start(async () => {
      setError(null);
      setOutcome(null);
      const r = await checkSourceAction(kind, id);
      if (!r.ok || !r.data) setError(r.message ?? "Não foi possível consultar agora.");
      else setOutcome(r.data);
      router.refresh();
    });
  const toggle = () =>
    start(async () => {
      setError(null);
      setOutcome(null);
      const r = await setSourceEnabledAction(kind, id, !enabled);
      if (!r.ok) setError(r.message ?? "Não foi possível alterar.");
      router.refresh();
    });

  if (!canCheck && !canToggle) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canCheck && enabled ? <Button size="sm" variant="secondary" loading={pending} onClick={check} data-testid={`check-${kind}-${id}`}>{kind === "PORTAL" ? "Testar login agora" : "Consultar agora"}</Button> : null}
        {canToggle ? <Button size="sm" variant="ghost" disabled={pending} onClick={toggle}>{enabled ? "Desligar" : "Ligar"}</Button> : null}
      </div>
      <div aria-live="polite">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {outcome ? (
          <Alert tone={TONE[outcome.tone]}>
            <strong className="font-medium">{outcome.title}.</strong> {outcome.detail} <span className="text-xs opacity-80">({Math.max(1, Math.round(outcome.durationMs / 1000))} s)</span>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
