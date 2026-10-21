"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { deleteSnippetAction } from "./actions";

export function DeleteSnippetButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      label="Excluir"
      confirmLabel="Excluir autotexto"
      description="Modelos que usam este autotexto passam a mostrar “[AUTOTEXTO NÃO ENCONTRADO]” ao gerar documentos. Documentos já gerados não mudam."
      action={() => deleteSnippetAction(id)}
      onDone={() => router.refresh()}
    />
  );
}
