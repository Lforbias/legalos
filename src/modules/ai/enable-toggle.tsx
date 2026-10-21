"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setAiEnabledAction } from "./actions";

export function EnableToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button
        variant={enabled ? "secondary" : "primary"}
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await setAiEnabledAction(!enabled);
            if (!r.ok) setError(r.message ?? "Não foi possível alterar.");
            else {
              setError(null);
              router.refresh();
            }
          })
        }
      >
        {enabled ? "Desligar IA neste escritório" : "Ligar IA neste escritório"}
      </Button>
    </div>
  );
}
