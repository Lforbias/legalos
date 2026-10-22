import QRCode from "qrcode";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { openBytes, sealBytes } from "@/lib/security/pfx";
import { getQrDriver } from "@/lib/whatsapp/qr";
import { liveSessions } from "@/lib/whatsapp/qr/live";
import type { AuthKv, QrEvent, QrInbound } from "@/lib/whatsapp/qr/types";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { requireMfa } from "./certificate.service";
import { applyStatusUpdate, ingestMessage } from "./whatsapp-ingest.service";
import { requireCertKey } from "./whatsapp-auth";
import { qrMessageId } from "./whatsapp-transport";

const MAX_BACKOFF_MS = 60_000;
const CRED = "creds";

/** Estado de autenticação da sessão no banco, cifrado com a chave do cofre. */
function dbKv(accountId: string): AuthKv {
  const key = requireCertKey();
  const seal = (v: string) => sealBytes(Buffer.from(v, "utf8"), key);
  return {
    async get(k) {
      const r = await db.whatsappQrAuth.findUnique({ where: { accountId_key: { accountId, key: k } }, select: { valueEnc: true } });
      return r ? openBytes(r.valueEnc, key).toString("utf8") : null;
    },
    async set(entries) {
      await db.$transaction(
        entries.map(([k, v]) =>
          v === null
            ? db.whatsappQrAuth.deleteMany({ where: { accountId, key: k } })
            : db.whatsappQrAuth.upsert({ where: { accountId_key: { accountId, key: k } }, create: { accountId, key: k, valueEnc: seal(v) }, update: { valueEnc: seal(v), updatedAt: new Date() } }),
        ),
      );
    },
    async clear() {
      await db.whatsappQrAuth.deleteMany({ where: { accountId } });
    },
  };
}

const setState = (accountId: string, data: Record<string, unknown>) => db.whatsappAccount.updateMany({ where: { id: accountId, provider: "QR" }, data: { qrUpdatedAt: new Date(), ...data } });

async function toIngest(accountId: string, msg: QrInbound) {
  const acc = await db.whatsappAccount.findUnique({ where: { id: accountId }, select: { id: true, organizationId: true, awayEnabled: true, awayMessage: true, openFrom: true, openUntil: true, openDays: true, provider: true, enabled: true } });
  if (!acc || acc.provider !== "QR" || !acc.enabled) return;
  const media = msg.media;
  await ingestMessage(acc, {
    waMessageId: qrMessageId(accountId, msg.id), waId: msg.chat, contactName: msg.name, type: media ? media.kind : "text", text: msg.text, timestamp: msg.timestamp, fromMe: msg.fromMe,
    media: media ? { mime: media.mime, filename: media.filename, fetch: async () => ({ buffer: await media.download(), mime: media.mime ?? "application/octet-stream" }) } : null,
  });
}

async function handleEvent(accountId: string, live: NonNullable<ReturnType<typeof liveSessions.get>>, e: QrEvent): Promise<void> {
  if (live.stopped) return;
  if (e.type === "qr") {
    await setState(accountId, { qrState: "QR", qrCode: e.qr, lastMessage: "Aguardando a leitura do QR-Code." });
  } else if (e.type === "open") {
    live.attempts = 0;
    await setState(accountId, { qrState: "CONNECTED", qrCode: null, qrPhone: e.phone, displayPhone: e.phone, lastStatus: "OK", lastMessage: "Conectado por QR-Code (conexão não oficial).", lastCheckAt: new Date() });
  } else if (e.type === "close") {
    live.session?.close();
    live.session = null;
    if (e.loggedOut) {
      live.stopped = true;
      liveSessions.delete(accountId);
      await dbKv(accountId).clear();
      await setState(accountId, { qrState: "DISCONNECTED", qrCode: null, lastStatus: "ERROR", lastMessage: "O WhatsApp foi desconectado (a sessão saiu do aparelho). Leia o QR-Code novamente." });
    } else {
      await scheduleReconnect(accountId, live, e.reason);
    }
  } else if (e.type === "message") {
    // Em fila por conta: mantém a ordem das mensagens.
    live.events = live.events.then(() => toIngest(accountId, e.msg)).catch((err) => logger.error("whatsapp.qr_ingest_failed", { error: err instanceof Error ? err.message : String(err) }));
  } else if (e.type === "status") {
    const acc = await db.whatsappAccount.findUnique({ where: { id: accountId }, select: { organizationId: true } });
    if (acc) await applyStatusUpdate(acc.organizationId, qrMessageId(accountId, e.id), e.status, null);
  }
}

type LiveEntry = NonNullable<ReturnType<typeof liveSessions.get>>;

async function scheduleReconnect(accountId: string, live: LiveEntry, reason: string) {
  if (live.stopped) return;
  live.attempts++;
  const delay = Math.min(MAX_BACKOFF_MS, 2000 * 2 ** Math.min(live.attempts - 1, 10));
  await setState(accountId, { qrState: "CONNECTING", qrCode: null, lastStatus: live.attempts >= 5 ? "ERROR" : "OK", lastMessage: `Reconectando (${reason}), tentativa ${live.attempts}…` });
  live.timer = setTimeout(() => void connectOnce(accountId, live), delay);
}

async function connectOnce(accountId: string, live: LiveEntry): Promise<void> {
  if (live.stopped) return;
  const acc = await db.whatsappAccount.findUnique({ where: { id: accountId }, select: { provider: true, enabled: true } });
  if (!acc || acc.provider !== "QR" || !acc.enabled) {
    liveSessions.delete(accountId);
    return;
  }
  try {
    await setState(accountId, { qrState: "CONNECTING" });
    const driver = await getQrDriver();
    const session = await driver.connect({ accountId, kv: dbKv(accountId), onEvent: (e) => void handleEvent(accountId, live, e).catch((err) => logger.error("whatsapp.qr_event_failed", { error: err instanceof Error ? err.message : String(err) })) });
    if (live.stopped) {
      session.close();
      return;
    }
    live.session = session;
  } catch (e) {
    logger.error("whatsapp.qr_connect_failed", { error: e instanceof Error ? e.message : String(e) });
    await scheduleReconnect(accountId, live, "falha ao conectar");
  }
}

/** Liga a sessão deste número NESTE processo. Sem credenciais salvas, gera um QR-Code para leitura. */
export async function startQrSession(accountId: string): Promise<void> {
  const cur = liveSessions.get(accountId);
  if (cur && !cur.stopped) return;
  const live: LiveEntry = { session: null, stopped: false, attempts: 0, timer: null, chain: Promise.resolve(), events: Promise.resolve(), lastSendAt: 0 };
  liveSessions.set(accountId, live);
  await connectOnce(accountId, live);
}

export async function stopQrSession(accountId: string, opts: { logout: boolean }): Promise<void> {
  const live = liveSessions.get(accountId);
  if (live) {
    live.stopped = true;
    if (live.timer) clearTimeout(live.timer);
    if (opts.logout) await live.session?.logout().catch(() => undefined);
    live.session?.close();
    live.session = null;
    liveSessions.delete(accountId);
  }
  if (opts.logout) await dbKv(accountId).clear();
  await setState(accountId, { qrState: "DISCONNECTED", qrCode: null });
}

/** Ao subir o servidor: religa as sessões que já tinham sido pareadas (as que nunca foram lidas não geram QR sozinhas). */
export async function resumeQrSessions(): Promise<number> {
  const rows = await db.whatsappAccount.findMany({ where: { provider: "QR", enabled: true, qrAuth: { some: { key: CRED } } }, select: { id: true } });
  let n = 0;
  for (const r of rows) {
    await startQrSession(r.id).catch((e) => logger.error("whatsapp.qr_resume_failed", { error: e instanceof Error ? e.message : String(e) }));
    n++;
    await new Promise((res) => setTimeout(res, 1500));
  }
  return n;
}

// ---------------- ações do escritório ----------------

export async function connectQr(ctx: TenantContext, input: { label: string; riskAck: boolean }) {
  assertCan(ctx, "whatsapp:manage");
  assertCan(ctx, "integrations:manage");
  requireCertKey();
  await requireMfa(ctx.userId);
  if (input.riskAck !== true) throw new ValidationError("Confirme que entendeu os riscos.", { riskAck: ["É preciso confirmar que você entendeu os riscos desta conexão."] });
  const label = input.label.trim();
  if (!label || label.length > 80) throw new ValidationError("Informe um nome de até 80 caracteres.", { label: ["Nome obrigatório."] });
  const existing = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true }, select: { id: true, provider: true } });
  if (existing) await stopQrSession(existing.id, { logout: false });
  const data = { label, provider: "QR", phoneNumberId: null, tokenEnc: null, wabaId: null, enabled: true, qrState: "CONNECTING", qrCode: null, riskAckAt: new Date(), riskAckById: ctx.userId, lastStatus: null, lastMessage: null };
  const acc = existing
    ? await db.whatsappAccount.update({ where: { id: existing.id }, data, select: { id: true } })
    : await db.whatsappAccount.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "whatsapp.qr_connect", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", resourceId: acc.id, metadata: { previous: existing?.provider ?? null }, meta: ctx.meta });
  await startQrSession(acc.id);
  return { id: acc.id };
}

export type QrStatus = { state: string; qrDataUrl: string | null; phone: string | null; message: string | null; updatedAt: Date | null };

export async function getQrStatus(ctx: TenantContext): Promise<QrStatus> {
  assertCan(ctx, "whatsapp:manage");
  const a = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true }, select: { provider: true, qrState: true, qrCode: true, qrPhone: true, lastMessage: true, qrUpdatedAt: true } });
  if (!a || a.provider !== "QR") throw new NotFoundError("A conexão por QR-Code não está configurada.");
  const qrDataUrl = a.qrState === "QR" && a.qrCode ? await QRCode.toDataURL(a.qrCode, { margin: 1, width: 280, errorCorrectionLevel: "M" }) : null;
  return { state: a.qrState, qrDataUrl, phone: a.qrPhone, message: a.lastMessage, updatedAt: a.qrUpdatedAt };
}

/** Sai da sessão (o aparelho perde o vínculo) e apaga as chaves. Conversas e mensagens ficam. Para voltar, é preciso ler um QR-Code novo. */
export async function disconnectQr(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  const a = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true }, select: { id: true, provider: true } });
  if (!a || a.provider !== "QR") throw new NotFoundError("A conexão por QR-Code não está configurada.");
  await stopQrSession(a.id, { logout: true });
  await audit({ action: "whatsapp.qr_disconnect", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", resourceId: a.id, meta: ctx.meta });
}

/** Gera um QR-Code novo (descarta a sessão anterior). */
export async function restartQr(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  const a = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true }, select: { id: true, provider: true, enabled: true } });
  if (!a || a.provider !== "QR") throw new NotFoundError("A conexão por QR-Code não está configurada.");
  if (!a.enabled) throw new ConflictError("O atendimento está desligado. Ligue-o antes de gerar o QR-Code.");
  await stopQrSession(a.id, { logout: true });
  await startQrSession(a.id);
}
