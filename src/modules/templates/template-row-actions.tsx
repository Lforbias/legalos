"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { deleteTemplateAction } from "./actions";

export function DeleteTemplateButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      label="Excluir"
      confirmLabel="Excluir modelo"
      description="O modelo deixa de aparecer. Documentos já gerados não são afetados."
      action={() => deleteTemplateAction(id)}
      onDone={() => router.refresh()}
    />
  );
}
