"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { archiveClientAction } from "./actions";

export function ArchiveClientButton({ clientId, compact = false, redirectToList = true }: { clientId: string; compact?: boolean; redirectToList?: boolean }) {
  const router = useRouter();
  return (
    <ConfirmAction
      label={compact ? "Excluir" : "Excluir cliente"}
      confirmLabel="Excluir da lista"
      description="O cadastro será ocultado das listas e ficará registrado na auditoria. O histórico jurídico é preservado. Clientes com processos em andamento ou suspensos não podem ser excluídos."
      icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
      size={compact ? "sm" : "md"}
      action={() => archiveClientAction(clientId)}
      onDone={() => {
        if (redirectToList) router.replace("/clientes");
        router.refresh();
      }}
    />
  );
}
