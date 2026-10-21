/**
 * 3.0-F3b — cliente mínimo do Google Drive/Docs (OAuth 2 + Drive v3), SEM chave global:
 * cada escritório usa o próprio Client ID/Secret. Escopo único: `drive.file` (o app só enxerga o que ele mesmo criou).
 * Todas as chamadas recebem `fetch` injetável para testes; em produção usam o `fetch` global.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
export const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
/** Tipos que o Google converte em Documento editável ao enviar. */
export const CONVERTIBLE_MIMES = new Set([DOCX_MIME, "application/msword", "application/vnd.oasis.opendocument.text", "text/plain", "text/html", "application/rtf"]);
export const isConvertible = (mime: string) => CONVERTIBLE_MIMES.has(mime.split(";")[0]!.trim().toLowerCase());
export const MAX_DRIVE_BYTES = 25 * 1024 * 1024;

export type FetchFn = typeof fetch;
export class DriveError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({ client_id: p.clientId, redirect_uri: p.redirectUri, response_type: "code", scope: DRIVE_SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "false", state: p.state });
  return `${AUTH_URL}?${q.toString()}`;
}

async function tokenCall(body: Record<string, string>, f: FetchFn) {
  let res: Response;
  try {
    res = await f(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
  } catch {
    throw new DriveError("Não foi possível falar com o Google. Tente de novo em instantes.");
  }
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const why = json.error === "invalid_client" ? "O Client ID ou o Client Secret foram recusados pelo Google." : json.error === "invalid_grant" ? "A autorização expirou ou foi revogada. Conecte de novo." : (json.error_description ?? json.error ?? `Falha ${res.status}`);
    throw new DriveError(why, res.status);
  }
  return json as { access_token: string; refresh_token?: string; scope?: string };
}

export async function exchangeCode(p: { clientId: string; clientSecret: string; code: string; redirectUri: string }, f: FetchFn = fetch) {
  const t = await tokenCall({ code: p.code, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: p.redirectUri, grant_type: "authorization_code" }, f);
  if (!t.refresh_token) throw new DriveError("O Google não devolveu a autorização permanente. Remova o acesso do app na conta Google e conecte de novo.");
  if (t.scope && !t.scope.split(" ").includes(DRIVE_SCOPE)) throw new DriveError("O consentimento não incluiu o acesso ao Drive (drive.file).");
  return { refreshToken: t.refresh_token, accessToken: t.access_token };
}

export async function refreshAccessToken(p: { clientId: string; clientSecret: string; refreshToken: string }, f: FetchFn = fetch): Promise<string> {
  return (await tokenCall({ client_id: p.clientId, client_secret: p.clientSecret, refresh_token: p.refreshToken, grant_type: "refresh_token" }, f)).access_token;
}

export async function revokeToken(token: string, f: FetchFn = fetch): Promise<void> {
  await f(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() }).catch(() => undefined);
}

async function api(f: FetchFn, accessToken: string, url: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await f(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new DriveError("Não foi possível falar com o Google. Tente de novo em instantes.");
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = res.status === 401 ? "O Google recusou a autorização. Conecte de novo." : res.status === 403 ? "O Google negou o acesso (verifique se a API do Drive está ativada no projeto)." : res.status === 404 ? "Arquivo não encontrado no Drive (foi apagado ou não é mais acessível ao app)." : (j.error?.message ?? `Falha ${res.status} no Google Drive.`);
    throw new DriveError(msg, res.status);
  }
  return res;
}

const escapeQ = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Acha (entre as pastas que o app criou) ou cria a pasta do escritório. */
export async function ensureFolder(accessToken: string, name: string, f: FetchFn = fetch): Promise<string> {
  const q = `name='${escapeQ(name)}' and mimeType='${GOOGLE_FOLDER_MIME}' and trashed=false`;
  const found = (await (await api(f, accessToken, `${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&spaces=drive`)).json()) as { files?: { id: string }[] };
  if (found.files?.[0]) return found.files[0].id;
  const made = (await (await api(f, accessToken, `${API}/files?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: GOOGLE_FOLDER_MIME }) })).json()) as { id: string };
  return made.id;
}

export async function uploadFile(accessToken: string, p: { name: string; mimeType: string; parentId: string; buffer: Buffer; convertToDoc: boolean }, f: FetchFn = fetch): Promise<{ id: string; webViewLink: string; isGoogleDoc: boolean }> {
  if (p.buffer.length > MAX_DRIVE_BYTES) throw new DriveError("Arquivo grande demais para enviar ao Drive (máximo de 25 MB).");
  const boundary = `legalos-${Math.random().toString(36).slice(2)}`;
  const meta = { name: p.name, parents: [p.parentId], ...(p.convertToDoc ? { mimeType: GOOGLE_DOC_MIME } : {}) };
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${p.mimeType}\r\n\r\n`);
  const body = Buffer.concat([head, p.buffer, Buffer.from(`\r\n--${boundary}--`)]);
  const res = await api(f, accessToken, `${UPLOAD}/files?uploadType=multipart&fields=id,webViewLink,mimeType`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  const j = (await res.json()) as { id: string; webViewLink?: string; mimeType?: string };
  return { id: j.id, webViewLink: j.webViewLink ?? `https://drive.google.com/file/d/${j.id}/view`, isGoogleDoc: j.mimeType === GOOGLE_DOC_MIME };
}

/** Baixa o conteúdo: Documento Google → exporta como .docx; outros arquivos → conteúdo original. */
export async function downloadFile(accessToken: string, fileId: string, isGoogleDoc: boolean, f: FetchFn = fetch): Promise<Buffer> {
  const url = isGoogleDoc ? `${API}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(DOCX_MIME)}` : `${API}/files/${encodeURIComponent(fileId)}?alt=media`;
  const buf = Buffer.from(await (await api(f, accessToken, url)).arrayBuffer());
  if (buf.length > MAX_DRIVE_BYTES) throw new DriveError("O arquivo no Drive é grande demais para trazer (máximo de 25 MB).");
  return buf;
}
