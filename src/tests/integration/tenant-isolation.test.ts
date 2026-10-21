import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { NotFoundError, ForbiddenError } from "@/lib/permissions/check";
import { changeMemberRole, listMembers, removeMember, setMemberStatus } from "@/server/services/membership.service";
import { createInvitation, listInvitations, revokeInvitation } from "@/server/services/invitation.service";
import { deleteRole, listRoles, updateRole } from "@/server/services/role.service";
import { createSession, setActiveOrganization } from "@/server/services/auth.service";
import { resolveTenantContext } from "@/server/services/tenant.service";
import { getDashboard, listAuditLogs } from "@/server/services/dashboard.service";
import { addMember, makeOrgWithOwner, META, roleByKey } from "./helpers";

describe("isolamento multiempresa", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let bMember: Awaited<ReturnType<typeof addMember>>;
  let bInvitationId: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("A");
    B = await makeOrgWithOwner("B");
    bMember = await addMember(B.org.id, "LAWYER", "b-lawyer");
    const inv = await createInvitation(B.ctx, { email: "novo-b@example.test", roleId: (await roleByKey(B.org.id, "ASSISTANT")).id });
    bInvitationId = inv.id;
  });

  it("listagens retornam somente dados do próprio escritório", async () => {
    const membersA = await listMembers(A.ctx);
    expect(membersA.map((m) => m.user.id)).toEqual([A.owner.id]);
    const rolesA = await listRoles(A.ctx);
    expect(rolesA.every((r) => r.id !== undefined)).toBe(true);
    const rolesInDb = await db.role.findMany({ where: { id: { in: rolesA.map((r) => r.id) } } });
    expect(rolesInDb.every((r) => r.organizationId === A.org.id)).toBe(true);
    expect(await listInvitations(A.ctx)).toHaveLength(0);
    const audit = await listAuditLogs(A.ctx, { page: 1, pageSize: 100 });
    expect(await db.auditLog.count({ where: { id: { in: audit.rows.map((r) => r.id) }, organizationId: { not: A.org.id } } })).toBe(0);
  });

  it("não é possível alterar, suspender ou remover membro de outro escritório (IDOR)", async () => {
    const adminRoleA = await roleByKey(A.org.id, "ADMIN");
    await expect(changeMemberRole(A.ctx, bMember.membership.id, adminRoleA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setMemberStatus(A.ctx, bMember.membership.id, "SUSPENDED")).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeMember(A.ctx, bMember.membership.id)).rejects.toBeInstanceOf(NotFoundError);
    const still = await db.membership.findUniqueOrThrow({ where: { id: bMember.membership.id } });
    expect(still.status).toBe("ACTIVE");
    expect(still.organizationId).toBe(B.org.id);
  });

  it("não é possível usar perfil de outro escritório", async () => {
    const lawyerB = await roleByKey(B.org.id, "LAWYER");
    const ownMember = await addMember(A.org.id, "ASSISTANT", "a-assistant");
    await expect(changeMemberRole(A.ctx, ownMember.membership.id, lawyerB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createInvitation(A.ctx, { email: "x@example.test", roleId: lawyerB.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateRole(A.ctx, lawyerB.id, { name: "x", permissions: [] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteRole(A.ctx, lawyerB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("não é possível revogar convite de outro escritório", async () => {
    await expect(revokeInvitation(A.ctx, bInvitationId)).rejects.toBeInstanceOf(NotFoundError);
    const inv = await db.invitation.findUniqueOrThrow({ where: { id: bInvitationId } });
    expect(inv.revokedAt).toBeNull();
  });

  it("contexto de tenant exige vínculo ativo no escritório", async () => {
    expect(await resolveTenantContext(A.owner.id, B.org.id)).toBeNull();
    expect(await resolveTenantContext(bMember.user.id, A.org.id)).toBeNull();
    await db.membership.update({ where: { id: bMember.membership.id }, data: { status: "SUSPENDED" } });
    expect(await resolveTenantContext(bMember.user.id, B.org.id)).toBeNull();
    await db.membership.update({ where: { id: bMember.membership.id }, data: { status: "ACTIVE" } });
  });

  it("usuário não pode ativar na sessão um escritório do qual não é membro", async () => {
    const s = await createSession(A.owner.id, META, A.org.id);
    await expect(setActiveOrganization(A.owner.id, s.sessionId, B.org.id)).rejects.toBeInstanceOf(NotFoundError);
    const row = await db.session.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.activeOrganizationId).toBe(A.org.id);
  });

  it("dashboard conta apenas dados do escritório do contexto", async () => {
    const dashA = await getDashboard(A.ctx);
    const dashB = await getDashboard(B.ctx);
    expect(dashA.members.active).toBeGreaterThanOrEqual(1);
    expect(dashB.members.active).toBeGreaterThan(dashA.members.active - 100); // sanidade
    const realA = await db.membership.count({ where: { organizationId: A.org.id, status: "ACTIVE" } });
    expect(dashA.members.active).toBe(realA);
    expect(dashB.pendingInvitations).toBe(1);
    expect(dashA.pendingInvitations).toBe(0);
  });

  it("sem permissão audit:read a auditoria é negada", async () => {
    const assistant = await addMember(A.org.id, "ASSISTANT", "a-asst2");
    await expect(listAuditLogs(assistant.ctx, { page: 1, pageSize: 10 })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
