/**
 * Painel de administração da PLATAFORMA (dono do sistema), acima dos escritórios.
 * Regras de segurança:
 *  - só quem está em `platform_admins` (concedido por script, nunca pela interface) e tem 2FA ativo;
 *  - NUNCA devolve conteúdo dos escritórios: nada de processos, clientes, documentos, teor de intimações ou metadados de auditoria;
 *    só contagens, datas, estados e identificação do escritório e dos usuários;
 *  - sem "entrar como" outro usuário.
 */
import type { Prisma } from "@prisma/client";
import { asaasConfigFromEnv } from "@/lib/billing/asaas";
import { db } from "@/lib/db/client";
import { smtpConfigFromEnv } from "@/lib/mail/mailer";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import type { RequestMeta } from "@/server/context";
import { audit } from "./audit.service";

export type PlatformCtx = { userId: string; meta: RequestMeta };

/** Devolve o contexto só se o usuário for super-admin ativo COM 2FA. Caso contrário, null. */
export async function resolvePlatformContext(userId: string, meta: RequestMeta = {}): Promise<PlatformCtx | null> {
  const u = await db.user.findFirst({ where: { id: userId, disabledAt: null, platformAdmin: { isNot: null }, mfa: { is: { enabledAt: { not: null } } } }, select: { id: true } });
  return u ? { userId, meta } : null;
}

/** Diz por que o acesso foi recusado (para a tela explicar sem vazar nada). */
export async function platformAccessState(userId: string): Promise<"ok" | "not_admin" | "needs_mfa"> {
  const u = await db.user.findFirst({ where: { id: userId, disabledAt: null, platformAdmin: { isNot: null } }, select: { mfa: { select: { enabledAt: true } } } });
  if (!u) return "not_admin";
  return u.mfa?.enabledAt ? "ok" : "needs_mfa";
}

export async function assertPlatform(pc: PlatformCtx) {
  if (!(await resolvePlatformContext(pc.userId, pc.meta))) throw new ForbiddenError();
}

const days = (n: number) => new Date(Date.now() - n * 86_400_000);

export async function platformOverview(pc: PlatformCtx) {
  await assertPlatform(pc);
  const now = new Date();
  const [orgs, suspended, newOrgs30, users, disabledUsers, lockedUsers, mfaUsers, cases, openNotices, openDeadlines, documents, logins7, failed24, ai30, activeOrgs7] = await Promise.all([
    db.organization.count({ where: { deletedAt: null } }),
    db.organization.count({ where: { deletedAt: null, suspendedAt: { not: null } } }),
    db.organization.count({ where: { deletedAt: null, createdAt: { gte: days(30) } } }),
    db.user.count({ where: { disabledAt: null } }),
    db.user.count({ where: { disabledAt: { not: null } } }),
    db.user.count({ where: { lockedUntil: { gt: now } } }),
    db.userMfa.count({ where: { enabledAt: { not: null }, user: { disabledAt: null } } }),
    db.case.count({ where: { deletedAt: null } }),
    db.courtNotice.count({ where: { deletedAt: null, status: { in: ["NEW", "DISTRIBUTED"] } } }),
    db.deadline.count({ where: { status: { in: ["DRAFT", "VALIDATED"] } } }),
    db.document.count({ where: { deletedAt: null } }),
    db.auditLog.count({ where: { action: "auth.login", result: "SUCCESS", createdAt: { gte: days(7) } } }),
    db.auditLog.count({ where: { action: "auth.login", result: { not: "SUCCESS" }, createdAt: { gte: days(1) } } }),
    db.aiUsage.aggregate({ where: { createdAt: { gte: days(30) } }, _sum: { inputTokens: true, outputTokens: true }, _count: { _all: true } }),
    db.auditLog.findMany({ where: { createdAt: { gte: days(7) }, organizationId: { not: null } }, distinct: ["organizationId"], select: { organizationId: true } }),
  ]);
  return {
    organizations: { total: orgs, suspended, active: orgs - suspended, new30: newOrgs30, activeLast7: activeOrgs7.length },
    users: { active: users, disabled: disabledUsers, locked: lockedUsers, withMfa: mfaUsers, mfaPct: users ? Math.round((mfaUsers / users) * 100) : 0 },
    volume: { cases, openNotices, openDeadlines, documents },
    security: { logins7, failedLogins24: failed24 },
    ai30: { calls: ai30._count._all, inputTokens: ai30._sum.inputTokens ?? 0, outputTokens: ai30._sum.outputTokens ?? 0 },
  };
}

export type OrgRow = {
  id: string; name: string; slug: string; createdAt: Date; suspendedAt: Date | null; suspendedReason: string | null;
  members: number; mfaMembers: number; cases: number; openNotices: number; ai30Tokens: number; lastActivity: Date | null;
  aiEnabled: boolean; datajudEnabled: boolean; djenMonitors: number; courtConnections: number;
  plan: { key: string; name: string; status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null } | null; storageBytes: number;
};

export async function listOrganizations(pc: PlatformCtx, f: { q?: string; status?: "active" | "suspended" } = {}): Promise<{ total: number; items: OrgRow[] }> {
  await assertPlatform(pc);
  const and: Prisma.OrganizationWhereInput[] = [{ deletedAt: null }];
  if (f.status === "suspended") and.push({ suspendedAt: { not: null } });
  if (f.status === "active") and.push({ suspendedAt: null });
  const q = f.q?.trim().slice(0, 80);
  if (q) and.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] });
  const where = { AND: and };
  const [total, orgs] = await Promise.all([db.organization.count({ where }), db.organization.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true, slug: true, createdAt: true, suspendedAt: true, suspendedReason: true, aiEnabled: true, datajudEnabled: true } })]);
  const ids = orgs.map((o) => o.id);
  if (!ids.length) return { total, items: [] };
  const [members, cases, notices, ai, last, mfa, djen, conns, subs, stor] = await Promise.all([
    db.membership.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, status: "ACTIVE" }, _count: { _all: true } }),
    db.case.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
    db.courtNotice.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, deletedAt: null, status: { in: ["NEW", "DISTRIBUTED"] } }, _count: { _all: true } }),
    db.aiUsage.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, createdAt: { gte: days(30) } }, _sum: { inputTokens: true, outputTokens: true } }),
    db.auditLog.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids } }, _max: { createdAt: true } }),
    db.$queryRaw<{ organization_id: string; n: bigint }[]>`SELECT m.organization_id, count(*)::bigint AS n FROM memberships m JOIN user_mfa um ON um.user_id = m.user_id AND um.enabled_at IS NOT NULL WHERE m.status = 'ACTIVE' AND m.organization_id = ANY(${ids}::uuid[]) GROUP BY 1`,
    db.djenMonitor.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids } }, _count: { _all: true } }),
    db.courtConnection.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids } }, _count: { _all: true } }),
    db.subscription.findMany({ where: { organizationId: { in: ids } }, include: { plan: { select: { key: true, name: true } } } }),
    db.documentVersion.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, document: { is: { deletedAt: null } } }, _sum: { sizeBytes: true } }),
  ]);
  const m = <T extends { organizationId: string | null }>(rows: T[]) => new Map(rows.map((r) => [r.organizationId, r]));
  const mm = m(members), cm = m(cases), nm = m(notices), am = m(ai), lm = m(last), dm = m(djen), qm = m(conns);
  const subMap = new Map(subs.map((x) => [x.organizationId, x]));
  const storMap = new Map(stor.map((x) => [x.organizationId, x._sum.sizeBytes ?? 0]));
  const mfaMap = new Map(mfa.map((r) => [r.organization_id, Number(r.n)]));
  return {
    total,
    items: orgs.map((o) => ({
      ...o,
      members: mm.get(o.id)?._count._all ?? 0,
      mfaMembers: mfaMap.get(o.id) ?? 0,
      cases: cm.get(o.id)?._count._all ?? 0,
      openNotices: nm.get(o.id)?._count._all ?? 0,
      ai30Tokens: (am.get(o.id)?._sum.inputTokens ?? 0) + (am.get(o.id)?._sum.outputTokens ?? 0),
      lastActivity: lm.get(o.id)?._max.createdAt ?? null,
      djenMonitors: dm.get(o.id)?._count._all ?? 0,
      courtConnections: qm.get(o.id)?._count._all ?? 0,
      plan: (() => { const x = subMap.get(o.id); return x ? { key: x.plan.key, name: x.plan.name, status: x.status, trialEndsAt: x.trialEndsAt, currentPeriodEnd: x.currentPeriodEnd } : null; })(),
      storageBytes: storMap.get(o.id) ?? 0,
    })),
  };
}

/** Suspende (com motivo) ou reativa um escritório. Suspender bloqueia o acesso de todos os membros, preserva os dados e para as rotinas automáticas. */
export async function setOrganizationSuspended(pc: PlatformCtx, orgId: string, reason: string | null) {
  await assertPlatform(pc);
  const text = reason?.trim() ?? null;
  if (reason !== null && (!text || text.length < 5 || text.length > 300)) throw new ValidationError("Informe o motivo da suspensão (5 a 300 caracteres).", { reason: ["Motivo inválido."] });
  await db.$transaction(async (tx) => {
    const r = await tx.organization.updateMany({ where: { id: orgId, deletedAt: null, suspendedAt: reason === null ? { not: null } : null }, data: reason === null ? { suspendedAt: null, suspendedReason: null } : { suspendedAt: new Date(), suspendedReason: text } });
    if (r.count !== 1) {
      const exists = await tx.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { suspendedAt: true } });
      if (!exists) throw new NotFoundError("Escritório não encontrado.");
      throw new ConflictError(reason === null ? "O escritório não está suspenso." : "O escritório já está suspenso.");
    }
    await audit({ action: reason === null ? "platform.org_reactivate" : "platform.org_suspend", organizationId: orgId, userId: pc.userId, resourceType: "organization", resourceId: orgId, metadata: reason === null ? undefined : { reason: text }, meta: pc.meta }, tx);
  });
}

export type PlatformUserRow = { id: string; name: string; email: string; createdAt: Date; lastLoginAt: Date | null; disabledAt: Date | null; locked: boolean; mfa: boolean; isPlatformAdmin: boolean; organizations: { id: string; name: string; role: string; suspended: boolean }[] };

export async function listPlatformUsers(pc: PlatformCtx, f: { q?: string } = {}): Promise<{ total: number; items: PlatformUserRow[] }> {
  await assertPlatform(pc);
  const q = f.q?.trim().slice(0, 80);
  const where: Prisma.UserWhereInput = q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {};
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where, orderBy: { createdAt: "desc" }, take: 200,
      select: {
        id: true, name: true, email: true, createdAt: true, lastLoginAt: true, disabledAt: true, lockedUntil: true,
        mfa: { select: { enabledAt: true } }, platformAdmin: { select: { userId: true } },
        memberships: { where: { status: "ACTIVE" }, select: { role: { select: { name: true } }, organization: { select: { id: true, name: true, suspendedAt: true, deletedAt: true } } } },
      },
    }),
  ]);
  return {
    total,
    items: rows.map((u) => ({
      id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, disabledAt: u.disabledAt, locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
      mfa: Boolean(u.mfa?.enabledAt), isPlatformAdmin: Boolean(u.platformAdmin),
      organizations: u.memberships.filter((m) => !m.organization.deletedAt).map((m) => ({ id: m.organization.id, name: m.organization.name, role: m.role.name, suspended: Boolean(m.organization.suspendedAt) })),
    })),
  };
}

export async function setUserDisabled(pc: PlatformCtx, userId: string, disabled: boolean) {
  await assertPlatform(pc);
  if (userId === pc.userId) throw new ConflictError("Você não pode desativar a si mesmo.");
  const u = await db.user.findUnique({ where: { id: userId }, select: { disabledAt: true, platformAdmin: { select: { userId: true } } } });
  if (!u) throw new NotFoundError("Usuário não encontrado.");
  if (u.platformAdmin) throw new ConflictError("Super-administradores só são alterados pelo script de administração.");
  if (disabled === Boolean(u.disabledAt)) throw new ConflictError(disabled ? "O usuário já está desativado." : "O usuário não está desativado.");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { disabledAt: disabled ? new Date() : null } });
    if (disabled) await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ action: disabled ? "platform.user_disable" : "platform.user_enable", userId: pc.userId, resourceType: "user", resourceId: userId, meta: pc.meta }, tx);
  });
}

export async function unlockUser(pc: PlatformCtx, userId: string) {
  await assertPlatform(pc);
  const r = await db.user.updateMany({ where: { id: userId }, data: { lockedUntil: null, failedLoginCount: 0 } });
  if (r.count !== 1) throw new NotFoundError("Usuário não encontrado.");
  await audit({ action: "platform.user_unlock", userId: pc.userId, resourceType: "user", resourceId: userId, meta: pc.meta });
}

export type AuditRow = { id: string; createdAt: Date; action: string; result: string; resourceType: string | null; ipAddress: string | null; organizationName: string | null; userEmail: string | null };

/** Trilha de auditoria da plataforma. Sem `metadata`: ela pode citar dados dos escritórios. */
export async function listPlatformAudit(pc: PlatformCtx, f: { organizationId?: string; action?: string; result?: "SUCCESS" | "FAILURE" | "DENIED"; platformOnly?: boolean; take?: number } = {}): Promise<AuditRow[]> {
  await assertPlatform(pc);
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.organizationId) and.push({ organizationId: f.organizationId });
  if (f.action) and.push({ action: { startsWith: f.action.trim().slice(0, 40) } });
  if (f.result) and.push({ result: f.result });
  if (f.platformOnly) and.push({ action: { startsWith: "platform." } });
  const rows = await db.auditLog.findMany({
    where: { AND: and }, orderBy: { createdAt: "desc" }, take: Math.min(f.take ?? 100, 300),
    select: { id: true, createdAt: true, action: true, result: true, resourceType: true, ipAddress: true, organization: { select: { name: true } }, user: { select: { email: true } } },
  });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, action: r.action, result: r.result, resourceType: r.resourceType, ipAddress: r.ipAddress, organizationName: r.organization?.name ?? null, userEmail: r.user?.email ?? null }));
}

export type IntegrationHealth = {
  system: { database: boolean; migrations: boolean; flags: { name: string; configured: boolean }[] };
  djen: { organization: string; label: string; enabled: boolean; lastSyncAt: Date | null; lastStatus: string | null; lastMessage: string | null }[];
  mni: { organization: string; label: string; jtr: string; enabled: boolean; lastSyncAt: Date | null; lastStatus: string | null; lastMessage: string | null }[];
  datajudOrgs: number;
  certificates: { active: number; expiring30: number; expired: number };
};

export async function integrationsHealth(pc: PlatformCtx): Promise<IntegrationHealth> {
  await assertPlatform(pc);
  let database = false, migrations = false;
  try {
    await db.$queryRaw`SELECT 1`;
    database = true;
    const r = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM _legalos_migrations`;
    migrations = Number(r[0]?.n ?? 0) > 0;
  } catch { /* mantém false */ }
  const has = (k: string) => Boolean(process.env[k]?.trim());
  const now = new Date();
  const [djen, mni, datajudOrgs, active, expiring, expired] = await Promise.all([
    db.djenMonitor.findMany({ where: { organization: { deletedAt: null } }, orderBy: [{ lastStatus: "asc" }, { lastSyncAt: "asc" }], take: 100, select: { label: true, enabled: true, lastSyncAt: true, lastStatus: true, lastMessage: true, organization: { select: { name: true } } } }),
    db.courtConnection.findMany({ where: { organization: { deletedAt: null } }, orderBy: [{ lastStatus: "asc" }, { lastSyncAt: "asc" }], take: 100, select: { label: true, jtr: true, enabled: true, lastSyncAt: true, lastStatus: true, lastMessage: true, organization: { select: { name: true } } } }),
    db.organization.count({ where: { deletedAt: null, datajudEnabled: true } }),
    db.certificate.count({ where: { revokedAt: null, notAfter: { gt: now } } }),
    db.certificate.count({ where: { revokedAt: null, notAfter: { gt: now, lte: new Date(Date.now() + 30 * 86_400_000) } } }),
    db.certificate.count({ where: { revokedAt: null, notAfter: { lte: now } } }),
  ]);
  return {
    system: {
      database, migrations,
      flags: [
        { name: "Assistente de IA (ANTHROPIC_API_KEY)", configured: has("ANTHROPIC_API_KEY") },
        { name: "DataJud (DATAJUD_API_KEY)", configured: has("DATAJUD_API_KEY") },
        { name: "Cofre de certificados (CERT_ENCRYPTION_KEY)", configured: has("CERT_ENCRYPTION_KEY") },
        { name: "2FA (MFA_ENCRYPTION_KEY)", configured: has("MFA_ENCRYPTION_KEY") },
        { name: "Agendador do DJEN e do MNI (CRON_SECRET)", configured: has("CRON_SECRET") },
        { name: "E-mail de verdade (MAIL_DRIVER=smtp + SMTP_*)", configured: process.env.MAIL_DRIVER === "smtp" && smtpConfigFromEnv().config !== undefined },
        { name: "Cobrança automática (ASAAS_API_KEY + ASAAS_WEBHOOK_TOKEN)", configured: asaasConfigFromEnv().config !== undefined },
      ],
    },
    djen: djen.map((d) => ({ organization: d.organization.name, label: d.label, enabled: d.enabled, lastSyncAt: d.lastSyncAt, lastStatus: d.lastStatus, lastMessage: d.lastMessage })),
    mni: mni.map((d) => ({ organization: d.organization.name, label: d.label, jtr: d.jtr, enabled: d.enabled, lastSyncAt: d.lastSyncAt, lastStatus: d.lastStatus, lastMessage: d.lastMessage })),
    datajudOrgs,
    certificates: { active, expiring30: expiring, expired },
  };
}

export async function listPlans(pc: PlatformCtx) {
  await assertPlatform(pc);
  return db.plan.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, key: true, name: true, maxUsers: true, maxStorageMb: true, maxAiTokensMonth: true, priceCents: true } });
}

export type PlanEditInput = { priceCents: number | null; maxUsers: number | null; maxStorageMb: number | null; maxAiTokensMonth: number | null };

/** Edita preço mensal (centavos de real) e limites de um plano. Vazio = sem preço (não contratável) / sem limite. Afeta já os escritórios no plano. */
export async function updatePlan(pc: PlatformCtx, key: string, input: PlanEditInput) {
  await assertPlatform(pc);
  const intOrNull = (n: number | null, min: number, max: number, field: string) => {
    if (n == null) return null;
    if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError("Valor inválido.", { [field]: [`Informe um número inteiro entre ${min} e ${max}.`] });
    return n;
  };
  const data = {
    priceCents: intOrNull(input.priceCents, 100, 100_000_000, "priceCents"),
    maxUsers: intOrNull(input.maxUsers, 1, 100_000, "maxUsers"),
    maxStorageMb: intOrNull(input.maxStorageMb, 1, 100_000_000, "maxStorageMb"),
    maxAiTokensMonth: intOrNull(input.maxAiTokensMonth, 0, 2_000_000_000, "maxAiTokensMonth"),
  };
  const plan = await db.plan.findUnique({ where: { key } });
  if (!plan) throw new NotFoundError("Plano não encontrado.");
  await db.$transaction(async (tx) => {
    await tx.plan.update({ where: { key }, data });
    await audit({ action: "platform.plan_update", userId: pc.userId, resourceType: "plan", resourceId: plan.id, metadata: { key, from: { priceCents: plan.priceCents, maxUsers: plan.maxUsers, maxStorageMb: plan.maxStorageMb, maxAiTokensMonth: plan.maxAiTokensMonth }, to: data }, meta: pc.meta }, tx);
  });
}

export type SubscriptionInput = { planKey: string; status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED"; trialDays?: number | null; periodDays?: number | null; note?: string | null };

/**
 * Define plano e situação da assinatura de um escritório (cobrança manual: a plataforma ainda não tem provedor de pagamento).
 * `trialDays` redefine o fim do teste a partir de hoje (só em TRIALING); `periodDays` define o fim do período pago (só em ACTIVE).
 * Reduzir o plano abaixo do uso atual é permitido: nada é apagado; apenas novos envios/convites/IA ficam recusados até caber.
 */
export async function setOrganizationSubscription(pc: PlatformCtx, orgId: string, input: SubscriptionInput) {
  await assertPlatform(pc);
  const note = input.note?.trim() || null;
  if (note && note.length > 300) throw new ValidationError("A observação pode ter no máximo 300 caracteres.", { note: ["Máximo de 300 caracteres."] });
  const intOk = (n: number | null | undefined) => n == null || (Number.isInteger(n) && n >= 0 && n <= 3650);
  if (!intOk(input.trialDays) || !intOk(input.periodDays)) throw new ValidationError("Informe um número de dias entre 0 e 3650.", { days: ["Dias inválidos."] });
  const [org, plan, current] = await Promise.all([
    db.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { id: true } }),
    db.plan.findUnique({ where: { key: input.planKey } }),
    db.subscription.findUnique({ where: { organizationId: orgId } }),
  ]);
  if (!org) throw new NotFoundError("Escritório não encontrado.");
  if (!plan) throw new ValidationError("Plano inexistente.", { planKey: ["Plano inexistente."] });
  const day = 86_400_000;
  const trialEndsAt = input.status === "TRIALING" ? (input.trialDays != null ? new Date(Date.now() + input.trialDays * day) : (current?.trialEndsAt ?? new Date(Date.now() + 14 * day))) : null;
  const currentPeriodEnd = input.status === "ACTIVE" ? (input.periodDays != null ? new Date(Date.now() + input.periodDays * day) : (current?.currentPeriodEnd ?? null)) : (input.status === "PAST_DUE" ? (current?.currentPeriodEnd ?? null) : null);
  await db.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, planId: plan.id, status: input.status, trialEndsAt, currentPeriodEnd },
      update: { planId: plan.id, status: input.status, trialEndsAt, currentPeriodEnd },
    });
    await audit({ action: "platform.subscription_update", organizationId: orgId, userId: pc.userId, resourceType: "subscription", resourceId: orgId, metadata: { from: current ? { plan: current.planId, status: current.status } : null, to: { plan: plan.key, status: input.status }, note }, meta: pc.meta }, tx);
  });
}
