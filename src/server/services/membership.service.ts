import { db, type Tx } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, isSubset } from "@/lib/permissions/check";
import { OWNER_ROLE_KEY } from "@/lib/permissions/roles";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

export async function listMembers(ctx: TenantContext) {
  assertCan(ctx, "members:read");
  const rows = await db.membership.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
      role: { select: { id: true, key: true, name: true } },
    },
  });
  return rows;
}

type Target = {
  id: string;
  userId: string;
  status: "ACTIVE" | "SUSPENDED";
  role: { id: string; key: string; permissions: string[] };
};

async function loadTarget(ctx: TenantContext, membershipId: string, tx: Tx): Promise<Target> {
  // organizationId no filtro: impossível alcançar vínculos de outro escritório (anti-IDOR).
  const m = await tx.membership.findFirst({
    where: { id: membershipId, organizationId: ctx.organizationId },
    select: { id: true, userId: true, status: true, role: { select: { id: true, key: true, permissions: true } } },
  });
  if (!m) throw new NotFoundError("Membro não encontrado.");
  return m;
}

/** O ator não pode agir sobre alguém com mais poder do que ele (exceto o Proprietário). */
function assertCanActOn(ctx: TenantContext, target: Target) {
  if (ctx.isOwner) return;
  if (target.role.key === OWNER_ROLE_KEY || !isSubset(target.role.permissions, ctx.permissions)) {
    throw new ForbiddenError("Você não pode alterar um membro com permissões superiores às suas.");
  }
}

async function assertNotLastOwner(ctx: TenantContext, target: Target, tx: Tx) {
  if (target.role.key !== OWNER_ROLE_KEY || target.status !== "ACTIVE") return;
  const owners = await tx.membership.count({
    where: { organizationId: ctx.organizationId, status: "ACTIVE", role: { key: OWNER_ROLE_KEY } },
  });
  if (owners <= 1) throw new ConflictError("O escritório precisa de ao menos um Proprietário ativo.");
}

export async function changeMemberRole(ctx: TenantContext, membershipId: string, roleId: string) {
  assertCan(ctx, "members:manage");
  await db.$transaction(async (tx) => {
    const target = await loadTarget(ctx, membershipId, tx);
    const role = await tx.role.findFirst({ where: { id: roleId, organizationId: ctx.organizationId } });
    if (!role) throw new NotFoundError("Perfil não encontrado.");
    assertCanActOn(ctx, target);
    if (!ctx.isOwner && (role.key === OWNER_ROLE_KEY || !isSubset(role.permissions, ctx.permissions))) {
      throw new ForbiddenError("Você não pode atribuir um perfil com permissões que você não possui.");
    }
    if (role.id === target.role.id) return;
    if (role.key !== OWNER_ROLE_KEY) await assertNotLastOwner(ctx, target, tx);
    await tx.membership.update({ where: { id: target.id }, data: { roleId: role.id } });
    await audit(
      {
        action: "member.role_change",
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        resourceType: "membership",
        resourceId: target.id,
        metadata: { targetUserId: target.userId, from: target.role.key, to: role.key },
        meta: ctx.meta,
      },
      tx,
    );
  });
}

export async function setMemberStatus(ctx: TenantContext, membershipId: string, status: "ACTIVE" | "SUSPENDED") {
  assertCan(ctx, "members:manage");
  await db.$transaction(async (tx) => {
    const target = await loadTarget(ctx, membershipId, tx);
    if (target.userId === ctx.userId) throw new ConflictError("Você não pode suspender a si mesmo.");
    assertCanActOn(ctx, target);
    if (status === "SUSPENDED") await assertNotLastOwner(ctx, target, tx);
    await tx.membership.update({ where: { id: target.id }, data: { status } });
    // sessões que apontavam para este escritório são devolvidas ao seletor
    if (status === "SUSPENDED") {
      await tx.session.updateMany({
        where: { userId: target.userId, activeOrganizationId: ctx.organizationId },
        data: { activeOrganizationId: null },
      });
    }
    await audit(
      {
        action: status === "SUSPENDED" ? "member.suspend" : "member.reactivate",
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        resourceType: "membership",
        resourceId: target.id,
        metadata: { targetUserId: target.userId },
        meta: ctx.meta,
      },
      tx,
    );
  });
}

export async function removeMember(ctx: TenantContext, membershipId: string) {
  assertCan(ctx, "members:manage");
  await db.$transaction(async (tx) => {
    const target = await loadTarget(ctx, membershipId, tx);
    if (target.userId === ctx.userId) throw new ConflictError("Você não pode remover a si mesmo.");
    assertCanActOn(ctx, target);
    await assertNotLastOwner(ctx, target, tx);
    await tx.membership.delete({ where: { id: target.id } });
    await tx.session.updateMany({
      where: { userId: target.userId, activeOrganizationId: ctx.organizationId },
      data: { activeOrganizationId: null },
    });
    await audit(
      {
        action: "member.remove",
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        resourceType: "membership",
        resourceId: target.id,
        metadata: { targetUserId: target.userId, role: target.role.key },
        meta: ctx.meta,
      },
      tx,
    );
  });
}
