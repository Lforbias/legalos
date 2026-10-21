"use client";

import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { deleteRuleAction, setRuleActiveAction } from "./actions";

export function RuleControls({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  return (
    <div className="flex items-start gap-2">
      <ActionButton size="sm" variant="secondary" label={active ? "Desativar" : "Ativar"} action={() => setRuleActiveAction(id, !active)} />
      <ConfirmAction label="Excluir" confirmLabel="Excluir regra" description="A regra deixa de rodar. Tarefas já criadas permanecem." action={() => deleteRuleAction(id)} onDone={() => router.refresh()} />
    </div>
  );
}
