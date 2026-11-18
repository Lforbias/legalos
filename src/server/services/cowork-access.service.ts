import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, can, type TenantContext } from "@/server/context";
import { COWORK_DEPARTMENTS, COWORK_DEPARTMENT_LABEL, isCoworkDepartment, type CoworkDepartment } from "@/modules/cowork/constants";
import { audit } from "./audit.service";

/**
 * Acesso ao Cowork. Regras (aplicadas no servidor, em toda leitura e escrita):
 * 1. a pessoa é membro ATIVO do escritório (garantido pelo TenantContext);
 * 2. o perfil dela tem `cowork:read`;
 * 3. o Cowork está habilitado no escritório e a pessoa não foi bloqueada no Cowork.
 */
export class CoworkDisabledError extends ForbiddenError {
  constructor(message = "O Cowork não está disponível para você neste escritório.") {
    super(message);
  }
}

export async function getCoworkSettings(organizationId: string, client: Tx | typeof db = db) {
  return (
    (await client.coworkSettings.findUnique({ where: { organizationId } })) ?? {
      organizationId,
      enabled: true,
      defaultChannels: [...COWORK_DEPARTMENTS] as string[],
      allowDirect: true,
      updatedById: null,
      updatedAt: new Date(0),
    }
  );
}

export async function coworkAvailability(ctx: TenantContext): Promise<{ ok: true } | { ok: false; reason: "permission" | "disabled" | "blocked" }> {
  if (!can(ctx, "cowork:read")) return { ok: false, reason: "permission" };
  const [settings, profile] = await Promise.all([
    getCoworkSettings(ctx.organizationId),
    db.coworkMemberProfile.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } }, select: { blockedAt: true } }),
  ]);
  if (!settings.enabled && !can(ctx, "cowork:manage")) return { ok: false, reason: "disabled" };
  if (profile?.blockedAt) return { ok: false, reason: "blocked" };
  return { ok: true };
}

export async function assertCoworkAccess(ctx: TenantContext): Promise<void> {
  const r = await coworkAvailability(ctx);
  if (!r.ok) throw new CoworkDisabledError();
}

/** Pessoas do escritório que podem usar o Cowork (perfil com cowork:read, vínculo ativo, sem bloqueio). */
export function coworkUserWhere(organizationId: string): Prisma.UserWhereInput {
  return {
    disabledAt: null,
    memberships: { some: { organizationId, status: "ACTIVE", role: { permissions: { has: "cowork:read" } } } },
    NOT: { coworkProfiles: { some: { organizationId, blockedAt: { not: null } } } },
  };
}

/** Garante que todos os ids são pessoas aptas ao Cowork neste escritório. */
export async function assertCoworkUsers(ctx: TenantContext, userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  const count = await db.user.count({ where: { AND: [{ id: { in: unique } }, coworkUserWhere(ctx.organizationId)] } });
  if (count !== unique.length) throw new ValidationError("Há participantes que não pertencem ao escritório ou não usam o Cowork.");
}

export type CoworkPerson = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: CoworkDepartment | null;
  departmentLabel: string | null;
  roleName: string;
  availability: "AVAILABLE" | "BUSY" | "AWAY" | null;
  availabilityNote: string | null;
};

/** Diretório de pessoas do Cowork: nome de exibição profissional, cargo, departamento e disponibilidade declarada. */
export async function listCoworkPeople(ctx: TenantContext): Promise<CoworkPerson[]> {
  await assertCoworkAccess(ctx);
  const rows = await db.user.findMany({
    where: coworkUserWhere(ctx.organizationId),
    orderBy: { name: "asc" },
    take: 1000,
    select: {
      id: true,
      name: true,
      memberships: { where: { organizationId: ctx.organizationId }, select: { role: { select: { name: true } } } },
      coworkProfiles: { where: { organizationId: ctx.organizationId }, select: { displayName: true, jobTitle: true, department: true, availability: true, availabilityNote: true } },
    },
  });
  return rows.map((u) => toPerson(u)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

type PersonRow = {
  id: string;
  name: string;
  memberships: { role: { name: string } }[];
  coworkProfiles: { displayName: string | null; jobTitle: string | null; department: string | null; availability: "AVAILABLE" | "BUSY" | "AWAY" | null; availabilityNote: string | null }[];
};

function toPerson(u: PersonRow): CoworkPerson {
  const p = u.coworkProfiles[0];
  const dept = isCoworkDepartment(p?.department) ? p.department : null;
  return {
    id: u.id,
    name: p?.displayName?.trim() || u.name,
    jobTitle: p?.jobTitle ?? null,
    department: dept,
    departmentLabel: dept ? COWORK_DEPARTMENT_LABEL[dept] : null,
    roleName: u.memberships[0]?.role.name ?? "",
    availability: p?.availability ?? null,
    availabilityNote: p?.availabilityNote ?? null,
  };
}

/** Nomes de exibição (sem exigir acesso ao Cowork: usado por quem já passou pela checagem). */
export async function displayNames(organizationId: string, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = await db.user.findMany({
    where: { id: { in: unique }, memberships: { some: { organizationId } } },
    select: { id: true, name: true, coworkProfiles: { where: { organizationId }, select: { displayName: true } } },
  });
  return new Map(rows.map((r) => [r.id, r.coworkProfiles[0]?.displayName?.trim() || r.name]));
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A própria pessoa ajusta nome de exibição, cargo e disponibilidade declarada. */
export async function updateMyProfile(ctx: TenantContext, raw: { displayName?: string; jobTitle?: string; availability?: string; availabilityNote?: string }) {
  await assertCoworkAccess(ctx);
  const availability: "AVAILABLE" | "BUSY" | "AWAY" | null = raw.availability === "AVAILABLE" || raw.availability === "BUSY" || raw.availability === "AWAY" ? raw.availability : null;
  const data = {
    displayName: text(raw.displayName, 80) || null,
    jobTitle: text(raw.jobTitle, 80) || null,
    availability,
    availabilityNote: text(raw.availabilityNote, 120) || null,
    availabilityAt: availability ? new Date() : null,
  };
  await db.coworkMemberProfile.upsert({
    where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } },
    create: { organizationId: ctx.organizationId, userId: ctx.userId, ...data },
    update: data,
  });
}

/** Administração: departamento, cargo e bloqueio do Cowork por pessoa. */
export async function adminUpdateMember(ctx: TenantContext, userId: string, raw: { department?: string | null; jobTitle?: string | null; blocked?: boolean }) {
  assertCan(ctx, "cowork:manage");
  const m = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId, status: "ACTIVE" }, select: { role: { select: { key: true } } } });
  if (!m) throw new NotFoundError("Pessoa não encontrada neste escritório.");
  if (raw.blocked && userId === ctx.userId) throw new ValidationError("Você não pode bloquear o próprio acesso.");
  if (raw.blocked && m.role.key === "OWNER") throw new ValidationError("O proprietário do escritório não pode ser bloqueado.");
  const department = raw.department === undefined ? undefined : isCoworkDepartment(raw.department) ? raw.department : null;
  const data: Prisma.CoworkMemberProfileUncheckedUpdateInput = {
    ...(department !== undefined ? { department } : {}),
    ...(raw.jobTitle !== undefined ? { jobTitle: text(raw.jobTitle, 80) || null } : {}),
    ...(raw.blocked !== undefined ? { blockedAt: raw.blocked ? new Date() : null, blockedById: raw.blocked ? ctx.userId : null } : {}),
  };
  await db.$transaction(async (tx) => {
    await tx.coworkMemberProfile.upsert({
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId } },
      create: { organizationId: ctx.organizationId, userId, department: department ?? null, jobTitle: raw.jobTitle ? text(raw.jobTitle, 80) : null, blockedAt: raw.blocked ? new Date() : null, blockedById: raw.blocked ? ctx.userId : null },
      update: data,
    });
    await audit({ action: raw.blocked === undefined ? "cowork.member.update" : raw.blocked ? "cowork.member.block" : "cowork.member.unblock", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "user", resourceId: userId, metadata: { department: department ?? undefined }, meta: ctx.meta }, tx);
  });
}

export async function updateCoworkSettings(ctx: TenantContext, raw: { enabled?: boolean; defaultChannels?: string[]; allowDirect?: boolean }) {
  assertCan(ctx, "cowork:manage");
  const defaultChannels = raw.defaultChannels?.filter(isCoworkDepartment);
  const data = {
    ...(raw.enabled !== undefined ? { enabled: raw.enabled } : {}),
    ...(raw.allowDirect !== undefined ? { allowDirect: raw.allowDirect } : {}),
    ...(defaultChannels ? { defaultChannels: [...new Set(defaultChannels)] } : {}),
    updatedById: ctx.userId,
  };
  await db.$transaction(async (tx) => {
    await tx.coworkSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
    await audit({ action: "cowork.settings.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_settings", resourceId: ctx.organizationId, metadata: { enabled: raw.enabled, allowDirect: raw.allowDirect, defaultChannels }, meta: ctx.meta }, tx);
  });
}

/** Visão administrativa das pessoas (para a tela de configurações do Cowork). */
export async function listMembersForAdmin(ctx: TenantContext) {
  assertCan(ctx, "cowork:manage");
  const rows = await db.membership.findMany({
    where: { organizationId: ctx.organizationId, status: "ACTIVE", role: { key: { not: "CLIENT" } } },
    orderBy: { user: { name: "asc" } },
    select: {
      role: { select: { name: true, permissions: true } },
      user: { select: { id: true, name: true, email: true, coworkProfiles: { where: { organizationId: ctx.organizationId }, select: { department: true, jobTitle: true, blockedAt: true, displayName: true } } } },
    },
  });
  return rows.map((r) => {
    const p = r.user.coworkProfiles[0];
    return {
      id: r.user.id,
      name: r.user.name,
      displayName: p?.displayName ?? null,
      email: r.user.email,
      roleName: r.role.name,
      hasPermission: r.role.permissions.includes("cowork:read"),
      department: isCoworkDepartment(p?.department) ? p.department : null,
      jobTitle: p?.jobTitle ?? null,
      blocked: Boolean(p?.blockedAt),
    };
  });
}
