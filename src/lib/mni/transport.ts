import dns from "node:dns";
import https from "node:https";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";
import { MniError } from "./xml";

const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 60_000;
const allowLocal = () => process.env.NODE_ENV === "test" || process.env.MNI_ALLOW_LOCAL_ENDPOINTS === "1";

/** IP privado/loopback/link-local/metadata: o endpoint do tribunal NUNCA pode apontar para rede interna (SSRF). */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l.startsWith("::ffff:")) return isPrivateAddress(l.slice(7));
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb");
  }
  return true;
}

/** Valida a URL cadastrada (formato). A resolução de DNS é revalidada no momento da conexão. */
export function assertEndpointUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new MniError("Endereço do serviço inválido.");
  }
  const okProto = u.protocol === "https:" || (allowLocal() && u.protocol === "http:");
  if (!okProto) throw new MniError("O endereço do serviço deve começar com https://.");
  if (u.username || u.password) throw new MniError("O endereço não pode conter usuário/senha.");
  if (!allowLocal()) {
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) throw new MniError("Use o nome de domínio do tribunal (não IP nem endereço interno).");
  }
  return u;
}

export const safeLookup: net.LookupFunction = (hostname, options, cb) => {
  dns.lookup(hostname, options as dns.LookupOptions, (err, address, family) => {
    if (err) return cb(err, address as never, family as never);
    const list = Array.isArray(address) ? address : [{ address: address as string, family: family as number }];
    if (!allowLocal() && list.some((a) => isPrivateAddress(a.address))) return cb(new Error("endereço interno bloqueado") as NodeJS.ErrnoException, "", 4);
    cb(null, address as never, family as never);
  });
};

function extraCas(): string[] | undefined {
  const file = process.env.MNI_EXTRA_CA_FILE?.trim();
  if (!file) return undefined;
  try {
    return [...tls.rootCertificates, fs.readFileSync(file, "utf8")];
  } catch {
    throw new MniError("Não foi possível ler o arquivo de autoridades certificadoras extras (MNI_EXTRA_CA_FILE).");
  }
}

export type Mtls = { pfx: Buffer; passphrase: string };

/** POST SOAP. Certificado A1 (mTLS) opcional. Verificação TLS sempre ligada; nada do conteúdo é registrado em log. */
export function postSoap(endpoint: string, xml: string, mtls?: Mtls): Promise<string> {
  const url = assertEndpointUrl(endpoint);
  const isHttps = url.protocol === "https:";
  return new Promise((resolve, reject) => {
    const body = Buffer.from(xml, "utf8");
    const opts: https.RequestOptions = {
      method: "POST",
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: { "content-type": "text/xml; charset=UTF-8", "content-length": body.length, soapaction: '""', accept: "text/xml, application/xml" },
      lookup: safeLookup,
      timeout: TIMEOUT_MS,
      ...(isHttps ? { rejectUnauthorized: true, ca: extraCas(), ...(mtls ? { pfx: mtls.pfx, passphrase: mtls.passphrase } : {}) } : {}),
    };
    const req = (isHttps ? https : http).request(opts, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy();
          return reject(new MniError("Resposta do tribunal grande demais."));
        }
        chunks.push(c);
      });
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode ?? 0;
        // SOAP Fault chega como HTTP 500 com corpo XML: deixamos o parser mostrar a mensagem
        if (status >= 200 && status < 300) return resolve(text);
        if (status === 500 && text.includes("Fault")) return resolve(text);
        if (status === 401 || status === 403) return reject(new MniError("O tribunal recusou o acesso (credenciais ou certificado)."));
        reject(new MniError(`O tribunal respondeu com erro HTTP ${status}.`));
      });
    });
    req.on("timeout", () => req.destroy(new MniError("O tribunal demorou demais para responder.")));
    req.on("error", (e) => reject(e instanceof MniError ? e : new MniError(/certificate|SSL|TLS|self.signed|unable to verify/i.test(e.message) ? "Falha de TLS/certificado ao falar com o tribunal (veja MNI_EXTRA_CA_FILE para cadeias ICP-Brasil)." : "Não foi possível falar com o tribunal.")));
    req.end(body);
  });
}
