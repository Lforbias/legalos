import QRCode from "qrcode";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { sealBytes } from "@/lib/security/pfx";
import { getPhoneInfo, waConfigFromEnv, WhatsappApiError } from "@/lib/whatsapp/client";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { requireMfa } from "./certificate.service";
import { isUniqueViolation } from "./db-errors";
import { requireCertKey } from "./whatsapp-auth";
import { startQrSession, stopQrSession } from "./whatsapp-qr.service";

/**
 * 2.0-F8 — vários números de WhatsApp por escritório.
 * O número PRINCIPAL continua sendo configurado nas telas de sempre. Aqui ficam os números ADICIONAIS: cada conversa nasce
 * no número que a recebeu e é respondida por ele. Modelos aprovados (Meta) são do escritório todo.
 */
export const MAX_NUMBERS = 5;

export type NumberView = { autoStatusEnabled:boolean;reopenAfterMinutes:number;reassignOnReopen:boolean; id: string; label: string; provider: "META" | "QR"; isPrimary: boolean; enabled: boolean; phone: string | null; qrState: string | null; conversations: number; lastMessage: string | null };

export async function listNumbers(ctx: TenantContext): Promise<NumberView[]> {
  assertCan(ctx, "whatsapp:read");
  const rows = await db.whatsappAccount.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: {autoStatusEnabled:true,reopenAfterMinutes:true,reassignOnReopen:true, id: true, label: true, provider: true, isPrimary: true, enabled: true, displayPhone: true, qrPhone: true, qrState: true, lastMessage: true, _count: { select: { conversations: true } } } });
  return rows.map((a) => ({ autoStatusEnabled:a.autoStatusEnabled,reopenAfterMinutes:a.reopenAfterMinutes,reassignOnReopen:a.reassignOnReopen,id: a.id, label: a.label, provider: a.provider === "QR" ? "QR" : "META", isPrimary: a.isPrimary, enabled: a.enabled, phone: a.provider === "QR" ? a.qrPhone : a.displayPhone, qrState: a.provider === "QR" ? a.qrState : null, conversations: a._count.conversations, lastMessage: a.lastMessage }));
}

async function assertRoom(ctx: TenantContext) {
  const primary = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true }, select: { id: true } });
  if (!primary) throw new ConflictError("Conecte primeiro o número principal; depois é possível adicionar outros.");
  const total = await db.whatsappAccount.count({ where: { organizationId: ctx.organizationId } });
  if (total >= MAX_NUMBERS) throw new ConflictError(`O limite é de ${MAX_NUMBERS} números por escritório.`);
}

const cleanLabel = (raw: string) => {
  const label = raw.trim();
  if (!label || label.length > 80) throw new ValidationError("Informe um nome de até 80 caracteres.", { label: ["Nome obrigatório."] });
  return label;
};

/** Adiciona um número da API oficial (Meta). Confere o token na Meta ANTES de gravar. Exige 2FA. */
export async function addMetaNumber(ctx: TenantContext, input: { label: string; phoneNumberId: string; wabaId?: string | null; token: string }) {
  assertCan(ctx, "whatsapp:manage");
  assertCan(ctx, "integrations:manage");
  const key = requireCertKey();
  await requireMfa(ctx.userId);
  await assertRoom(ctx);
  const label = cleanLabel(input.label);
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
  try {
    const acc = await db.whatsappAccount.create({
      data: { organizationId: ctx.organizationId, isPrimary: false, label, provider: "META", phoneNumberId, wabaId, displayPhone, tokenEnc: sealBytes(Buffer.from(token, "utf8"), key), enabled: true, awayEnabled: false, lastStatus: "OK", lastMessage: "Credenciais conferidas na Meta.", lastCheckAt: new Date(), createdById: ctx.userId },
      select: { id: true },
    });
    await audit({ action: "whatsapp.number_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", resourceId: acc.id, metadata: { provider: "META", phoneNumberId }, meta: ctx.meta });
    return { id: acc.id, displayPhone };
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("Este número já está conectado a outro escritório.", { phoneNumberId: ["Este número já está em uso."] });
    throw e;
  }
}

/** Adiciona um número por QR-Code (conexão não oficial). Exige confirmar os riscos e 2FA. */
export async function addQrNumber(ctx: TenantContext, input: { label: string; riskAck: boolean }) {
  assertCan(ctx, "whatsapp:manage");
  assertCan(ctx, "integrations:manage");
  requireCertKey();
  await requireMfa(ctx.userId);
  await assertRoom(ctx);
  if (input.riskAck !== true) throw new ValidationError("Confirme que entendeu os riscos.", { riskAck: ["É preciso confirmar que você entendeu os riscos desta conexão."] });
  const label = cleanLabel(input.label);
  const acc = await db.whatsappAccount.create({ data: { organizationId: ctx.organizationId, isPrimary: false, label, provider: "QR", enabled: true, awayEnabled: false, qrState: "CONNECTING", riskAckAt: new Date(), riskAckById: ctx.userId, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "whatsapp.number_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", resourceId: acc.id, metadata: { provider: "QR" }, meta: ctx.meta });
  await startQrSession(acc.id);
  return { id: acc.id };
}

async function secondary(ctx: TenantContext, id: string) {
  const a = await db.whatsappAccount.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, isPrimary: true, provider: true, enabled: true, qrState: true, qrCode: true, qrPhone: true, lastMessage: true, qrUpdatedAt: true } });
  if (!a) throw new NotFoundError("Número não encontrado.");
  return a;
}

export async function setNumberEnabled(ctx: TenantContext, id: string, enabled: boolean) {
  assertCan(ctx, "whatsapp:manage");
  const a = await secondary(ctx, id);
  await db.whatsappAccount.update({ where: { id }, data: { enabled } });
  if (a.provider === "QR") {
    if (enabled) await startQrSession(id);
    else await stopQrSession(id, { logout: false });
  }
  await audit({ action: enabled ? "whatsapp.number_enable" : "whatsapp.number_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", resourceId: id, meta: ctx.meta });
}

export async function renameNumber(ctx: TenantContext, id: string, label: string) {
  assertCan(ctx, "whatsapp:manage");
  await secondary(ctx, id);
  await db.whatsappAccount.update({ where: { id }, data: { label: cleanLabel(label) } });
}

/** Remove um número adicional e as conversas dele (irreversível). Exige 2FA e a confirmação por escrito do nome. */
export async function removeNumber(ctx: TenantContext, id: string, confirmLabel: string) {
  assertCan(ctx, "whatsapp:manage");
  await requireMfa(ctx.userId);
  const a = await secondary(ctx, id);
  if (a.isPrimary) throw new ConflictError("O número principal é removido na tela de configuração do Chat.");
  const full = await db.whatsappAccount.findUniqueOrThrow({ where: { id }, select: { label: true } });
  if (confirmLabel.trim() !== full.label) throw new ValidationError("Digite o nome do número para confirmar.", { confirm: ["O nome digitado não confere."] });
  if (a.provider === "QR") await stopQrSession(id, { logout: true });
  await db.whatsappAccount.delete({ where: { id } });
  await audit({ action: "whatsapp.number_remove", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", resourceId: id, meta: ctx.meta });
}

export async function numberQrStatus(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const a = await secondary(ctx, id);
  if (a.provider !== "QR") throw new NotFoundError("Este número não usa QR-Code.");
  const qrDataUrl = a.qrState === "QR" && a.qrCode ? await QRCode.toDataURL(a.qrCode, { margin: 1, width: 280, errorCorrectionLevel: "M" }) : null;
  return { state: a.qrState, qrDataUrl, phone: a.qrPhone, message: a.lastMessage, updatedAt: a.qrUpdatedAt };
}

export async function restartNumberQr(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  assertCan(ctx,"integrations:manage");
  const a = await secondary(ctx, id);
  if (a.provider !== "QR") throw new NotFoundError("Este número não usa QR-Code.");
  if (!a.enabled) throw new ConflictError("O número está desligado. Ligue-o antes de gerar o QR-Code.");
  await requireMfa(ctx.userId);
  await db.whatsappCampaign.updateMany({where:{accountId:id,organizationId:ctx.organizationId,status:{in:["APPROVED","SENDING"]}},data:{status:"PAUSED"}});
  await stopQrSession(id, { logout: true });
  await startQrSession(id);
  await audit({action:"whatsapp.qr_repair",organizationId:ctx.organizationId,userId:ctx.userId,resourceType:"whatsapp_account",resourceId:id,meta:ctx.meta});
}
