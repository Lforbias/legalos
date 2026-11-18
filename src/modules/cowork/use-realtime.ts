"use client";

import * as React from "react";

export type RealtimeEvent = { t: "message" | "message_updated" | "channel" | "membership" | "read" | "meeting" | "resync"; c?: string; s?: number; m?: string };
export type ConnectionState = "connecting" | "live" | "polling" | "offline";

/**
 * Conexão de tempo real do Cowork (SSE) com:
 * - reconexão automática com espera crescente (até 30 s);
 * - modo de contingência por consulta periódica (a cada 15 s) enquanto o tempo real estiver fora;
 * - `resync` em toda (re)conexão: o estado é recuperado pela sequência das mensagens, então nada se perde.
 */
export function useCoworkRealtime(onEvent: (e: RealtimeEvent) => void, onPoll: () => void): ConnectionState {
  const [state, setState] = React.useState<ConnectionState>("connecting");
  const handler = React.useRef(onEvent);
  const poller = React.useRef(onPoll);
  React.useEffect(() => {
    handler.current = onEvent;
    poller.current = onPoll;
  });

  React.useEffect(() => {
    let es: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        if (document.visibilityState === "visible") poller.current();
      }, 15_000);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const connect = () => {
      if (stopped) return;
      if (!navigator.onLine) {
        setState("offline");
        return;
      }
      setState((s) => (s === "live" ? s : "connecting"));
      es = new EventSource("/api/cowork/stream");
      es.addEventListener("cowork", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent<string>).data) as RealtimeEvent;
          if (data.t === "resync") {
            retry = 0;
            setState("live");
            stopPolling();
          }
          handler.current(data);
        } catch {
          /* evento inválido */
        }
      });
      es.onerror = () => {
        // O navegador reconecta sozinho quando consegue; se a conexão foi encerrada (ex.: 401/403/503), reabrimos nós.
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          setState(navigator.onLine ? "polling" : "offline");
          startPolling();
          const delay = Math.min(30_000, 1000 * 2 ** retry++);
          timer = setTimeout(connect, delay);
        } else {
          setState("connecting");
          startPolling();
        }
      };
    };
    const onOnline = () => {
      retry = 0;
      if (timer) clearTimeout(timer);
      es?.close();
      es = null;
      connect();
      poller.current();
    };
    const onOffline = () => setState("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    connect();
    return () => {
      stopped = true;
      es?.close();
      if (timer) clearTimeout(timer);
      stopPolling();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return state;
}
