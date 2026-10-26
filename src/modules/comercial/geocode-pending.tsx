"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { geocodePendingAction } from "./actions";
import { useRun } from "./use-run";

export function GeocodePending({ missing }: { missing: number }) {
  const { run, pending, error } = useRun();
  const [msg, setMsg] = React.useState<string | null>(null);
  if (missing === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
      <span>{missing} escritórios ainda sem ponto no mapa.</span>
      <Button size="sm" loading={pending} onClick={() => run(() => geocodePendingAction(), (d) => d && setMsg(`Tentei ${d.tried}, achei ${d.found}. Faltam ${d.left} por tentar.`))}>Localizar 8 agora</Button>
      <span className="text-xs text-muted">O OpenStreetMap limita a 1 consulta por segundo, por isso é em lotes pequenos.</span>
      {msg ? <span className="text-xs">{msg}</span> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
