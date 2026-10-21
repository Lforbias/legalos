"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { setAvailabilityAction } from "./actions";

/** "Disponível" / "Em pausa": em pausa, o atendente não recebe conversas novas da distribuição automática. */
export function AvailabilityButton({ available }: { available: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant={available ? "secondary" : "primary"}
      loading={pending}
      data-testid="wa-availability"
      title={available ? "Você recebe conversas novas. Clique para pausar." : "Você está em pausa. Clique para voltar a receber."}
      onClick={() => start(async () => { await setAvailabilityAction(!available); router.refresh(); })}
    >
      {available ? "Disponível" : "Em pausa"}
    </Button>
  );
}
