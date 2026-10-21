import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createHmac } from "node:crypto";
import { safeLookup } from "@/lib/mni/transport";

const TIMEOUT_MS = 10_000;
const MAX_BODY_READ = 64 * 1024;
const allowLocal = () => process.env.NODE_ENV === "test" || process.env.MNI_ALLOW_LOCAL_ENDPOINTS === "1";

export class WebhookUrlError extends Error {}

/** Valida o endereço cadastrado: https, nome de domínio público, sem usuário/senha. DNS é revalidado a cada conexão. */
export function assertWebhookUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new WebhookUrlError("Endereço inválido.");
  }
  if (!(u.protocol === "https:" || (allowLocal() && u.protocol === "http:"))) throw new WebhookUrlError("O endereço deve começar com https://.");
  if (u.username || u.password) throw new WebhookUrlError("O endereço não pode conter usuário/senha.");
  if (raw.length > 500) throw new WebhookUrlError("Endereço longo demais.");
  if (!allowLocal()) {
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) throw new WebhookUrlError("Use um nome de domínio público (não IP nem endereço interno).");
  }
  return u;
}

/** Assinatura: HMAC-SHA256 de `${t}.${corpo}`; o receptor deve recusar `t` antigo (anti-replay). */
export function signPayload(secret: string, body: string, t: number): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

export type WebhookPostResult = { ok: boolean; status: number | null; error: string | null };

/** POST JSON sem seguir redirecionamentos, com DNS protegido contra rede interna, TLS verificado e tempo limite. */
export function postWebhook(rawUrl: string, body: string, headers: Record<string, string>): Promise<WebhookPostResult> {
  let url: URL;
  try {
    url = assertWebhookUrl(rawUrl);
  } catch (e) {
    return Promise.resolve({ ok: false, status: null, error: e instanceof Error ? e.message : "Endereço inválido." });
  }
  const isHttps = url.protocol === "https:";
  return new Promise((resolve) => {
    const buf = Buffer.from(body, "utf8");
    const req = (isHttps ? https : http).request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: { ...headers, "content-type": "application/json; charset=utf-8", "content-length": buf.length, "user-agent": "LegalOS-Webhook/1" },
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        ...(isHttps ? { rejectUnauthorized: true } : {}),
      },
      (res) => {
        let read = 0;
        res.on("data", (c: Buffer) => {
          read += c.length;
          if (read > MAX_BODY_READ) res.destroy();
        });
        const done = () => {
          const status = res.statusCode ?? 0;
          resolve(status >= 200 && status < 300 ? { ok: true, status, error: null } : { ok: false, status, error: `O destino respondeu HTTP ${status}.` });
        };
        res.on("end", done);
        res.on("close", done);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ ok: false, status: null, error: e.message === "timeout" ? "O destino demorou mais de 10 s para responder." : /certificate|SSL|TLS|self.signed|unable to verify/i.test(e.message) ? "Falha de TLS/certificado no destino." : /bloqueado/.test(e.message) ? "Endereço interno bloqueado." : "Não foi possível conectar ao destino." }));
    req.end(buf);
  });
}
