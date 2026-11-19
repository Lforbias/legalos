"use client";

import * as React from "react";
import { launchCountdown, LAUNCH_AT } from "@/lib/launch";

const pad = (n: number) => String(n).padStart(2, "0");

/** Contagem regressiva até o lançamento. O servidor manda os números iniciais; o navegador atualiza a cada segundo. */
export function Countdown({ className, initialNow }: { className?: string; initialNow: number }) {
  const [now, setNow] = React.useState(initialNow);
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const c = launchCountdown(new Date(now), LAUNCH_AT);
  const parts = [
    [String(c.days), c.days === 1 ? "dia" : "dias"],
    [pad(c.hours), "horas"],
    [pad(c.minutes), "min"],
    [pad(c.seconds), "seg"],
  ] as const;
  return (
    <div className={className} role="timer" aria-label={`Faltam ${c.days} dias para o lançamento`} data-testid="launch-countdown">
      {parts.map(([value, label]) => (
        <div key={label} aria-hidden="true"><b>{value}</b>{label}</div>
      ))}
    </div>
  );
}
