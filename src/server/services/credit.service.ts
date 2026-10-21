import { Prisma } from "@prisma/client";
import { CREDIT_ACTIONS, CREDIT_EXPIRY_WARN_DAYS, MAX_GRANT, type CreditAction } from "@/lib/credits";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { isUniqueViolation } from "./db-errors";
import { notify } from "./notification.service";
import { assertPlatform, type PlatformCtx } from "./platform.service";

/**
 * 3.0-F10 — créditos e custos. Nasce DESLIGADO por escritório (quem não liga não é afetado).
 * Quem liga e concede créditos é a plataforma; o escritório vê saldo, extrato e define o aviso de saldo baixo.
 * Consumo: do lote que vence primeiro. Cada fato (ex.: protocolo de uma petição) cobra no máximo uma vez.
 */

const DAY = 86_400_000;
const notExpired = (now: Date): Prisma.CreditGrantWhereInput => ({ remaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

export async function creditBalance(organizationId: string, now = new Date()): Promise<number> {
  const r = await db.creditGrant.aggregate({ where: { organizationId, ...notExpired(now) }, _sum: { remaining: true } });
  return r._sum.remaining ?? 0;
}

async function isEnabled(organizationId: string) {
  const o = await db.organization.findUnique({ where: { id: organizationId }, select: { creditsEnabled: true } });
  return !!o?.creditsEnabled;
}

/** Recusa a ação ANTES de executá-la quando o escritório usa créditos e o saldo não cobre. */
export async function assertCredits(organizationId: string, action: CreditAction) {
  if (!(await isEnabled(organizationId))) return;
  const { cost, label } = CREDIT_ACTIONS[action];
  const balance = await creditBalance(organizationId);
  if (balance < cost) throw new ConflictError(`Créditos insuficientes para "${label}": custa ${cost} e o saldo é ${balance}. Peça mais créditos ao administrador do sistema.`);
}

export type ChargeResult = { charged: boolean; reason?: "disabled" | "duplicate" | "insufficient" };

/** Cobra a ação já realizada. Idempotente por (ação, refType, refId). Nunca lança: a ação já aconteceu. */
export async function chargeCredits(organizationId: string, action: CreditAction, ref: { type: string; id: string; userId?: string | null }): Promise<ChargeResult> {
  try {
    if (!(await isEnabled(organizationId))) return { charged: false, reason: "disabled" };
    const { cost } = CREDIT_ACTIONS[action];
    const now = new Date();
    const result = await db.$transaction(async (tx) => {
      const grants = await tx.$queryRaw<{ id: string; remaining: number }[]>(
        Prisma.sql`SELECT id, remaining FROM credit_grants WHERE organization_id = ${organizationId}::uuid AND remaining > 0 AND (expires_at IS NULL OR expires_at > ${now}) ORDER BY expires_at ASC NULLS LAST, created_at ASC FOR UPDATE`,
      );
      if (grants.reduce((s, g) => s + g.remaining, 0) < cost) return "insufficient" as const;
      await tx.creditUsage.create({ data: { organizationId, action, cost, refType: ref.type, refId: ref.id, userId: ref.userId ?? null } });
      let left = cost;
      for (const g of grants) {
        if (left <= 0) break;
        const take = Math.min(g.remaining, left);
        await tx.creditGrant.update({ where: { id: g.id }, data: { remaining: { decrement: take } } });
        left -= take;
      }
      return "ok" as const;
    });
    if (result === "insufficient") {
      logger.error("credits.charge_insufficient", { organizationId, action, refId: ref.id });
      await notifyBillingAdmins(organizationId, "CREDITS_LOW", "Créditos insuficientes", `Uma ação (${CREDIT_ACTIONS[action].label}) foi concluída sem saldo para cobrar. Regularize os créditos.`, `credits-short:${organizationId}:${ref.id}`);
      return { charged: false, reason: "insufficient" };
    }
    await runCreditsCheck(organizationId).catch(() => 0);
    return { charged: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { charged: false, reason: "duplicate" };
    logger.error("credits.charge_failed", { organizationId, action, error: err instanceof Error ? err.message : String(err) });
    return { charged: false, reason: "insufficient" };
  }
}

async function notifyBillingAdmins(organizationId: string, kind: string, title: string, body: string, dedupeKey: string) {
  const admins = await db.membership.findMany({ where: { organizationId, status: "ACTIVE", role: { permissions: { has: "billing:manage" } } }, select: { userId: true } });
  return notify(admins.map((a) => ({ organizationId, userId: a.userId, kind, title, body, link: "/configuracoes/creditos", dedupeKey })));
}

/** Avisa saldo baixo (uma vez por lote de créditos) e lotes que vencem em até 7 dias. Idempotente. */
export async function runCreditsCheck(organizationId?: string, now = new Date()): Promise<number> {
  const orgs = await db.organization.findMany({ where: { creditsEnabled: true, deletedAt: null, ...(organizationId ? { id: organizationId } : {}) }, select: { id: true, creditsLowThreshold: true } });
  let created = 0;
  for (const o of orgs) {
    if (o.creditsLowThreshold > 0) {
      const balance = await creditBalance(o.id, now);
      if (balance <= o.creditsLowThreshold) {
        const last = await db.creditGrant.findFirst({ where: { organizationId: o.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
        created += await notifyBillingAdmins(o.id, "CREDITS_LOW", `Saldo de créditos baixo: ${balance}`, `O saldo chegou ao limite de aviso (${o.creditsLowThreshold}). Peça mais créditos para não travar os protocolos.`, `credits-low:${o.id}:${last?.id ?? "none"}`);
      }
    }
    const soon = await db.creditGrant.findMany({ where: { organizationId: o.id, remaining: { gt: 0 }, expiresAt: { gt: now, lte: new Date(now.getTime() + CREDIT_EXPIRY_WARN_DAYS * DAY) } }, select: { id: true, remaining: true, expiresAt: true } });
    for (const g of soon) {
      const d = Math.max(1, Math.ceil((g.expiresAt!.getTime() - now.getTime()) / DAY));
      created += await notifyBillingAdmins(o.id, "CREDITS_EXPIRING", `${g.remaining} crédito(s) vencem em ${d} dia(s)`, "Créditos não usados até a validade são perdidos.", `credits-exp:${g.id}`);
    }
  }
  return created;
}

// ---------------- visão do escritório ----------------

export async function getCreditsOverview(ctx: TenantContext) {
  assertCan(ctx, "billing:manage");
  const now = new Date();
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { creditsEnabled: true, creditsLowThreshold: true } });
  const [balance, grants, usage] = await Promise.all([
    creditBalance(ctx.organizationId, now),
    db.creditGrant.findMany({ where: { organizationId: ctx.organizationId, ...notExpired(now) }, orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], select: { id: true, amount: true, remaining: true, expiresAt: true, note: true, createdAt: true } }),
    db.creditUsage.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, cost: true, refType: true, refId: true, createdAt: true } }),
  ]);
  return { enabled: org.creditsEnabled, lowThreshold: org.creditsLowThreshold, balance, grants, usage, costs: Object.entries(CREDIT_ACTIONS).map(([key, v]) => ({ key, label: v.label, cost: v.cost })) };
}

export async function setLowThreshold(ctx: TenantContext, value: number) {
  assertCan(ctx, "billing:manage");
  if (!Number.isInteger(value) || value < 0 || value > MAX_GRANT) throw new ValidationError("Informe um número inteiro de créditos (0 desliga o aviso).", { threshold: ["Valor inválido."] });
  await db.organization.update({ where: { id: ctx.organizationId }, data: { creditsLowThreshold: value } });
  await audit({ action: "credits.threshold", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, metadata: { value }, meta: ctx.meta });
  await runCreditsCheck(ctx.organizationId).catch(() => 0);
}

// ---------------- visão da plataforma ----------------

export async function setOrganizationCreditsEnabled(pc: PlatformCtx, orgId: string, enabled: boolean) {
  await assertPlatform(pc);
  const r = await db.organization.updateMany({ where: { id: orgId, deletedAt: null }, data: { creditsEnabled: enabled } });
  if (r.count === 0) throw new NotFoundError("Escritório não encontrado.");
  await audit({ action: "platform.credits_toggle", organizationId: orgId, userId: pc.userId, resourceType: "organization", resourceId: orgId, metadata: { enabled }, meta: pc.meta });
}

export async function grantCredits(pc: PlatformCtx, orgId: string, input: { amount: number; expiresInDays?: number | null; note?: string | null }) {
  await assertPlatform(pc);
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > MAX_GRANT) throw new ValidationError("Informe uma quantidade inteira de créditos.", { amount: ["Quantidade inválida."] });
  const days = input.expiresInDays ?? null;
  if (days != null && (!Number.isInteger(days) || days < 1 || days > 3650)) throw new ValidationError("A validade deve ser de 1 a 3650 dias (ou sem validade).", { expiresInDays: ["Validade inválida."] });
  const note = input.note?.trim() || null;
  if (note && note.length > 200) throw new ValidationError("A observação pode ter no máximo 200 caracteres.", { note: ["Máximo de 200 caracteres."] });
  const org = await db.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { id: true } });
  if (!org) throw new NotFoundError("Escritório não encontrado.");
  const g = await db.creditGrant.create({ data: { organizationId: orgId, amount: input.amount, remaining: input.amount, expiresAt: days ? new Date(Date.now() + days * DAY) : null, note, createdById: pc.userId } });
  await audit({ action: "platform.credits_grant", organizationId: orgId, userId: pc.userId, resourceType: "credit_grant", resourceId: g.id, metadata: { amount: input.amount, expiresInDays: days }, meta: pc.meta });
  return g.id;
}

/** Situação de créditos de vários escritórios de uma vez (para a lista da plataforma). Só números. */
export async function platformCreditsSnapshot(pc: PlatformCtx, orgIds: string[]) {
  await assertPlatform(pc);
  const now = new Date();
  const [orgs, sums] = await Promise.all([
    db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, creditsEnabled: true } }),
    db.creditGrant.groupBy({ by: ["organizationId"], where: { organizationId: { in: orgIds }, ...notExpired(now) }, _sum: { remaining: true } }),
  ]);
  return new Map(orgs.map((o) => [o.id, { enabled: o.creditsEnabled, balance: sums.find((x) => x.organizationId === o.id)?._sum.remaining ?? 0 }]));
}
