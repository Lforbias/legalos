"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { deleteTaskAction } from "./actions";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      label="Excluir tarefa"
      confirmLabel="Sim, excluir"
      description="A tarefa deixa de aparecer nas listas. A exclusão fica registrada na auditoria."
      icon={<Trash2 className="h-4 w-4" aria-hidden />}
      action={() => deleteTaskAction(taskId)}
      onDone={() => router.replace("/tarefas")}
    />
  );
}
