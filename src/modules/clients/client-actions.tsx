"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { archiveClientAction } from "./actions";

export function ArchiveClientButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      label="Excluir cliente"
      confirmLabel="Excluir definitivamente da lista"
      description="O cliente deixa de aparecer nas listas (exclusão lógica, registrada na auditoria). Não é possível se houver processos em andamento."
      icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
      size="md"
      action={() => archiveClientAction(clientId)}
      onDone={() => {
        router.replace("/clientes");
        router.refresh();
      }}
    />
  );
}
