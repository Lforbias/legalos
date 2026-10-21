import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { buildAuthUrl, downloadFile, DriveError, ensureFolder, exchangeCode, isConvertible, refreshAccessToken, revokeToken, uploadFile, type FetchFn } from "@/lib/google/drive";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { certKey, openBytes, sealBytes } from "@/lib/security/pfx";
import { getObjectStream } from "@/lib/storage/local-storage";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { requireMfa } from "./certificate.service";
import { addDocumentVersion, loadDocumentChecked } from "./document.service";

/**
 * 3.0-F3b — Google Drive/Docs OPCIONAL e POR ESCRITÓRIO.
 * Nada de chave global: o escritório cadastra o próprio Client ID/Secret (criado no Google Cloud dele), o secret e o token
 * ficam cifrados, o escopo é só `drive.file` e há liga/desliga. Processos sigilosos nunca vão para o Drive.
 */

function requireKey(): Buffer {
  const k = certKey();
  if (!k) throw new ConflictError("O cofre não está configurado neste sistema (falta CERT_ENCRYPTION_KEY).");
  return k;
}

export const redirectUri = () => `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/integrations/google/callback`;
const wrap = (e: unknown): never => {
  if (e instanceof DriveError) throw new ConflictError(e.message);
  throw e;
};

async function load(organizationId: string) {
  return db.googleIntegration.findUnique({ where: { organizationId } });
}
const secretOf = (row: { clientSecretEnc: string }) => openBytes(row.clientSecretEnc, requireKey()).toString("utf8");

// ---------------- configuração (administrador de integrações) ----------------

export async function getDriveSettings(ctx: TenantContext) {
  assertCan(ctx, "integrations:manage");
  const g = await load(ctx.organizationId);
  return { vault: !!certKey(), redirectUri: redirectUri(), hasCredentials: !!g, clientId: g?.clientId ?? "", connected: !!g?.refreshTokenEnc, enabled: !!g?.enabled && !!g?.refreshTokenEnc, folderName: g?.folderName ?? "LegalOS", connectedAt: g?.connectedAt ?? null, lastError: g?.lastError ?? null };
}

export async function saveDriveCredentials(ctx: TenantContext, input: { clientId: string; clientSecret: string; folderName?: string | null }) {
  assertCan(ctx, "integrations:manage");
  const key = requireKey();
  await requireMfa(ctx.userId);
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  const folderName = (input.folderName ?? "").trim() || "LegalOS";
  if (!/^[\w.-]{10,200}$/.test(clientId)) throw new ValidationError("Client ID inválido.", { clientId: ["Cole o Client ID do Google Cloud."] });
  if (clientSecret.length < 8 || clientSecret.length > 200) throw new ValidationError("Client Secret inválido.", { clientSecret: ["Cole o Client Secret do Google Cloud."] });
  if (folderName.length > 80 || /[\\/]/.test(folderName)) throw new ValidationError("Nome de pasta inválido.", { folderName: ["Até 80 caracteres, sem barras."] });
  const existing = await load(ctx.organizationId);
  const changed = !existing || existing.clientId !== clientId;
  const data = { clientId, clientSecretEnc: sealBytes(Buffer.from(clientSecret, "utf8"), key), folderName, lastError: null, ...(changed ? { refreshTokenEnc: null, folderId: null, enabled: false, connectedAt: null, connectedById: null } : {}) };
  await db.googleIntegration.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  await audit({ action: "google.credentials_save", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "google_integration", resourceId: ctx.organizationId, metadata: { reconnectNeeded: changed }, meta: ctx.meta });
}

export async function setDriveEnabled(ctx: TenantContext, enabled: boolean) {
  assertCan(ctx, "integrations:manage");
  const g = await load(ctx.organizationId);
  if (!g) throw new NotFoundError("Cadastre as credenciais do Google primeiro.");
  if (enabled && !g.refreshTokenEnc) throw new ConflictError("Conecte a conta Google antes de ligar.");
  await db.googleIntegration.update({ where: { organizationId: ctx.organizationId }, data: { enabled } });
  await audit({ action: enabled ? "google.enable" : "google.disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "google_integration", resourceId: ctx.organizationId, meta: ctx.meta });
}

/** Desconecta: revoga o token no Google (melhor esforço), apaga o token daqui e desliga. Os arquivos já enviados continuam no Drive. */
export async function disconnectDrive(ctx: TenantContext, f: FetchFn = fetch) {
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const g = await load(ctx.organizationId);
  if (!g) throw new NotFoundError("Integração não cadastrada.");
  if (g.refreshTokenEnc) await revokeToken(openBytes(g.refreshTokenEnc, requireKey()).toString("utf8"), f);
  await db.googleIntegration.update({ where: { organizationId: ctx.organizationId }, data: { refreshTokenEnc: null, enabled: false, folderId: null, connectedAt: null, connectedById: null } });
  await audit({ action: "google.disconnect", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "google_integration", resourceId: ctx.organizationId, meta: ctx.meta });
}

/** Apaga tudo (credenciais e token). Revoga antes, se estiver conectado. */
export async function deleteDriveIntegration(ctx: TenantContext, f: FetchFn = fetch) {
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const g = await load(ctx.organizationId);
  if (!g) throw new NotFoundError("Integração não cadastrada.");
  if (g.refreshTokenEnc) await revokeToken(openBytes(g.refreshTokenEnc, requireKey()).toString("utf8"), f);
  await db.googleIntegration.delete({ where: { organizationId: ctx.organizationId } });
  await audit({ action: "google.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "google_integration", resourceId: ctx.organizationId, meta: ctx.meta });
}

// ---------------- consentimento (OAuth) ----------------

const STATE_TTL_MS = 10 * 60_000;
const sign = (payload: string) => createHmac("sha256", requireKey()).update(`google-state:${payload}`).digest("base64url");

export function makeState(ctx: Pick<TenantContext, "organizationId" | "userId">, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ o: ctx.organizationId, u: ctx.userId, e: now + STATE_TTL_MS, n: randomBytes(8).toString("hex") })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readState(state: string, now = Date.now()): { organizationId: string; userId: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { o: string; u: string; e: number };
    return j.e > now ? { organizationId: j.o, userId: j.u } : null;
  } catch {
    return null;
  }
}

export async function startDriveConnect(ctx: TenantContext): Promise<{ url: string }> {
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const g = await load(ctx.organizationId);
  if (!g) throw new NotFoundError("Cadastre o Client ID e o Client Secret primeiro.");
  return { url: buildAuthUrl({ clientId: g.clientId, redirectUri: redirectUri(), state: makeState(ctx) }) };
}

export async function finishDriveConnect(ctx: TenantContext, input: { state: string; code: string }, f: FetchFn = fetch) {
  assertCan(ctx, "integrations:manage");
  const st = readState(input.state);
  if (!st || st.organizationId !== ctx.organizationId || st.userId !== ctx.userId) throw new ValidationError("Pedido de conexão inválido ou expirado. Tente conectar de novo.");
  const g = await load(ctx.organizationId);
  if (!g) throw new NotFoundError("Cadastre as credenciais primeiro.");
  try {
    const t = await exchangeCode({ clientId: g.clientId, clientSecret: secretOf(g), code: input.code, redirectUri: redirectUri() }, f);
    const folderId = await ensureFolder(t.accessToken, g.folderName, f);
    await db.googleIntegration.update({ where: { organizationId: ctx.organizationId }, data: { refreshTokenEnc: sealBytes(Buffer.from(t.refreshToken, "utf8"), requireKey()), folderId, connectedAt: new Date(), connectedById: ctx.userId, lastError: null } });
  } catch (e) {
    if (e instanceof DriveError) await db.googleIntegration.update({ where: { organizationId: ctx.organizationId }, data: { lastError: e.message.slice(0, 300) } });
    wrap(e);
  }
  await audit({ action: "google.connect", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "google_integration", resourceId: ctx.organizationId, meta: ctx.meta });
}

// ---------------- uso nos documentos ----------------

/** Qualquer membro com acesso a documentos pode saber se o Drive está ligado (sem detalhes). */
export async function driveEnabled(ctx: TenantContext): Promise<boolean> {
  const g = await load(ctx.organizationId);
  return !!g?.enabled && !!g.refreshTokenEnc;
}

async function accessFor(ctx: TenantContext, f: FetchFn) {
  const g = await load(ctx.organizationId);
  if (!g?.enabled || !g.refreshTokenEnc) throw new ConflictError("O Google Drive não está ligado neste escritório.");
  try {
    const access = await refreshAccessToken({ clientId: g.clientId, clientSecret: secretOf(g), refreshToken: openBytes(g.refreshTokenEnc, requireKey()).toString("utf8") }, f);
    return { g, access };
  } catch (e) {
    if (e instanceof DriveError) await db.googleIntegration.update({ where: { organizationId: ctx.organizationId }, data: { lastError: e.message.slice(0, 300) } });
    return wrap(e);
  }
}

async function readStored(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const reader = (await getObjectStream(key)).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function assertSendable(ctx: TenantContext, documentId: string) {
  assertCan(ctx, "documents:write");
  const doc = await loadDocumentChecked(ctx, documentId);
  if (doc.caseId) {
    const c = await db.case.findFirst({ where: { id: doc.caseId, organizationId: ctx.organizationId }, select: { confidential: true } });
    if (c?.confidential) throw new ConflictError("Documentos de processos sigilosos não vão para o Google Drive.");
  }
  return doc;
}

export async function getDocumentDriveLink(ctx: TenantContext, documentId: string) {
  assertCan(ctx, "documents:read");
  await loadDocumentChecked(ctx, documentId);
  return db.documentDriveLink.findFirst({ where: { documentId, organizationId: ctx.organizationId } });
}

/** Envia a versão atual ao Drive do escritório. `asGoogleDoc` converte .docx/.odt/.txt/.html em Documento Google editável. Cada envio cria um arquivo novo; o link guardado é o do mais recente. */
export async function sendDocumentToDrive(ctx: TenantContext, documentId: string, opts: { asGoogleDoc?: boolean } = {}, f: FetchFn = fetch) {
  const doc = await assertSendable(ctx, documentId);
  const { g, access } = await accessFor(ctx, f);
  const convert = !!opts.asGoogleDoc;
  if (convert && !isConvertible(doc.mimeType)) throw new ValidationError("Este tipo de arquivo não pode virar Documento Google (use .docx, .odt, .txt ou .html).");
  const version = await db.documentVersion.findFirst({ where: { documentId: doc.id, organizationId: ctx.organizationId, version: doc.currentVersion } });
  if (!version) throw new NotFoundError("Versão não encontrada.");
  const buffer = await readStored(version.storageKey);
  let sent;
  try {
    const folderId = g.folderId ?? (await ensureFolder(access, g.folderName, f));
    if (!g.folderId) await db.googleIntegration.update({ where: { organizationId: ctx.organizationId }, data: { folderId } });
    sent = await uploadFile(access, { name: version.fileName, mimeType: version.mimeType, parentId: folderId, buffer, convertToDoc: convert }, f);
  } catch (e) {
    return wrap(e);
  }
  await db.$transaction(async (tx) => {
    await tx.documentDriveLink.upsert({
      where: { documentId: doc.id },
      create: { documentId: doc.id, organizationId: ctx.organizationId, driveFileId: sent.id, webViewLink: sent.webViewLink, isGoogleDoc: sent.isGoogleDoc, sentVersion: version.version, sentById: ctx.userId },
      update: { driveFileId: sent.id, webViewLink: sent.webViewLink, isGoogleDoc: sent.isGoogleDoc, sentVersion: version.version, sentAt: new Date(), sentById: ctx.userId, pulledAt: null },
    });
    await audit({ action: "document.drive_send", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: doc.id, metadata: { version: version.version, googleDoc: sent.isGoogleDoc }, meta: ctx.meta }, tx);
  });
  return { link: sent.webViewLink, isGoogleDoc: sent.isGoogleDoc };
}

/** Traz de volta o que foi editado no Drive como NOVA versão do documento (a anterior é preservada). Petições em revisão voltam a rascunho (regra de novas versões). */
export async function pullDocumentFromDrive(ctx: TenantContext, documentId: string, f: FetchFn = fetch) {
  const doc = await assertSendable(ctx, documentId);
  const link = await db.documentDriveLink.findFirst({ where: { documentId: doc.id, organizationId: ctx.organizationId } });
  if (!link) throw new ConflictError("Este documento ainda não foi enviado ao Drive.");
  const { access } = await accessFor(ctx, f);
  let buffer: Buffer;
  try {
    buffer = await downloadFile(access, link.driveFileId, link.isGoogleDoc, f);
  } catch (e) {
    return wrap(e);
  }
  const base = doc.name.replace(/\.[^.]+$/, "");
  const name = link.isGoogleDoc ? `${base}.docx` : doc.name;
  const r = await addDocumentVersion(ctx, doc.id, { name, buffer }, "Trazido do Google Drive");
  await db.documentDriveLink.update({ where: { documentId: doc.id }, data: { pulledAt: new Date() } });
  await audit({ action: "document.drive_pull", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: doc.id, metadata: { version: r.version }, meta: ctx.meta });
  return r;
}

/** Esquece a ligação (o arquivo no Drive não é apagado). */
export async function unlinkDocumentDrive(ctx: TenantContext, documentId: string) {
  const doc = await assertSendable(ctx, documentId).catch(async (e) => {
    if (e instanceof ConflictError) return loadDocumentChecked(ctx, documentId); // sigiloso: permitir desfazer ligação antiga
    throw e;
  });
  const r = await db.documentDriveLink.deleteMany({ where: { documentId: doc.id, organizationId: ctx.organizationId } });
  if (r.count === 0) throw new NotFoundError("Não há ligação com o Drive.");
  await audit({ action: "document.drive_unlink", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: doc.id, meta: ctx.meta });
}
