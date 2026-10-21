import type { QrDriver, QrEvent, QrSession } from "./types";

/**
 * Driver FALSO, só para testes (integração e E2E). Não fala com o WhatsApp. Ativado por `WHATSAPP_QR_FAKE=1` (o `check:prod` recusa isso em produção).
 * Controle: `fakeQr.sessions` guarda as sessões; `emit(accountId, evento)` injeta eventos como se viessem do WhatsApp.
 */
type Sent = { chat: string; kind: "text" | "media"; body: string | null; filename?: string };
type FakeState = { handlers: Map<string, (e: QrEvent) => void>; sent: Sent[]; sessions: number; autoOpen: boolean; failSend: string | null; counter: number };
const g = globalThis as unknown as { __fakeQr?: FakeState };
const initial: FakeState = { handlers: new Map(), sent: [], sessions: 0, autoOpen: false, failSend: null, counter: 0 };
const st: FakeState = (g.__fakeQr ??= initial);

export const fakeQr = {
  state: st,
  emit(accountId: string, e: QrEvent) {
    st.handlers.get(accountId)?.(e);
  },
  reset() {
    st.handlers.clear();
    st.sent.length = 0;
    st.sessions = 0;
    st.failSend = null;
    st.autoOpen = false;
  },
};

export const fakeDriver: QrDriver = {
  async connect({ accountId, kv, onEvent }) {
    st.sessions++;
    let closed = false;
    st.handlers.set(accountId, (e) => {
      if (!closed) onEvent(e);
    });
    const hasCreds = !!(await kv.get("creds"));
    setTimeout(() => {
      if (closed) return;
      if (hasCreds) onEvent({ type: "open", phone: "5571999990000" });
      else {
        onEvent({ type: "qr", qr: `FAKE-QR-${accountId}-${Date.now()}` });
        if (st.autoOpen || process.env.WHATSAPP_QR_FAKE === "1") {
          setTimeout(async () => {
            if (closed) return;
            await kv.set([["creds", JSON.stringify({ paired: true })]]);
            onEvent({ type: "open", phone: "5571999990000" });
          }, Number(process.env.WHATSAPP_QR_FAKE_SCAN_MS ?? 3000));
        }
      }
    }, 10);
    const send = async (chat: string, body: string | null, kind: "text" | "media", filename?: string) => {
      if (st.failSend) throw new Error(st.failSend);
      st.sent.push({ chat, kind, body, filename });
      return `FAKE${++st.counter}`;
    };
    const session: QrSession = {
      sendText: (chat, body) => send(chat, body, "text"),
      sendMedia: (chat, m) => send(chat, m.caption, "media", m.filename),
      async logout() {
        closed = true;
        await kv.clear();
      },
      close() {
        closed = true;
      },
    };
    return session;
  },
};
