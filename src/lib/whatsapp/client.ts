import dns from "node:dns/promises";
import net from "node:net";
import { isPrivateAddress } from "@/lib/mni/transport";

/**
 * Cliente mínimo da WhatsApp Cloud API (Graph API da Meta). Sem estado. O token NUNCA vai para log nem para mensagens de erro.
 * Escrito a partir da documentação pública e testado contra um servidor SIMULADO: a primeira conexão real deve ser feita
 * com o número de teste da Meta antes de ligar o número do escritório.
 */
export class WhatsappApiError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly retryable = false, readonly code: number | null = null) {
    super(message);
    this.name = "WhatsappApiError";
  }
}

export type WaConfig = { baseUrl: string; version: string };

export function waConfigFromEnv(env: Record<string, string | undefined> = process.env): WaConfig {
  const override = env.WHATSAPP_API_URL?.trim();
  return { baseUrl: (override || "https://graph.facebook.com").replace(/\/$/, ""), version: env.WHATSAPP_API_VERSION?.trim() || "v21.0" };
}

export type WaAuth = { phoneNumberId: string; token: string };

async function call<T>(cfg: WaConfig, token: string, method: string, path: string, body?: unknown | FormData): Promise<T> {
  let res: Response;
  try {
    const isForm = body instanceof FormData;
    res = await fetch(`${cfg.baseUrl}/${cfg.version}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "user-agent": "LegalOS/1.0", ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
  } catch {
    throw new WhatsappApiError("Não foi possível falar com a Meta (rede ou tempo esgotado). Tente novamente em instantes.", null, true);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* corpo não-JSON */
  }
  if (!res.ok) {
    const err = json && typeof json === "object" && "error" in json ? ((json as { error?: { message?: string; code?: number } }).error ?? {}) : {};
    const code = typeof err.code === "number" ? err.code : null;
    const msg = typeof err.message === "string" ? err.message.slice(0, 300) : `HTTP ${res.status}`;
    const authProblem = res.status === 401 || code === 190;
    throw new WhatsappApiError(authProblem ? "A Meta recusou o token de acesso (inválido ou expirado)." : `A Meta recusou a operação: ${msg}`, res.status, res.status >= 500 || res.status === 429, code);
  }
  return json as T;
}

export type PhoneInfo = { displayPhone: string | null; verifiedName: string | null };
export async function getPhoneInfo(cfg: WaConfig, a: WaAuth): Promise<PhoneInfo> {
  const r = await call<{ display_phone_number?: string; verified_name?: string }>(cfg, a.token, "GET", `/${encodeURIComponent(a.phoneNumberId)}?fields=display_phone_number,verified_name`);
  return { displayPhone: r.display_phone_number ?? null, verifiedName: r.verified_name ?? null };
}

function firstMessageId(r: { messages?: { id?: string }[] }): string {
  const id = r.messages?.[0]?.id;
  if (!id) throw new WhatsappApiError("A Meta não devolveu o identificador da mensagem.");
  return id;
}

export async function sendText(cfg: WaConfig, a: WaAuth, to: string, body: string): Promise<string> {
  return firstMessageId(await call(cfg, a.token, "POST", `/${a.phoneNumberId}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body, preview_url: false } }));
}

export async function sendInteractive(cfg: WaConfig,a:WaAuth,to:string,interactive:unknown):Promise<string> {
  return firstMessageId(await call(cfg,a.token,"POST",`/${a.phoneNumberId}/messages`,{messaging_product:"whatsapp",recipient_type:"individual",to,type:"interactive",interactive}));
}
export async function createMessageTemplate(cfg:WaConfig,token:string,wabaId:string,input:{name:string;language:string;category:string;body:string}) {
  return call<{id:string;status?:string;category?:string}>(cfg,token,"POST",`/${encodeURIComponent(wabaId)}/message_templates`,{name:input.name,language:input.language,category:input.category,components:[{type:"BODY",text:input.body}]});
}

export async function uploadMedia(cfg: WaConfig, a: WaAuth, file: { buffer: Buffer; mime: string; name: string }): Promise<string> {
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", file.mime);
  form.set("file", new Blob([new Uint8Array(file.buffer)], { type: file.mime }), file.name);
  const r = await call<{ id?: string }>(cfg, a.token, "POST", `/${a.phoneNumberId}/media`, form);
  if (!r.id) throw new WhatsappApiError("A Meta não aceitou o arquivo.");
  return r.id;
}

export type OutKind = "image" | "document" | "audio" | "video";
export async function sendMedia(cfg: WaConfig, a: WaAuth, to: string, m: { kind: OutKind; mediaId: string; caption?: string | null; filename?: string | null }): Promise<string> {
  const payload: Record<string, unknown> = { id: m.mediaId };
  if (m.caption && (m.kind === "image" || m.kind === "document" || m.kind === "video")) payload.caption = m.caption;
  if (m.kind === "document" && m.filename) payload.filename = m.filename;
  return firstMessageId(await call(cfg, a.token, "POST", `/${a.phoneNumberId}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to, type: m.kind, [m.kind]: payload }));
}

export async function sendTemplate(cfg: WaConfig, a: WaAuth, to: string, t: { name: string; language: string; params: string[] }): Promise<string> {
  const components = t.params.length ? [{ type: "body", parameters: t.params.map((text) => ({ type: "text", text })) }] : undefined;
  return firstMessageId(await call(cfg, a.token, "POST", `/${a.phoneNumberId}/messages`, { messaging_product: "whatsapp", to, type: "template", template: { name: t.name, language: { code: t.language }, ...(components ? { components } : {}) } }));
}

/** Marca como lida no WhatsApp do cliente (os dois tiques azuis). Melhor esforço. */
export async function markAsRead(cfg: WaConfig, a: WaAuth, waMessageId: string): Promise<void> {
  await call(cfg, a.token, "POST", `/${a.phoneNumberId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: waMessageId });
}

export type RemoteTemplate = { name: string; language: string; category: string | null; status: string; body: string; variableCount: number };
export async function listTemplates(cfg: WaConfig, token: string, wabaId: string): Promise<RemoteTemplate[]> {
  const out: RemoteTemplate[] = [];
  let path: string | null = `/${encodeURIComponent(wabaId)}/message_templates?fields=name,language,status,category,components&limit=100`;
  for (let page = 0; page < 10 && path; page++) {
    const r: { data?: { name: string; language: string; status: string; category?: string; components?: { type: string; text?: string }[] }[]; paging?: { next?: string } } = await call(cfg, token, "GET", path);
    for (const t of r.data ?? []) {
      const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
      out.push({ name: t.name, language: t.language, category: t.category ?? null, status: t.status, body, variableCount: new Set(body.match(/\{\{\d+\}\}/g) ?? []).size });
    }
    const next = r.paging?.next;
    path = next ? next.replace(/^https?:\/\/[^/]+\/v[0-9.]+/, "") : null;
  }
  return out;
}

/** Endereço de mídia devolvido pela Meta: só https, nunca IP interno (defesa contra SSRF). */
async function assertMediaUrl(raw: string, cfg: WaConfig): Promise<URL> {
  const u = new URL(raw);
  const local = process.env.NODE_ENV === "test" || process.env.WHATSAPP_ALLOW_LOCAL === "1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) throw new WhatsappApiError("Endereço de mídia inválido.");
  if (u.username || u.password) throw new WhatsappApiError("Endereço de mídia inválido.");
  if (!local) {
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) || host === "localhost") throw new WhatsappApiError("Endereço de mídia inválido.");
    const addrs = await dns.lookup(host, { all: true });
    if (addrs.some((x) => isPrivateAddress(x.address))) throw new WhatsappApiError("Endereço de mídia bloqueado.");
  }
  void cfg;
  return u;
}

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export async function downloadMedia(cfg: WaConfig, token: string, mediaId: string): Promise<{ buffer: Buffer; mime: string }> {
  const meta = await call<{ url?: string; mime_type?: string; file_size?: number }>(cfg, token, "GET", `/${encodeURIComponent(mediaId)}`);
  if (!meta.url) throw new WhatsappApiError("A Meta não devolveu o endereço da mídia.");
  if (typeof meta.file_size === "number" && meta.file_size > MAX_MEDIA_BYTES) throw new WhatsappApiError("Arquivo recebido grande demais (limite de 16 MB).");
  const url = await assertMediaUrl(meta.url, cfg);
  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${token}`, "user-agent": "LegalOS/1.0" }, signal: AbortSignal.timeout(30_000), redirect: "error" });
  } catch {
    throw new WhatsappApiError("Não foi possível baixar a mídia (rede ou tempo esgotado).", null, true);
  }
  if (!res.ok) throw new WhatsappApiError(`Falha ao baixar a mídia (HTTP ${res.status}).`, res.status, res.status >= 500);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_MEDIA_BYTES) throw new WhatsappApiError("Arquivo recebido grande demais (limite de 16 MB).");
  return { buffer: buf, mime: meta.mime_type ?? res.headers.get("content-type") ?? "application/octet-stream" };
}
