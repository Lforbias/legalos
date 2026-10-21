"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/form";
import { setCourtSystemAction } from "./actions";

type Row = { jtr: string; label: string; system: string | null; message: string | null; mniConnection: boolean };

export function SystemMapTable({ rows, systems }: { rows: Row[]; systems: { key: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const change = (jtr: string, system: string) =>
    start(async () => {
      setError(null);
      const r = await setCourtSystemAction({ jtr, system: system || null });
      if (!r.ok) setError(r.message ?? "Não foi possível salvar.");
      router.refresh();
    });
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ul className="divide-y divide-border text-sm" data-testid="system-map">
        {rows.map((r) => (
          <li key={r.jtr} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="font-medium">{r.label}</p>
              {r.message ? <p className="text-xs text-muted">{r.message}</p> : r.mniConnection ? <p className="text-xs text-muted">Há conexão PJe/MNI ativa (sistema não definido).</p> : null}
            </div>
            <Select aria-label={`Sistema de ${r.label}`} value={r.system ?? ""} disabled={pending} onChange={(e) => change(r.jtr, e.target.value)} className="w-48">
              <option value="">Não definido</option>
              {systems.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </Select>
          </li>
        ))}
      </ul>
    </div>
  );
}
