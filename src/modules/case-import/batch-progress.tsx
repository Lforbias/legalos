"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { processBatchStepAction } from "./actions";

/** Chama o servidor em passos curtos até acabar. Se a página for fechada, o botão "Continuar" retoma de onde parou. */
export function BatchProgress({ batchId, pending, autoStart }: { batchId: string; pending: number; autoStart: boolean }) {
  const router = useRouter();
  const [running, setRunning] = React.useState(false);
  const [left, setLeft] = React.useState(pending);
  const [error, setError] = React.useState<string | null>(null);
  const started = React.useRef(false);

  const run = React.useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      for (let guard = 0; guard < 400; guard++) {
        const res = await processBatchStepAction(batchId);
        if (!res.ok) {
          setError(res.message ?? "Não foi possível continuar.");
          break;
        }
        setLeft(res.data!.remaining);
        router.refresh();
        if (res.data!.remaining === 0) break;
      }
    } finally {
      setRunning(false);
    }
  }, [batchId, router]);

  React.useEffect(() => {
    if (autoStart && pending > 0 && !started.current) {
      started.current = true;
      void run();
    }
  }, [autoStart, pending, run]);

  if (left === 0 && !running) return <Alert tone="success">Tudo processado.</Alert>;
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <p className="text-sm" role="status" data-testid="batch-status">{running ? `Processando… faltam ${left} item(ns).` : `Faltam ${left} item(ns) a consultar.`}</p>
      {!running ? <Button size="sm" onClick={() => void run()}>Continuar</Button> : null}
    </div>
  );
}
