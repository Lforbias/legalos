import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/permissions/check";
import { changeMemberRole, removeMember, setMemberStatus } from "@/server/services/membership.service";
import { createRole, deleteRole, updateRole } from "@/server/services/role.service";
import { acceptInvitation, createInvitation, previewInvitation } from "@/server/services/invitation.service";
import { hashToken } from "@/lib/security/tokens";
import { createSession, getSessionByToken, login, logout, requestPasswordReset, resetPassword, revokeSession, registerUser } from "@/server/services/auth.service";
import { updateOrganization } from "@/server/services/organization.service";
import { resolveTenantContext } from "@/server/services/tenant.service";
import { addMember, makeOrgWithOwner, makeUser, META, roleByKey } from "./helpers";

function tokenFromLink(link: string) {
  return new URL(link).searchParams.get("token") as string;
}

describe("permissões e anti-escalonamento", () => {
  it("usuário sem permissão não executa ações administrativas", async () => {
    const { org } = await makeOrgWithOwner("perm1");
    const asst = await addMember(org.id, "ASSISTANT", "asst");
    const admin = await roleByKey(org.id, "ADMIN");
    await expect(changeMemberRole(asst.ctx, asst.membership.id, admin.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createInvitation(asst.ctx, { email: "z@example.test", roleId: admin.id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createRole(asst.ctx, { name: "x", permissions: ["members:read"] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateOrganization(asst.ctx, { name: "Hack", timezone: "America/Sao_Paulo" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("perfil personalizado não pode conceder permissões que o criador não possui", async () => {
    const { org, ctx: ownerCtx } = await makeOrgWithOwner("perm2");
    const lim = await createRole(ownerCtx, { name: "Gestor de acessos", permissions: ["members:read", "members:manage", "members:invite", "roles:manage"] });
    const mgr = await db.user.findUniqueOrThrow({ where: { id: (await makeUser("mgr")).id } });
    await db.membership.create({ data: { organizationId: org.id, userId: mgr.id, roleId: lim.id } });
    const mgrCtx = (await resolveTenantContext(mgr.id, org.id, META))!;

    await expect(createRole(mgrCtx, { name: "Super", permissions: ["billing:manage"] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createRole(mgrCtx, { name: "Fin", permissions: ["finance:read"] })).rejects.toBeInstanceOf(ForbiddenError);
    const ok = await createRole(mgrCtx, { name: "Leitura", permissions: ["members:read"] });
    expect(ok.permissions).toEqual(["members:read"]);

    // não pode se promover nem convidar para perfis mais fortes
    const admin = await roleByKey(org.id, "ADMIN");
    const owner = await roleByKey(org.id, "OWNER");
    const mgrMembership = await db.membership.findFirstOrThrow({ where: { userId: mgr.id, organizationId: org.id } });
    await expect(changeMemberRole(mgrCtx, mgrMembership.id, admin.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeMemberRole(mgrCtx, mgrMembership.id, owner.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createInvitation(mgrCtx, { email: "adm@example.test", roleId: admin.id })).rejects.toBeInstanceOf(ForbiddenError);
    // editar perfil mais forte que o próprio também é negado
    await expect(updateRole(mgrCtx, lim.id, { name: "Gestor", permissions: ["members:read", "billing:manage"] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("não é possível alterar o Proprietário nem editar perfis de sistema", async () => {
    const { org, owner, ctx: ownerCtx } = await makeOrgWithOwner("perm3");
    const admin = await addMember(org.id, "ADMIN", "adm");
    const ownerMembership = await db.membership.findFirstOrThrow({ where: { userId: owner.id, organizationId: org.id } });
    const lawyer = await roleByKey(org.id, "LAWYER");
    await expect(changeMemberRole(admin.ctx, ownerMembership.id, lawyer.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setMemberStatus(admin.ctx, ownerMembership.id, "SUSPENDED")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeMember(admin.ctx, ownerMembership.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateRole(ownerCtx, lawyer.id, { name: "x", permissions: ["members:read"] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteRole(ownerCtx, lawyer.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("o último Proprietário não pode ser rebaixado, suspenso ou removido", async () => {
    const { org, owner, ctx } = await makeOrgWithOwner("perm4");
    const ownerMembership = await db.membership.findFirstOrThrow({ where: { userId: owner.id, organizationId: org.id } });
    const admin = await roleByKey(org.id, "ADMIN");
    await expect(changeMemberRole(ctx, ownerMembership.id, admin.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(setMemberStatus(ctx, ownerMembership.id, "SUSPENDED")).rejects.toBeInstanceOf(ConflictError); // self
    await expect(removeMember(ctx, ownerMembership.id)).rejects.toBeInstanceOf(ConflictError);

    // com um segundo proprietário, o primeiro pode ser rebaixado
    const second = await addMember(org.id, "ADMIN", "second");
    await changeMemberRole(ctx, second.membership.id, (await roleByKey(org.id, "OWNER")).id);
    await changeMemberRole(ctx, ownerMembership.id, admin.id);
    const after = await db.membership.findUniqueOrThrow({ where: { id: ownerMembership.id }, include: { role: true } });
    expect(after.role.key).toBe("ADMIN");
  });

  it("alterações administrativas geram trilha de auditoria", async () => {
    const { org, ctx } = await makeOrgWithOwner("perm5");
    const m = await addMember(org.id, "ASSISTANT", "x");
    await changeMemberRole(ctx, m.membership.id, (await roleByKey(org.id, "LAWYER")).id);
    const log = await db.auditLog.findFirst({ where: { organizationId: org.id, action: "member.role_change" } });
    expect(log?.userId).toBe(ctx.userId);
    expect(log?.resourceId).toBe(m.membership.id);
    expect(log?.correlationId).toBe("test");
  });
});

describe("convites", () => {
  it("fluxo completo: criar, pré-visualizar, aceitar uma única vez", async () => {
    const { org, ctx } = await makeOrgWithOwner("inv1");
    const role = await roleByKey(org.id, "LAWYER");
    const email = `convidado-${Date.now()}@example.test`;
    const { link, emailDelivered } = await createInvitation(ctx, { email, roleId: role.id });
    expect(emailDelivered).toBe(false); // driver console não entrega e-mail
    const token = tokenFromLink(link);
    expect(await db.invitation.count({ where: { tokenHash: token } })).toBe(0); // token em claro nunca é guardado
    expect(await previewInvitation(token)).toMatchObject({ email, roleName: "Advogado" });
    await expect(createInvitation(ctx, { email, roleId: role.id })).rejects.toBeInstanceOf(ConflictError);

    const guest = await registerUser({ name: "Convidado", email, password: "SenhaForte123" }, META);
    await acceptInvitation(guest.id, token, META);
    const m = await db.membership.findFirstOrThrow({ where: { userId: guest.id, organizationId: org.id }, include: { role: true } });
    expect(m.role.key).toBe("LAWYER");
    expect((await db.user.findUniqueOrThrow({ where: { id: guest.id } })).emailVerifiedAt).not.toBeNull();
    await expect(acceptInvitation(guest.id, token, META)).rejects.toBeInstanceOf(ValidationError);
    expect(await previewInvitation(token)).toBeNull();
  });

  it("e-mail diferente do convidado é negado", async () => {
    const { org, ctx } = await makeOrgWithOwner("inv2");
    const { link } = await createInvitation(ctx, { email: "alvo@example.test", roleId: (await roleByKey(org.id, "ASSISTANT")).id });
    const intruder = await makeUser("intruder");
    await expect(acceptInvitation(intruder.id, tokenFromLink(link), META)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.membership.count({ where: { userId: intruder.id, organizationId: org.id } })).toBe(0);
  });

  it("convite expirado ou revogado não pode ser aceito", async () => {
    const { org, ctx } = await makeOrgWithOwner("inv3");
    const email = `exp-${Date.now()}@example.test`;
    const { link, id } = await createInvitation(ctx, { email, roleId: (await roleByKey(org.id, "ASSISTANT")).id });
    const user = await registerUser({ name: "Exp", email, password: "SenhaForte123" }, META);
    await db.invitation.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(acceptInvitation(user.id, tokenFromLink(link), META)).rejects.toBeInstanceOf(ValidationError);
  });

  it("aceitações concorrentes do mesmo convite resultam em apenas um vínculo", async () => {
    const { org, ctx } = await makeOrgWithOwner("inv4");
    const email = `race-${Date.now()}@example.test`;
    const { link } = await createInvitation(ctx, { email, roleId: (await roleByKey(org.id, "ASSISTANT")).id });
    const user = await registerUser({ name: "Race", email, password: "SenhaForte123" }, META);
    const results = await Promise.allSettled([acceptInvitation(user.id, tokenFromLink(link), META), acceptInvitation(user.id, tokenFromLink(link), META)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.membership.count({ where: { userId: user.id, organizationId: org.id } })).toBe(1);
  });

  it("respeita o limite de usuários do plano", async () => {
    const { org, ctx } = await makeOrgWithOwner("inv5");
    const essencial = await db.plan.findUniqueOrThrow({ where: { key: "essencial" } });
    await db.subscription.update({ where: { organizationId: org.id }, data: { planId: essencial.id } });
    const role = await roleByKey(org.id, "ASSISTANT");
    for (let i = 0; i < (essencial.maxUsers ?? 0) - 1; i++) {
      await createInvitation(ctx, { email: `lim${i}-${Date.now()}@example.test`, roleId: role.id });
    }
    await expect(createInvitation(ctx, { email: `lim-over-${Date.now()}@example.test`, roleId: role.id })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("autenticação e sessões", () => {
  it("login válido cria sessão; senha incorreta e usuário inexistente falham da mesma forma", async () => {
    const u = await makeUser("login");
    const ok = await login({ email: u.email, password: "SenhaForte123" }, META);
    const session = await getSessionByToken(ok.token);
    expect(session?.user.id).toBe(u.id);
    const stored = await db.session.findUniqueOrThrow({ where: { id: ok.sessionId } });
    expect(stored.tokenHash).toBe(hashToken(ok.token));
    expect(stored.tokenHash).not.toBe(ok.token);

    const bad = await login({ email: u.email, password: "errada-errada1" }, META).catch((e) => e);
    const unknown = await login({ email: "nao-existe@example.test", password: "qualquer-coisa1" }, META).catch((e) => e);
    expect(bad).toBeInstanceOf(UnauthorizedError);
    expect(unknown).toBeInstanceOf(UnauthorizedError);
    expect(bad.message).toBe(unknown.message);
    expect(await db.auditLog.count({ where: { action: "auth.login", result: "FAILURE", userId: u.id } })).toBe(1);
  });

  it("logout e revogação invalidam a sessão; não é possível revogar sessão alheia", async () => {
    const a = await makeUser("sess-a");
    const b = await makeUser("sess-b");
    const sa = await login({ email: a.email, password: "SenhaForte123" }, META);
    const sb = await login({ email: b.email, password: "SenhaForte123" }, META);
    await expect(revokeSession(a.id, sb.sessionId, META)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getSessionByToken(sb.token)).not.toBeNull();
    await logout(sa.token, META);
    expect(await getSessionByToken(sa.token)).toBeNull();
    const s2 = await createSession(b.id, META);
    await revokeSession(b.id, s2.sessionId, META);
    expect(await getSessionByToken(s2.token)).toBeNull();
  });

  it("sessão expirada é rejeitada", async () => {
    const u = await makeUser("exp");
    const s = await createSession(u.id, META);
    await db.session.update({ where: { id: s.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getSessionByToken(s.token)).toBeNull();
  });

  it("redefinição de senha: token de uso único, revoga sessões e invalida a senha antiga", async () => {
    const u = await makeUser("reset");
    const s = await login({ email: u.email, password: "SenhaForte123" }, META);
    await requestPasswordReset(u.email, META);
    // o token só existe no e-mail; para o teste, geramos um e o inserimos como o serviço faria
    const token = "tok-reset-teste-" + Date.now();
    await db.emailToken.create({ data: { userId: u.id, type: "PASSWORD_RESET", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60000) } });
    await resetPassword(token, "NovaSenha12345", META);
    expect(await getSessionByToken(s.token)).toBeNull();
    await expect(login({ email: u.email, password: "SenhaForte123" }, META)).rejects.toBeInstanceOf(UnauthorizedError);
    await login({ email: u.email, password: "NovaSenha12345" }, META);
    await expect(resetPassword(token, "OutraSenha12345", META)).rejects.toBeInstanceOf(ValidationError);
  });

  it("cadastro com e-mail duplicado é recusado", async () => {
    const u = await makeUser("dup");
    await expect(registerUser({ name: "Outro", email: u.email, password: "SenhaForte123" }, META)).rejects.toBeInstanceOf(ConflictError);
  });
});
