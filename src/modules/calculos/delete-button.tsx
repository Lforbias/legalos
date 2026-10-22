"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useRun } from "@/modules/kanban/use-run";
import { deleteCalcAction } from "./actions";

export function DeleteCalcButton({ id }: { id: string }) {
  const router = useRouter();
  const { run, pending, error } = useRun();
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="ghost" loading={pending} onClick={() => { if (confirm("Excluir este cálculo salvo?")) run(() => deleteCalcAction(id), undefined, () => router.push("/calculos")); }}>Excluir</Button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
