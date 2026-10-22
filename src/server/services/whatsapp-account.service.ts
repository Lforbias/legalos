import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { certKey, sealBytes } from "@/lib/security/pfx";
import { getPhoneInfo, listTemplates, waConfigFromEnv, WhatsappApiError } from "@/lib/whatsapp/client";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { requireMfa } from "./certificate.service";
import { loadAuth, requireCertKey } from "./whatsapp-auth";
import { startQrSession, stopQrSession } from "./whatsapp-qr.service";

import { isUniqueViolation } from "./db-errors";

export { loadAuth };

export function whatsappKeyAvailable(): boolean {
  return certKey() !== null;
}
export function webhookConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.WHATSAPP_APP_SECRET?.trim() && (env.WHATSAPP_VERIFY_TOKEN?.trim().length ?? 0) >= 16;
}

const requireKey = requireCertKey;

export type AccountView = {
  id: string; label: string; provider: "META" | "QR"; qrState: string; qrPhone: string | null; riskAckAt: Date | null;
  phoneNumberId: string | null; wabaId: string | null; displayPhone: string | null; enabled: boolean;
  awayEnabled: boolean; awayMessage: string | null; openFrom: string; openUntil: string; openDays: number[];
  lastStatus: string | null; lastMessage: string | null; lastCheckAt: Date | null;
};

export async function getAccount(ctx: TenantContext): Promise<AccountView | null> {
  assertCan(ctx, "whatsapp:read");
  const a = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true } });
  if (!a) return null;
  return { id: a.id, label: a.label, provider: a.provider === "QR" ? "QR" : "META", qrState: a.qrState, qrPhone: a.qrPhone, riskAckAt: a.riskAckAt, phoneNumberId: a.phoneNumberId, wabaId: a.wabaId, displayPhone: a.displayPhone, enabled: a.enabled, awayEnabled: a.awayEnabled, awayMessage: a.awayMessage, openFrom: a.openFrom, openUntil: a.openUntil, openDays: a.openDays, lastStatus: a.lastStatus, lastMessage: a.lastMessage, lastCheckAt: a.lastCheckAt };
}

export type ConnectInput = { label: string; phoneNumberId: string; wabaId?: string | null; token: string };

/** Conecta (ou troca as credenciais de) o número do escritório. Confere o token na Meta ANTES de gravar. Exige 2FA. */
export async function connectAccount(ctx: TenantContext, input: ConnectInput) {
  assertCan(ctx, "whatsapp:manage");
  assertCan(ctx, "integrations:manage");
  const key = requireKey();
  await requireMfa(ctx.userId);
  const label = input.label.trim();
  if (!label || label.length > 80) throw new ValidationError("Informe um nome de até 80 caracteres.", { label: ["Nome obrigatório."] });
  const phoneNumberId = input.phoneNumberId.trim();
  if (!/^\d{5,25}$/.test(phoneNumberId)) throw new ValidationError("ID do número inválido.", { phoneNumberId: ["Use só os dígitos do “ID do número de telefone” do painel da Meta."] });
  const wabaId = input.wabaId?.trim() || null;
  if (wabaId && !/^\d{5,25}$/.test(wabaId)) throw new ValidationError("ID da conta do WhatsApp Business inválido.", { wabaId: ["Use só os dígitos."] });
  const token = input.token.trim();
  if (token.length < 20 || token.length > 1000 || /\s/.test(token)) throw new ValidationError("Token inválido.", { token: ["Cole o token de acesso permanente, sem espaços."] });

  let displayPhone: string | null;
  try {
    displayPhone = (await getPhoneInfo(waConfigFromEnv(), { phoneNumberId, token })).displayPhone;
  } catch (e) {
    if (e instanceof WhatsappApiError) throw new ValidationError(`Não foi possível validar na Meta: ${e.message}`, { token: [e.message] });
    throw e;
  }
  const existing = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true }, select: { id: true, provider: true } });
  if (existing?.provider === "QR") await stopQrSession(existing.id, { logout: true });
  const data = { label, provider: "META", qrState: "DISCONNECTED", qrCode: null, qrPhone: null, riskAckAt: null, riskAckById: null, phoneNumberId, wabaId, displayPhone, tokenEnc: sealBytes(Buffer.from(token, "utf8"), key), enabled: true, lastStatus: "OK", lastMessage: "Credenciais conferidas na Meta.", lastCheckAt: new Date() };
  try {
    const acc = existing
      ? await db.whatsappAccount.update({ where: { id: existing.id }, data, select: { id: true } })
      : await db.whatsappAccount.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId }, select: { id: true } });
    await audit({ action: existing ? "whatsapp.account_update" : "whatsapp.account_connect", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", resourceId: acc.id, metadata: { phoneNumberId }, meta: ctx.meta });
    return { id: acc.id, displayPhone };
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("Este número já está conectado a outro escritório.", { phoneNumberId: ["Este número já está em uso."] });
    throw e;
  }
}

export async function setAccountEnabled(ctx: TenantContext, enabled: boolean) {
  assertCan(ctx, "whatsapp:manage");
  const acc = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true }, select: { id: true, provider: true } });
  if (!acc) throw new NotFoundError("O WhatsApp não está conectado.");
  await db.whatsappAccount.update({ where: { id: acc.id }, data: { enabled } });
  if (acc.provider === "QR") {
    if (enabled) await startQrSession(acc.id);
    else await stopQrSession(acc.id, { logout: false });
  }
  await audit({ action: enabled ? "whatsapp.account_enable" : "whatsapp.account_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", meta: ctx.meta });
}

/** Remove o número, o token e TODAS as conversas (irreversível). Exige 2FA. */
export async function removeAccount(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  await requireMfa(ctx.userId);
  const acc = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true }, select: { id: true, provider: true } });
  if (!acc) throw new NotFoundError("O WhatsApp não está conectado.");
  if (acc.provider === "QR") await stopQrSession(acc.id, { logout: true });
  await db.whatsappAccount.delete({ where: { id: acc.id } });
  await audit({ action: "whatsapp.account_remove", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", meta: ctx.meta });
}

export type SettingsInput = { awayEnabled: boolean; awayMessage?: string | null; openFrom: string; openUntil: string; openDays: number[] };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updateSettings(ctx: TenantContext, i: SettingsInput) {
  assertCan(ctx, "whatsapp:manage");
  if (!HHMM.test(i.openFrom) || !HHMM.test(i.openUntil)) throw new ValidationError("Horário inválido.", { openFrom: ["Use o formato HH:MM."] });
  const days = [...new Set(i.openDays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  const msg = i.awayMessage?.replace(/\r\n/g, "\n").trim() || null;
  if (msg && msg.length > 1000) throw new ValidationError("Mensagem longa demais.", { awayMessage: ["Máximo de 1000 caracteres."] });
  if (i.awayEnabled && !msg) throw new ValidationError("Escreva a mensagem de ausência.", { awayMessage: ["Informe a mensagem."] });
  const r = await db.whatsappAccount.updateMany({ where: { organizationId: ctx.organizationId, isPrimary: true }, data: { awayEnabled: i.awayEnabled, awayMessage: msg, openFrom: i.openFrom, openUntil: i.openUntil, openDays: days } });
  if (r.count !== 1) throw new NotFoundError("O WhatsApp não está conectado.");
  await audit({ action: "whatsapp.settings_update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", meta: ctx.meta });
}

// ---- respostas rápidas ----
export type QuickReplyInput = { shortcut: string; title: string; body: string };
const SHORTCUT = /^[a-z0-9][a-z0-9-]{0,29}$/;

function cleanQuick(i: QuickReplyInput) {
  const shortcut = i.shortcut.trim().toLowerCase().replace(/^\//, "");
  if (!SHORTCUT.test(shortcut)) throw new ValidationError("Atalho inválido.", { shortcut: ["Use letras minúsculas, números e hífens (ex.: boas-vindas), até 30 caracteres."] });
  const title = i.title.trim();
  if (title.length < 2 || title.length > 80) throw new ValidationError("Título inválido.", { title: ["Informe de 2 a 80 caracteres."] });
  const body = i.body.replace(/\r\n/g, "\n").trim();
  if (!body || body.length > 4096) throw new ValidationError("Texto inválido.", { body: ["Escreva o texto (até 4096 caracteres)."] });
  return { shortcut, title, body };
}

export async function listQuickReplies(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:read");
  return db.whatsappQuickReply.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { shortcut: "asc" }, take: 300, select: { id: true, shortcut: true, title: true, body: true } });
}

export async function saveQuickReply(ctx: TenantContext, id: string | null, raw: QuickReplyInput) {
  assertCan(ctx, "whatsapp:manage");
  const d = cleanQuick(raw);
  try {
    if (id) {
      const r = await db.whatsappQuickReply.updateMany({ where: { id, organizationId: ctx.organizationId }, data: d });
      if (r.count !== 1) throw new NotFoundError("Resposta rápida não encontrada.");
    } else {
      await db.whatsappQuickReply.create({ data: { ...d, organizationId: ctx.organizationId, createdById: ctx.userId } });
    }
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("Já existe uma resposta com este atalho.", { shortcut: ["Já existe uma resposta com este atalho."] });
    throw e;
  }
  await audit({ action: id ? "whatsapp.quick_reply_update" : "whatsapp.quick_reply_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_quick_reply", resourceId: id ?? undefined, meta: ctx.meta });
}

export async function deleteQuickReply(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappQuickReply.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Resposta rápida não encontrada.");
  await audit({ action: "whatsapp.quick_reply_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_quick_reply", resourceId: id, meta: ctx.meta });
}

// ---- modelos aprovados ----
export async function listTemplatesLocal(ctx: TenantContext, onlyApproved = true) {
  assertCan(ctx, "whatsapp:read");
  return db.whatsappTemplate.findMany({ where: { organizationId: ctx.organizationId, ...(onlyApproved ? { status: "APPROVED" } : {}) }, orderBy: [{ name: "asc" }, { language: "asc" }], take: 300 });
}

/** Busca os modelos da conta na Meta e substitui a lista local. Só o que está APROVADO pode ser enviado. */
export async function syncTemplates(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  const acc = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true }, select: { provider: true } });
  if (acc?.provider === "QR") throw new ConflictError("Modelos de mensagem existem só na conexão oficial da Meta.");
  const { account, auth, cfg } = await loadAuth(ctx.organizationId);
  if (!account.wabaId) throw new ConflictError("Informe o ID da conta do WhatsApp Business (WABA) ao conectar para sincronizar modelos.");
  let remote;
  try {
    remote = await listTemplates(cfg, auth.token, account.wabaId);
  } catch (e) {
    if (e instanceof WhatsappApiError) throw new ConflictError(e.message);
    throw e;
  }
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.whatsappTemplate.deleteMany({ where: { organizationId: ctx.organizationId } });
    if (remote.length) await tx.whatsappTemplate.createMany({ data: remote.map((t) => ({ organizationId: ctx.organizationId, name: t.name, language: t.language, category: t.category, status: t.status, body: t.body, variableCount: t.variableCount, syncedAt: now })) });
  });
  await audit({ action: "whatsapp.templates_sync", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", metadata: { count: remote.length }, meta: ctx.meta });
  return { total: remote.length, approved: remote.filter((t) => t.status === "APPROVED").length };
}

export function canManage(ctx: TenantContext) {
  return can(ctx, "whatsapp:manage");
}
