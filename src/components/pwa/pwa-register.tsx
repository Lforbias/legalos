"use client";

import * as React from "react";

/** Registra o service worker (somente em produção e em contexto seguro). Sem interface. */
export function PwaRegister() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* sem service worker o app continua funcionando normalmente */
    });
  }, []);
  return null;
}
