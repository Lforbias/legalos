import http from "node:http";
import type { AddressInfo } from "node:net";
import { signBody } from "@/lib/whatsapp/signature";

/** Servidor que IMITA a Graph API da Meta (WhatsApp Cloud API) — só para testes. Não prova compatibilidade com a Meta real. */
export type FakeReq = { method: string; path: string; body: Record<string, unknown> | null; auth: string | undefined; rawLength: number };
export const WA_TOKEN = "token-de-teste-whatsapp-0123456789";
export const APP_SECRET = "segredo-do-app-de-teste";

export function startFakeWhatsapp() {
  let n = 0;
  const run = Math.random().toString(36).slice(2, 8);
  const requests: FakeReq[] = [];
  const media = new Map<string, { mime: string; data: Buffer }>();
  const state = { failNext: null as null | { match: RegExp; status: number; message: string; code?: number }, templates: [] as { name: string; language: string; status: string; category: string; components: { type: string; text?: string }[] }[] };
  let base = "";

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(req.url ?? "/", "http://x");
      const isJson = (req.headers["content-type"] ?? "").includes("json");
      const body = isJson && raw.length ? (JSON.parse(raw.toString("utf8")) as Record<string, unknown>) : null;
      requests.push({ method: req.method ?? "", path: url.pathname + url.search, body, auth: req.headers.authorization, rawLength: raw.length });
      const send = (status: number, json: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
      if (req.headers.authorization !== `Bearer ${WA_TOKEN}`) return send(401, { error: { message: "Invalid OAuth access token.", code: 190 } });
      if (state.failNext && state.failNext.match.test(`${req.method} ${url.pathname}`)) {
        const f = state.failNext;
        state.failNext = null;
        return send(f.status, { error: { message: f.message, code: f.code ?? 100 } });
      }
      let m: RegExpMatchArray | null;
      if ((m = url.pathname.match(/^\/dl\/([^/]+)$/))) {
        const f = media.get(m[1]!);
        if (!f) return send(404, { error: { message: "not found" } });
        res.writeHead(200, { "content-type": f.mime });
        return res.end(f.data);
      }
      if (req.method === "POST" && (m = url.pathname.match(/^\/v[\d.]+\/(\d+)\/messages$/))) {
        return send(200, { messaging_product: "whatsapp", contacts: [{ wa_id: String(body?.to ?? "") }], messages: [{ id: `wamid.OUT${run}${++n}` }] });
      }
      if (req.method === "POST" && url.pathname.match(/^\/v[\d.]+\/(\d+)\/media$/)) return send(200, { id: `media_up_${++n}` });
      if (req.method === "GET" && (m = url.pathname.match(/^\/v[\d.]+\/(\d+)\/message_templates$/))) return send(200, { data: state.templates });
      if (req.method === "GET" && (m = url.pathname.match(/^\/v[\d.]+\/([^/]+)$/))) {
        if (media.has(m[1]!)) return send(200, { url: `${base}/dl/${m[1]}`, mime_type: media.get(m[1]!)!.mime, file_size: media.get(m[1]!)!.data.length });
        return send(200, { display_phone_number: "+55 71 99999-0000", verified_name: "Escritório Teste", id: m[1] });
      }
      return send(404, { error: { message: "rota desconhecida", code: 100 } });
    });
  });

  return {
    requests,
    state,
    addMedia(id: string, mime: string, data: Buffer) { media.set(id, { mime, data }); },
    async start(port = 0): Promise<string> {
      await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      return base;
    },
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}

type InMsg = { id: string; from: string; name?: string; text?: string; timestamp?: number; media?: { type: "image" | "document" | "audio"; id: string; mime: string; filename?: string; caption?: string } };

/** Corpo de webhook no formato da Meta + cabeçalho de assinatura válido. */
export function inbound(phoneNumberId: string, m: InMsg) {
  const msg: Record<string, unknown> = { id: m.id, from: m.from, timestamp: String(m.timestamp ?? Math.floor(Date.now() / 1000)) };
  if (m.media) {
    msg.type = m.media.type;
    msg[m.media.type] = { id: m.media.id, mime_type: m.media.mime, ...(m.media.filename ? { filename: m.media.filename } : {}), ...(m.media.caption ? { caption: m.media.caption } : {}) };
  } else {
    msg.type = "text";
    msg.text = { body: m.text ?? "" };
  }
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "5571999990000", phone_number_id: phoneNumberId }, contacts: [{ profile: { name: m.name ?? "Contato" }, wa_id: m.from }], messages: [msg] } }] }],
  });
  return { body, signature: signBody(body, APP_SECRET) };
}

export function statusEvent(phoneNumberId: string, s: { id: string; status: "sent" | "delivered" | "read" | "failed"; recipient: string; errorTitle?: string }) {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId }, statuses: [{ id: s.id, status: s.status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: s.recipient, ...(s.errorTitle ? { errors: [{ code: 131047, title: s.errorTitle }] } : {}) }] } }] }],
  });
  return { body, signature: signBody(body, APP_SECRET) };
}
