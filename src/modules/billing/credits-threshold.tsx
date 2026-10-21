"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { setLowThresholdAction } from "./credits-actions";

export function LowThresholdForm({ initial }: { initial: number }) {
  const router = useRouter();
  const [value, setValue] = React.useState(String(initial));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="low-threshold" className="block text-xs text-muted">Avisar quando o saldo chegar a (0 = sem aviso)</label>
        <Input id="low-threshold" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} className="w-32" />
      </div>
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await setLowThresholdAction(Number(value || "0"));
            if (!r.ok) setError(r.message ?? "Não foi possível salvar.");
            else {
              setError(null);
              router.refresh();
            }
          })
        }
      >
        Salvar
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
