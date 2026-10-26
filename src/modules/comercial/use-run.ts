"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import type { ActionState } from "@/lib/validation/common";

export function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const run = <T,>(fn: () => Promise<ActionState<T>>, after?: (data: T | undefined) => void, okMsg?: string) => {
    setError(null);
    setOk(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível concluir.");
      else {
        if (okMsg) setOk(okMsg);
        after?.(r.data);
      }
      router.refresh();
    });
  };
  return { run, pending, error, ok };
}
