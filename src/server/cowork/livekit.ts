import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Integração LiveKit (videoconferência das reuniões do Cowork), sem SDK de servidor:
 * - token de acesso = JWT HS256 assinado com a API secret (formato oficial do LiveKit: `video` grants);
 * - API administrativa (Twirp/HTTP) para remover participante e encerrar a sala;
 * - verificação do webhook (JWT no cabeçalho Authorization com o sha256 do corpo).
 *
 * Habilitação exige TODAS as variáveis abaixo. `COWORK_VIDEO_ENABLED=1` é a confirmação do operador de que o
 * servidor (TLS, portas UDP/TURN) foi validado com chamadas reais — sem ela o vídeo continua desligado.
 *   LIVEKIT_URL=wss://video.exemplo.com.br   LIVEKIT_API_KEY=...   LIVEKIT_API_SECRET=...   COWORK_VIDEO_ENABLED=1
 */
export type LiveKitConfig = { url: string; httpUrl: string; apiKey: string; apiSecret: string };

export function liveKitConfig(env: NodeJS.ProcessEnv = process.env): { ok: true; config: LiveKitConfig } | { ok: false; missing: string[] } {
  const url = env.LIVEKIT_URL?.trim() ?? "";
  const apiKey = env.LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = env.LIVEKIT_API_SECRET?.trim() ?? "";
  const missing: string[] = [];
  let parsed: URL | null = null;
  try {
    parsed = url ? new URL(url) : null;
  } catch {
    parsed = null;
  }
  const local = parsed ? ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) : false;
  if (!parsed || !(parsed.protocol === "wss:" || (parsed.protocol === "ws:" && local))) missing.push("LIVEKIT_URL (wss://)");
  if (!apiKey) missing.push("LIVEKIT_API_KEY");
  if (apiSecret.length < 32) missing.push("LIVEKIT_API_SECRET (mín. 32 caracteres)");
  if (env.COWORK_VIDEO_ENABLED !== "1") missing.push("COWORK_VIDEO_ENABLED=1 (confirmação de validação)");
  if (missing.length || !parsed) return { ok: false, missing };
  const httpUrl = `${parsed.protocol === "wss:" ? "https:" : "http:"}//${parsed.host}${parsed.pathname.replace(/\/$/, "")}`;
  return { ok: true, config: { url: `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "")}`, httpUrl, apiKey, apiSecret } };
}

/** Origens a liberar no CSP (connect-src) quando o vídeo está configurado. */
export function liveKitCspOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const c = liveKitConfig(env);
  if (!c.ok) return [];
  const u = new URL(c.config.url);
  return [`${u.protocol}//${u.host}`, `${u.protocol === "wss:" ? "https:" : "http:"}//${u.host}`];
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export type VideoGrant = {
  room?: string;
  roomJoin?: boolean;
  roomAdmin?: boolean;
  roomCreate?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  canPublishSources?: ("camera" | "microphone" | "screen_share" | "screen_share_audio")[];
  canUpdateOwnMetadata?: boolean;
};

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string, secret: string, now = Date.now()): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
    const sec = Math.floor(now / 1000);
    if (typeof payload.exp === "number" && payload.exp < sec - 30) return null;
    if (typeof payload.nbf === "number" && payload.nbf > sec + 30) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Token de acesso de um participante (validade curta: o LiveKit só exige o token na entrada). */
export function accessToken(config: LiveKitConfig, opts: { identity: string; name: string; metadata?: string; grant: VideoGrant; ttlSeconds?: number }, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  return signJwt({ iss: config.apiKey, sub: opts.identity, name: opts.name, metadata: opts.metadata ?? "", nbf: iat - 5, iat, exp: iat + (opts.ttlSeconds ?? 600), video: opts.grant }, config.apiSecret);
}

/** Nome opaco da sala (não expõe título nem processo). */
export const roomName = (organizationId: string, meetingId: string) => `cw_${organizationId.replace(/-/g, "").slice(0, 12)}_${meetingId.replace(/-/g, "")}`;

async function roomService(config: LiveKitConfig, method: "RemoveParticipant" | "DeleteRoom", room: string, body: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  const token = accessToken(config, { identity: "legalos-server", name: "LegalOS", grant: { room, roomAdmin: true, roomCreate: true }, ttlSeconds: 60 });
  const res = await fetcher(`${config.httpUrl}/twirp/livekit.RoomService/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ room, ...body }),
    signal: AbortSignal.timeout(8000),
  });
  // 404 = sala/participante já não existe: para nós é sucesso.
  if (!res.ok && res.status !== 404) throw new Error(`LiveKit ${method} respondeu ${res.status}.`);
}

export const removeParticipant = (config: LiveKitConfig, room: string, identity: string, fetcher?: typeof fetch) => roomService(config, "RemoveParticipant", room, { identity }, fetcher);
export const deleteRoom = (config: LiveKitConfig, room: string, fetcher?: typeof fetch) => roomService(config, "DeleteRoom", room, {}, fetcher);

export type LiveKitWebhookEvent = { event?: string; room?: { name?: string }; participant?: { identity?: string }; id?: string; createdAt?: string | number };

/** Valida o webhook: Authorization = JWT (assinado com a API secret, emitido pela API key) com `sha256` do corpo. */
export function verifyWebhook(config: LiveKitConfig, rawBody: string, authorization: string | null): LiveKitWebhookEvent | null {
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const claims = verifyJwt(token, config.apiSecret);
  if (!claims || claims.iss !== config.apiKey) return null;
  const digest = createHash("sha256").update(rawBody).digest("base64");
  if (typeof claims.sha256 !== "string" || claims.sha256 !== digest) return null;
  try {
    return JSON.parse(rawBody) as LiveKitWebhookEvent;
  } catch {
    return null;
  }
}
