"use client";

import * as React from "react";

const EVENT = "lo-storage-change";

/** Lê/escreve uma preferência por-visualizador no localStorage (com fallback seguro se indisponível). */
export function useLocalStorageValue(key: string, fallback: string): [string, (v: string) => void] {
  const subscribe = React.useCallback((cb: () => void) => {
    window.addEventListener(EVENT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVENT, cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const getSnapshot = React.useCallback(() => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const value = React.useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  const set = React.useCallback(
    (v: string) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        /* armazenamento indisponível: preferência vale só até recarregar */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
