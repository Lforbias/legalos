"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import type { ActionState } from "@/lib/validation/common";

/** Executa uma ação do servidor, mostra o erro em texto e atualiza a tela ao concluir. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const run = <T,>(fn: () => Promise<ActionState<T>>, okMsg?: string, after?: (data: T | undefined) => void) =>
    start(async () => {
      setDone(null);
      const r = await fn();
      if (!r.ok) setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível concluir.");
      else {
        setError(null);
        if (okMsg) setDone(okMsg);
        after?.(r.data);
        router.refresh();
      }
    });
  return { run, pending, error, done };
}
