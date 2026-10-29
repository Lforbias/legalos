"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

type Status = "connecting" | "live" | "reconnecting" | "unsupported";

const noSubscribe = () => () => undefined;

/**
 * Atualização ao vivo da caixa: escuta o canal do servidor (SSE) e recarrega a tela quando algo muda.
 * - O canal só avisa "mudou"; os dados vêm da própria página (com as regras de permissão e sigilo de sempre).
 * - `cursor` é a marca do que a página já mostra: o canal parte dela, então nada que tenha entrado entre a montagem da
 *   página e a conexão se perde. A tela só diz "ligada" depois que o servidor confirma ("ready").
 * - Sem atualização forçada enquanto a pessoa está no meio de uma seleção em lote (`data-live-hold="true"`):
 *   aparece um aviso para atualizar quando ela quiser.
 * - Aba escondida não recarrega; ao voltar, atualiza uma vez.
 * - Se o canal cair, reconecta sozinho (a partir da última marca); sem canal, a tela continua funcionando como antes.
 */
export function LiveRefresh({ endpoint = "/api/box/events", cursor }: { endpoint?: string; cursor?: string }) {
  const router = useRouter();
  // O navegador oferece o canal? (no servidor assume que sim, para a primeira pintura bater com a do navegador)
  const supported = useSyncExternalStore(noSubscribe, () => typeof EventSource !== "undefined", () => true);
  const [connection, setConnection] = useState<Status>("connecting");
  const status: Status = supported ? connection : "unsupported";
  const [waiting, setWaiting] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [notices, setNotices] = useState(0); // quantos avisos de mudança já chegaram (diagnóstico)
  const missed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorRef = useRef<string | null>(cursor ?? null);

  const refreshNow = useCallback(() => {
    missed.current = false;
    setWaiting(false);
    router.refresh();
    setUpdatedAt(new Date());
  }, [router]);

  const onChanged = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") { missed.current = true; return; }
    if (document.querySelector('[data-live-hold="true"]')) { setWaiting(true); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refreshNow, 300); // junta várias mudanças seguidas em uma só atualização
  }, [refreshNow]);

  useEffect(() => {
    if (!supported) return;
    let stopped = false;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const remember = (e: Event) => {
      try {
        const c = (JSON.parse((e as MessageEvent<string>).data) as { cursor?: unknown }).cursor;
        if (typeof c === "string") cursorRef.current = c;
      } catch { /* mensagem sem marca: segue com a anterior */ }
    };
    const connect = () => {
      const q = cursorRef.current ? `?cursor=${encodeURIComponent(cursorRef.current)}` : "";
      es = new EventSource(`${endpoint}${q}`);
      es.addEventListener("ready", (e) => { remember(e); setConnection("live"); });
      es.addEventListener("changed", (e) => { remember(e); setNotices((n) => n + 1); onChanged(); });
      es.onerror = () => {
        // O navegador não reconecta sozinho quando o servidor encerra o canal: reconectamos nós, da última marca.
        setConnection("reconnecting");
        es?.close();
        if (!stopped) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    const onVisible = () => { if (document.visibilityState === "visible" && missed.current) onChanged(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      es?.close();
      if (retry) clearTimeout(retry);
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endpoint, onChanged, supported]);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted" data-testid="live-status" data-live-state={status} data-live-notices={notices}>
      <span role="status" aria-live="polite">
        {status === "live" ? "Atualização automática ligada" : status === "connecting" ? "Conectando à atualização automática…" : status === "reconnecting" ? "Reconectando à atualização automática…" : "Atualização automática indisponível neste navegador: recarregue a página para ver novidades."}
        {updatedAt ? ` · atualizada às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
      </span>
      {waiting ? (
        <span className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-bg px-2 py-1 text-warning" data-testid="live-waiting">
          Chegaram novidades. Termine a seleção e atualize quando quiser.
          <button type="button" className="underline" onClick={refreshNow}>Atualizar agora</button>
        </span>
      ) : null}
    </div>
  );
}
