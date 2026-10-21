import type { QrSession } from "./types";

/** Sessões de QR-Code vivas NESTE processo (um app só deve rodar por vez, senão o WhatsApp derruba uma das conexões). */
type Live = { session: QrSession | null; stopped: boolean; attempts: number; timer: ReturnType<typeof setTimeout> | null; chain: Promise<unknown>; events: Promise<unknown>; lastSendAt: number };
const g = globalThis as unknown as { __waQrLive?: Map<string, Live> };
export const liveSessions: Map<string, Live> = (g.__waQrLive ??= new Map<string, Live>());

const gapMs = () => Math.max(0, Number(process.env.WHATSAPP_QR_MIN_GAP_MS ?? 1500));

/** Envios de um número saem em fila, com intervalo mínimo entre eles (reduz o risco de bloqueio por comportamento de robô). */
export function enqueueSend<T>(accountId: string, fn: (s: QrSession) => Promise<T>): Promise<T> {
  const live = liveSessions.get(accountId);
  if (!live?.session) return Promise.reject(new Error("O WhatsApp não está conectado. Leia o QR-Code em Atendimento → Configurações."));
  const run = async () => {
    const wait = live.lastSendAt + gapMs() - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const s = live.session;
    if (!s) throw new Error("O WhatsApp não está conectado. Leia o QR-Code em Atendimento → Configurações.");
    try {
      return await fn(s);
    } finally {
      live.lastSendAt = Date.now();
    }
  };
  const p = live.chain.then(run, run);
  live.chain = p.catch(() => undefined);
  return p;
}
