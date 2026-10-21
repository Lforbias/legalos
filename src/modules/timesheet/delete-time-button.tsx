"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { deleteTimeAction } from "./actions";

export function DeleteTimeButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label="Excluir lançamento"
      loading={pending}
      onClick={() =>
        start(async () => {
          await deleteTimeAction(id);
          router.refresh();
        })
      }
    >
      Excluir
    </Button>
  );
}
