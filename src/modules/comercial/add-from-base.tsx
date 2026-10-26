"use client";

import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { addFromBaseAction } from "./actions";
import { useRun } from "./use-run";

export function AddFromBase({ cnpj, disabled }: { cnpj: string; disabled?: boolean }) {
  const router = useRouter();
  const { run, pending, error } = useRun();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size="sm" loading={pending} disabled={disabled} onClick={() => run(() => addFromBaseAction(cnpj), (d) => d && router.push(`/comercial/escritorios/${d.id}`))}>Levar para o funil</Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </span>
  );
}
