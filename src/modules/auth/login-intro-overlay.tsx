"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { consumeLoginIntro, firstName, greetingFor } from "./login-intro";

/** Duração total (montagem do logo + saudação + saída). A camada nunca bloqueia cliques. */
const INTRO_MS = 1500;

// Estado global mínimo: o carimbo é lido uma única vez por carregamento do painel.
let active: boolean | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  if (active === null) {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // consome sempre (mesmo com movimento reduzido) para não tocar depois, fora de hora
    active = consumeLoginIntro() && !reduced;
  }
  return active;
}

function finish() {
  // volta a "não lido": o próximo getSnapshot relê o armazenamento (já vazio) e um novo login funciona sem recarregar
  active = null;
  listeners.forEach((l) => l());
}

/** No servidor nunca há animação: ela só existe no navegador, logo após o login. */
const getServerSnapshot = () => false;

export function LoginIntro({ name }: { name: string }) {
  const show = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  React.useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(finish, INTRO_MS);
    return () => window.clearTimeout(t);
  }, [show]);
  if (!show) return null;
  const who = firstName(name);
  // portal no <body>: nenhum contêiner do painel (com transform/overflow) consegue recortar a camada
  return createPortal(
    <div className="login-intro" aria-hidden data-testid="login-intro">
      <div className="login-intro-stack">
        <svg className="login-intro-logo" viewBox="0 0 88 88">
          <rect className="li-p li-p1" x="0" y="0" width="40" height="40" rx="12" />
          <rect className="li-p li-p2" x="0" y="48" width="40" height="40" rx="12" />
          <rect className="li-p li-p3" x="48" y="48" width="40" height="40" rx="12" />
          <circle className="li-p li-p4" cx="68" cy="20" r="15" />
        </svg>
        <p className="login-intro-hello">
          {greetingFor(new Date().getHours())}
          {who ? `, ${who}` : ""}
        </p>
        <p className="login-intro-sub">Tudo pronto no seu escritório.</p>
      </div>
    </div>,
    document.body,
  );
}
