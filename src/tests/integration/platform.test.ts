import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { createMonitor, runDjenAll } from "@/server/services/djen.service";
import { listUserOrganizations } from "@/server/services/organization.service";
import { integrationsHealth, listOrganizations, listPlatformAudit, listPlatformUsers, platformAccessState, platformOverview, resolvePlatformContext, setOrganizationSuspended, setUserDisabled, unlockUser, type PlatformCtx } from "@/server/services/platform.service";
import { resolveTenantContext } from "@/server/services/tenant.service";
import { META, addMember, makeOrgWithOwner, makeUser } from "./helpers";

async function enableMfa(userId: string, email: string) {
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}

describe("painel de administração da plataforma", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let pc: PlatformCtx;
  let adminId = "";
  let noMfaAdmin = "";
  let stranger: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    A = await makeOrgWithOwner("plat-A");
    B = await makeOrgWithOwner("plat-B");
    stranger = await makeUser("plat-stranger");
    const admin = await makeUser("plat-admin");
    adminId = admin.id;
    await enableMfa(admin.id, admin.email);
    await db.platformAdmin.create({ data: { userId: admin.id } });
    const weak = await makeUser("plat-weak");
    noMfaAdmin = weak.id;
    await db.platformAdmin.create({ data: { userId: weak.id } });
    pc = { userId: adminId, meta: META };
  });

  it("só super-administrador COM 2FA e ativo entra; os demais são barrados em todas as funções", async () => {
    expect(await resolvePlatformContext(adminId, META)).not.toBeNull();
    expect(await resolvePlatformContext(stranger.id)).toBeNull();
    expect(await resolvePlatformContext(noMfaAdmin)).toBeNull();
    expect(await platformAccessState(noMfaAdmin)).toBe("needs_mfa");
    expect(await platformAccessState(stranger.id)).toBe("not_admin");
    expect(await platformAccessState(adminId)).toBe("ok");
    const bad: PlatformCtx = { userId: stranger.id, meta: META };
    await expect(platformOverview(bad)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listOrganizations(bad)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listPlatformUsers(bad)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listPlatformAudit(bad)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(integrationsHealth(bad)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setOrganizationSuspended(bad, A.org.id, "motivo teste")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setUserDisabled(bad, A.owner.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(unlockUser({ userId: noMfaAdmin, meta: META }, A.owner.id)).rejects.toBeInstanceOf(ForbiddenError);
    // dono de escritório não vira admin por ser dono
    expect(await resolvePlatformContext(A.owner.id)).toBeNull();
    // admin desativado perde o acesso
    await db.user.update({ where: { id: adminId }, data: { disabledAt: new Date() } });
    expect(await resolvePlatformContext(adminId)).toBeNull();
    await db.user.update({ where: { id: adminId }, data: { disabledAt: null } });
  });

  it("visão geral e lista de escritórios trazem só contagens (sem conteúdo)", async () => {
    const o = await platformOverview(pc);
    expect(o.organizations.total).toBeGreaterThanOrEqual(2);
    expect(o.users.active).toBeGreaterThanOrEqual(3);
    expect(typeof o.users.mfaPct).toBe("number");
    const list = await listOrganizations(pc, { q: "plat-A" });
    expect(list.items.map((i) => i.id)).toContain(A.org.id);
    const row = list.items.find((i) => i.id === A.org.id)!;
    expect(row.members).toBeGreaterThanOrEqual(1);
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["clients", "cases_list", "documents"]));
    expect((await listOrganizations(pc, { status: "suspended", q: "plat-A" })).items).toHaveLength(0);
  });

  it("suspender bloqueia o escritório no servidor, avisa o motivo, para a captura automática e reativar devolve", async () => {
    await expect(setOrganizationSuspended(pc, A.org.id, "x")).rejects.toBeInstanceOf(ValidationError);
    await expect(setOrganizationSuspended(pc, randomUUID(), "inadimplência")).rejects.toBeInstanceOf(NotFoundError);
    await expect(setOrganizationSuspended(pc, A.org.id, null)).rejects.toBeInstanceOf(ConflictError);
    await createMonitor(A.ctx, { label: "Teste", oabNumber: "99999", oabUf: "BA" });
    expect(await listUserOrganizations(A.owner.id)).toHaveLength(1);

    await setOrganizationSuspended(pc, A.org.id, "inadimplência de teste");
    await expect(setOrganizationSuspended(pc, A.org.id, "de novo outra vez")).rejects.toBeInstanceOf(ConflictError);
    expect(await resolveTenantContext(A.owner.id, A.org.id, META)).toBeNull();
    expect(await listUserOrganizations(A.owner.id)).toHaveLength(0);
    expect(await resolveTenantContext(B.owner.id, B.org.id, META)).not.toBeNull(); // outro escritório intacto
    const susp = (await listOrganizations(pc, { status: "suspended", q: "plat-A" })).items[0]!;
    expect(susp.suspendedReason).toBe("inadimplência de teste");
    let called = 0;
    await runDjenAll({ http: async () => (called++, { status: 200, body: JSON.stringify({ items: [] }) }), pauseMs: 0 });
    expect(called).toBe(0);
    expect(await db.courtNotice.count({ where: { organizationId: A.org.id } })).toBe(0);

    await setOrganizationSuspended(pc, A.org.id, null);
    expect(await resolveTenantContext(A.owner.id, A.org.id, META)).not.toBeNull();
    const logs = await db.auditLog.findMany({ where: { organizationId: A.org.id, action: { startsWith: "platform." } } });
    expect(logs.map((l) => l.action).sort()).toEqual(["platform.org_reactivate", "platform.org_suspend"]);
    expect(logs.every((l) => l.userId === adminId)).toBe(true);
  });

  it("desativar usuário encerra sessões e barra o acesso; protege a si mesmo e super-admins; desbloquear funciona", async () => {
    const member = await addMember(A.org.id, "LAWYER", "plat-mem");
    await db.session.create({ data: { userId: member.ctx.userId, tokenHash: randomUUID(), activeOrganizationId: A.org.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    await expect(setUserDisabled(pc, adminId, true)).rejects.toBeInstanceOf(ConflictError);
    await expect(setUserDisabled(pc, noMfaAdmin, true)).rejects.toBeInstanceOf(ConflictError);
    await expect(setUserDisabled(pc, randomUUID(), true)).rejects.toBeInstanceOf(NotFoundError);
    await setUserDisabled(pc, member.ctx.userId, true);
    await expect(setUserDisabled(pc, member.ctx.userId, true)).rejects.toBeInstanceOf(ConflictError);
    expect(await db.session.count({ where: { userId: member.ctx.userId, revokedAt: null } })).toBe(0);
    expect(await resolveTenantContext(member.ctx.userId, A.org.id, META)).toBeNull();
    const row = (await listPlatformUsers(pc, { q: member.user.email })).items[0]!;
    expect(row).toMatchObject({ locked: false, mfa: false, isPlatformAdmin: false });
    expect(row.disabledAt).not.toBeNull();
    await setUserDisabled(pc, member.ctx.userId, false);
    expect(await resolveTenantContext(member.ctx.userId, A.org.id, META)).not.toBeNull();
    await db.user.update({ where: { id: member.ctx.userId }, data: { lockedUntil: new Date(Date.now() + 600_000), failedLoginCount: 3 } });
    expect((await listPlatformUsers(pc, { q: member.user.email })).items[0]!.locked).toBe(true);
    await unlockUser(pc, member.ctx.userId);
    expect((await listPlatformUsers(pc, { q: member.user.email })).items[0]!.locked).toBe(false);
    await expect(unlockUser(pc, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("auditoria da plataforma não expõe metadados e filtra; saúde nunca mostra valores de chaves", async () => {
    const rows = await listPlatformAudit(pc, { platformOnly: true });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.action.startsWith("platform."))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("metadata");
    expect(JSON.stringify(rows)).not.toContain("inadimplência de teste");
    expect((await listPlatformAudit(pc, { action: "auth.login", result: "SUCCESS", take: 5 })).length).toBeLessThanOrEqual(5);
    process.env.ANTHROPIC_API_KEY = "sk-ant-valor-super-secreto";
    process.env.CERT_ENCRYPTION_KEY = "chave-secreta-do-cofre-xxxxxxxxxxxxxxxx";
    const h = await integrationsHealth(pc);
    expect(h.system.database).toBe(true);
    expect(h.system.flags.find((f) => f.name.includes("ANTHROPIC"))?.configured).toBe(true);
    expect(JSON.stringify(h)).not.toContain("secreto");
    expect(JSON.stringify(h)).not.toContain("xxxxxxxx");
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CERT_ENCRYPTION_KEY;
  });
});
