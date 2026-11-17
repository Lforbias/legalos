import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { GiftCodeBenefitType, GiftCodeRedemptionStatus } from "@prisma/client";
import { LEGALOS_PLANS } from "@/config/pricing";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import type { PlatformCtx } from "./platform.service";
import { assertPlatform } from "./platform.service";
import { audit } from "./audit.service";

const RESERVATION_TTL_MS = 24 * 60 * 60_000;
const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashCode = (code: string) => createHash("sha256").update(normalizeCode(code)).digest("hex");

export type GiftCodePreview = {
  label: string;
  benefitType: "TRIAL_EXTENSION" | "PLAN_ACCESS";
  planName: string | null;
  accessDays: number;
  expiresAt: string | null;
  alreadyReserved: boolean;
};

async function inspectCode(userId: string, rawCode: string) {
  const normalized = normalizeCode(rawCode);
  if (normalized.length < 12 || normalized.length > 40) throw new ValidationError("Código inválido ou indisponível.");
  const code = await db.giftCode.findUnique({ where: { codeHash: hashCode(normalized) }, include: { redemptions: { where: { userId }, take: 1 }, _count: { select: { redemptions: true } } } });
  const now = new Date();
  if (!code || !code.active || code.revokedAt || code.startsAt > now || (code.expiresAt && code.expiresAt <= now)) throw new ValidationError("Código inválido ou indisponível.");
  const activeUses = await db.giftCodeRedemption.count({
    where: { giftCodeId: code.id, status: { in: [GiftCodeRedemptionStatus.APPLIED, GiftCodeRedemptionStatus.RESERVED] }, OR: [{ status: GiftCodeRedemptionStatus.APPLIED }, { reservationExpiresAt: { gt: now } }] },
  });
  if (activeUses >= code.usageLimit) throw new ValidationError("Código inválido ou indisponível.");
  const existing = code.redemptions[0];
  if (existing?.status === GiftCodeRedemptionStatus.APPLIED) throw new ConflictError("Este código já foi resgatado nesta conta.");
  const other = await db.giftCodeRedemption.findFirst({ where: { userId, giftCodeId: { not: code.id }, OR: [{ status: GiftCodeRedemptionStatus.APPLIED }, { status: GiftCodeRedemptionStatus.RESERVED, reservationExpiresAt: { gt: now } }] }, include: { giftCode: { select: { stackable: true } } } });
  if (other && (!code.stackable || !other.giftCode.stackable)) throw new ConflictError("Esta conta já tem outro benefício reservado ou aplicado. Os benefícios destes códigos não são cumulativos.");
  let planName: string | null = null;
  if (code.benefitType === GiftCodeBenefitType.PLAN_ACCESS) {
    const plan = await db.plan.findFirst({ where: { key: code.planKey ?? "", isPublic: true }, select: { name: true } });
    if (!plan) throw new ValidationError("O benefício deste código não está disponível.");
    planName = plan.name;
  }
  return { code, existing, preview: { label: code.label, benefitType: code.benefitType, planName, accessDays: code.accessDays, expiresAt: code.expiresAt?.toISOString() ?? null, alreadyReserved: existing?.status === GiftCodeRedemptionStatus.RESERVED && existing.reservationExpiresAt > now } satisfies GiftCodePreview };
}

export async function previewGiftCode(userId: string, code: string): Promise<GiftCodePreview> {
  return (await inspectCode(userId, code)).preview;
}

export async function reserveGiftCode(userId: string, rawCode: string): Promise<GiftCodePreview> {
  const normalized = normalizeCode(rawCode);
  const inspected = await inspectCode(userId, normalized);
  const now = new Date();
  const redemption = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`gift-user:${userId}`}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`gift-code:${inspected.code.id}`}, 0))`;
    const code = await tx.giftCode.findUnique({ where: { id: inspected.code.id } });
    if (!code || !code.active || code.revokedAt || code.startsAt > now || (code.expiresAt && code.expiresAt <= now)) throw new ValidationError("Código inválido ou indisponível.");
    const activeUses = await tx.giftCodeRedemption.count({ where: { giftCodeId: code.id, OR: [{ status: GiftCodeRedemptionStatus.APPLIED }, { status: GiftCodeRedemptionStatus.RESERVED, reservationExpiresAt: { gt: now } }] } });
    const previous = await tx.giftCodeRedemption.findUnique({ where: { giftCodeId_userId: { giftCodeId: code.id, userId } } });
    if (previous?.status === GiftCodeRedemptionStatus.APPLIED) throw new ConflictError("Este código já foi resgatado nesta conta.");
    if (previous?.status === GiftCodeRedemptionStatus.RESERVED && previous.reservationExpiresAt > now) return { redemption: previous, changed: false };
    if (activeUses >= code.usageLimit) throw new ValidationError("Código inválido ou indisponível.");
    const other = await tx.giftCodeRedemption.findFirst({ where: { userId, giftCodeId: { not: code.id }, OR: [{ status: GiftCodeRedemptionStatus.APPLIED }, { status: GiftCodeRedemptionStatus.RESERVED, reservationExpiresAt: { gt: now } }] }, include: { giftCode: { select: { stackable: true } } } });
    if (other && (!code.stackable || !other.giftCode.stackable)) throw new ConflictError("Esta conta já tem outro benefício reservado ou aplicado. Os benefícios destes códigos não são cumulativos.");
    const data = { status: GiftCodeRedemptionStatus.RESERVED, organizationId: null, reservedAt: now, reservationExpiresAt: new Date(now.getTime() + RESERVATION_TTL_MS), appliedAt: null } as const;
    const row = previous
      ? await tx.giftCodeRedemption.update({ where: { id: previous.id }, data })
      : await tx.giftCodeRedemption.create({ data: { giftCodeId: code.id, userId, ...data } });
    return { redemption: row, changed: true };
  });
  if (redemption.changed) await audit({ action: "gift_code.reserve", userId, resourceType: "gift_code", resourceId: inspected.code.id, metadata: { benefitType: inspected.code.benefitType, accessDays: inspected.code.accessDays }, meta: {} });
  return { ...inspected.preview, alreadyReserved: redemption.redemption.status === GiftCodeRedemptionStatus.RESERVED };
}

export async function releaseGiftCodeReservation(userId: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`gift-user:${userId}`}, 0))`;
    const redemption = await tx.giftCodeRedemption.findFirst({ where: { userId, status: GiftCodeRedemptionStatus.RESERVED, reservationExpiresAt: { gt: new Date() } } });
    if (!redemption) return;
    await tx.giftCodeRedemption.update({ where: { id: redemption.id }, data: { status: GiftCodeRedemptionStatus.REVOKED } });
    await audit({ action: "gift_code.release", userId, resourceType: "gift_code", resourceId: redemption.giftCodeId, meta: {} }, tx);
  });
}

export async function listGiftCodes(pc: PlatformCtx) {
  await assertPlatform(pc);
  const rows = await db.giftCode.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const now = new Date();
  return Promise.all(rows.map(async (row) => ({ id: row.id, prefix: row.codePrefix, label: row.label, benefitType: row.benefitType, planKey: row.planKey, accessDays: row.accessDays, usageLimit: row.usageLimit, redemptions: await db.giftCodeRedemption.count({ where: { giftCodeId: row.id, OR: [{ status: GiftCodeRedemptionStatus.APPLIED }, { status: GiftCodeRedemptionStatus.RESERVED, reservationExpiresAt: { gt: now } }] } }), active: row.active && !row.revokedAt, startsAt: row.startsAt, expiresAt: row.expiresAt })));
}

export async function getReservedGiftCode(userId: string): Promise<GiftCodePreview | null> {
  const now = new Date();
  const redemption = await db.giftCodeRedemption.findFirst({ where: { userId, status: GiftCodeRedemptionStatus.RESERVED, reservationExpiresAt: { gt: now }, giftCode: { active: true, revokedAt: null, startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }, include: { giftCode: true } });
  if (!redemption) return null;
  const planName = redemption.giftCode.planKey ? (await db.plan.findUnique({ where: { key: redemption.giftCode.planKey }, select: { name: true } }))?.name ?? null : null;
  return { label: redemption.giftCode.label, benefitType: redemption.giftCode.benefitType, planName, accessDays: redemption.giftCode.accessDays, expiresAt: redemption.giftCode.expiresAt?.toISOString() ?? null, alreadyReserved: true };
}

export async function createGiftCode(pc: PlatformCtx, input: { label: string; benefitType: "TRIAL_EXTENSION" | "PLAN_ACCESS"; planKey?: string | null; accessDays: number; usageLimit: number; startsAt?: Date | null; expiresAt?: Date | null; stackable: boolean }) {
  await assertPlatform(pc);
  const label = input.label.trim();
  if (label.length < 3 || label.length > 100) throw new ValidationError("Informe um nome de campanha de 3 a 100 caracteres.");
  if (!Number.isInteger(input.accessDays) || input.accessDays < 1 || input.accessDays > 3650) throw new ValidationError("A duração precisa ser de 1 a 3.650 dias.");
  if (!Number.isInteger(input.usageLimit) || input.usageLimit < 1 || input.usageLimit > 100_000) throw new ValidationError("O limite de usos precisa ser de 1 a 100.000.");
  if (input.stackable) throw new ValidationError("A cumulatividade de códigos está desligada nesta etapa.");
  if (input.startsAt && input.expiresAt && input.expiresAt <= input.startsAt) throw new ValidationError("A validade final precisa ser posterior ao início.");
  if (input.benefitType === "PLAN_ACCESS" && !LEGALOS_PLANS.some((plan) => plan.id === input.planKey)) throw new ValidationError("Escolha um plano oficial para o benefício.");
  if (input.benefitType === "TRIAL_EXTENSION" && input.planKey) throw new ValidationError("A extensão de teste não recebe um plano específico.");
  if (input.benefitType === "PLAN_ACCESS") {
    const plan = await db.plan.findFirst({ where: { key: input.planKey!, isPublic: true }, select: { key: true } });
    if (!plan) throw new ConflictError("O plano selecionado ainda não está disponível para benefício.");
  }
  const code = `LOS-${randomBytes(12).toString("hex").toUpperCase()}`;
  const row = await db.giftCode.create({ data: { codeHash: hashCode(code), codePrefix: code.slice(0, 8), label, benefitType: input.benefitType, planKey: input.benefitType === "PLAN_ACCESS" ? input.planKey : null, accessDays: input.accessDays, usageLimit: input.usageLimit, startsAt: input.startsAt ?? new Date(), expiresAt: input.expiresAt ?? null, stackable: input.stackable, createdById: pc.userId } });
  await audit({ action: "gift_code.create", userId: pc.userId, resourceType: "gift_code", resourceId: row.id, metadata: { benefitType: row.benefitType, planKey: row.planKey, accessDays: row.accessDays, usageLimit: row.usageLimit, stackable: row.stackable }, meta: pc.meta });
  return { code, id: row.id };
}

export async function revokeGiftCode(pc: PlatformCtx, id: string) {
  await assertPlatform(pc);
  const code = await db.giftCode.findUnique({ where: { id }, select: { id: true, active: true } });
  if (!code) throw new NotFoundError("Código não encontrado.");
  if (!code.active) return;
  await db.$transaction(async (tx) => {
    await tx.giftCode.update({ where: { id }, data: { active: false, revokedAt: new Date() } });
    await audit({ action: "gift_code.revoke", userId: pc.userId, resourceType: "gift_code", resourceId: id, meta: pc.meta }, tx);
  });
}
