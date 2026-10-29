import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import {
  assertCertificatePurpose,
  authorizeCertificateUser,
  enableCertificateSigning,
  getCertificateMaterial,
  listAuthorizedUsers,
  restrictCertificateToConsultation,
  setCertificateSigner,
  unauthorizeCertificateUser,
  uploadCertificate,
} from "@/server/services/certificate.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { makeTestPfx } from "../fixtures/make-pfx";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const PASS = "senha-do-certificado";
const SIGN = "mni:entregarManifestacaoProcessual";
const READ = "mni:consultarProcesso";

async function mfaFor(userId: string, email: string) {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}

describe("Box 2.0 — certificado: consultar e assinar são poderes independentes", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let titular: Awaited<ReturnType<typeof addMember>>; // titular do certificado (advogado)
  let colega: Awaited<ReturnType<typeof addMember>>; // advogado autorizado só para consulta
  let admin: Awaited<ReturnType<typeof addMember>>; // administra o cofre, mas não é titular nem autorizado
  let controller: Awaited<ReturnType<typeof addMember>>; // sem permissão de assinar
  let certId: string;

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    A = await makeOrgWithOwner("bx2cert-a");
    B = await makeOrgWithOwner("bx2cert-b");
    titular = await addMember(A.org.id, "LAWYER", "bx2cert-tit");
    colega = await addMember(A.org.id, "LAWYER", "bx2cert-col");
    admin = await addMember(A.org.id, "ADMIN", "bx2cert-adm");
    controller = await addMember(A.org.id, "CONTROLLER", "bx2cert-ctl");
    for (const c of [A.ctx, admin.ctx, B.ctx]) {
      const u = await db.user.findUniqueOrThrow({ where: { id: c.userId } });
      await mfaFor(u.id, u.email);
    }
    certId = (await uploadCertificate(A.ctx, { file: makeTestPfx({ password: PASS, cn: "ADV BX2:12345678909", serial: "bx2-serial" }), password: PASS, label: "A1 Dra. Talita", ownerUserId: titular.ctx.userId })).id;
    await authorizeCertificateUser(A.ctx, certId, colega.ctx.userId);
    await authorizeCertificateUser(A.ctx, certId, controller.ctx.userId);
  });

  it("o perfil novo existe e o proprietário e o administrador o recebem; advogado e controladoria não", async () => {
    expect(A.ctx.permissions.has("certificates:sign")).toBe(true);
    expect(admin.ctx.permissions.has("certificates:sign")).toBe(true);
    expect(titular.ctx.permissions.has("certificates:sign")).toBe(false);
    expect(controller.ctx.permissions.has("certificates:sign")).toBe(false);
  });

  it("certificado novo: consulta liberada para titular, autorizado e administrador; assinar bloqueado para todos", async () => {
    for (const who of [titular, colega, admin, A]) expect((await getCertificateMaterial(who.ctx, certId, READ)).passphrase).toBe(PASS);
    const before = await db.certificateUsage.count({ where: { certificateId: certId } });
    for (const who of [titular, colega, admin, A]) {
      await expect(getCertificateMaterial(who.ctx, certId, SIGN)).rejects.toThrow(/somente para consulta/);
      await expect(assertCertificatePurpose(who.ctx, certId, SIGN)).rejects.toThrow(/somente para consulta/);
    }
    expect(await db.certificateUsage.count({ where: { certificateId: certId } })).toBe(before); // bloqueio acontece ANTES de entregar o segredo e de registrar uso
  });

  it("liberar exige permissão de assinar, 2FA e a digitação do nome; quem administra sem permissão de assinar não consegue", async () => {
    // advogado (titular) não tem certificates:manage nem :sign
    await expect(enableCertificateSigning(titular.ctx, certId, "A1 Dra. Talita")).rejects.toBeInstanceOf(ForbiddenError);
    // perfil personalizado que só administra o cofre
    const custom = await db.role.create({ data: { organizationId: A.org.id, key: "COFRE_SO", name: "Cofre sem assinar", permissions: ["certificates:manage", "members:read"], isSystem: false } });
    const cofre = await addMember(A.org.id, "ASSISTANT", "bx2cert-cofre");
    await db.membership.update({ where: { id: cofre.membership.id }, data: { roleId: custom.id } });
    const { resolveTenantContext } = await import("@/server/services/tenant.service");
    const cofreCtx = (await resolveTenantContext(cofre.user.id, A.org.id, META))!;
    const u = await db.user.findUniqueOrThrow({ where: { id: cofre.user.id } });
    await mfaFor(u.id, u.email);
    await expect(enableCertificateSigning(cofreCtx, certId, "A1 Dra. Talita")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setCertificateSigner(cofreCtx, certId, colega.ctx.userId, true)).rejects.toBeInstanceOf(ForbiddenError);
    // nome errado
    await expect(enableCertificateSigning(A.ctx, certId, "outro nome")).rejects.toBeInstanceOf(ValidationError);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: certId } })).consultationOnly).toBe(true);
    // outro escritório não enxerga o certificado
    await expect(enableCertificateSigning(B.ctx, certId, "A1 Dra. Talita")).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: certId } })).consultationOnly).toBe(true);
  });

  it("sem 2FA a liberação é recusada", async () => {
    const semMfa = await addMember(A.org.id, "ADMIN", "bx2cert-sem2fa");
    await expect(enableCertificateSigning(semMfa.ctx, certId, "A1 Dra. Talita")).rejects.toBeInstanceOf(ConflictError);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: certId } })).consultationOnly).toBe(true);
  });

  it("liberado: o titular assina; consulta continua igual; ciência e finalidades desconhecidas seguem proibidas", async () => {
    await enableCertificateSigning(A.ctx, certId, "A1 Dra. Talita");
    const c = await db.certificate.findUniqueOrThrow({ where: { id: certId } });
    expect(c.consultationOnly).toBe(false);
    expect(c.signingEnabledAt).not.toBeNull();
    expect(c.signingEnabledById).toBe(A.ctx.userId);
    expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "certificate.enable_signing", resourceId: certId } })).toBe(1);
    await expect(enableCertificateSigning(A.ctx, certId, "A1 Dra. Talita")).rejects.toBeInstanceOf(ConflictError); // já liberado

    // titular SEM a permissão de perfil não assina, mesmo sendo o titular
    await expect(getCertificateMaterial(titular.ctx, certId, SIGN)).rejects.toThrow(/permissão para assinar/);
    // dar a permissão de perfil ao titular (perfil advogado + assinar) e ele passa a assinar
    const role = await db.role.findFirstOrThrow({ where: { organizationId: A.org.id, key: "LAWYER" } });
    const withSign = await db.role.create({ data: { organizationId: A.org.id, key: "ADV_ASSINA", name: "Advogado que assina", permissions: [...role.permissions, "certificates:sign"], isSystem: false } });
    await db.membership.update({ where: { id: titular.membership.id }, data: { roleId: withSign.id } });
    const { resolveTenantContext } = await import("@/server/services/tenant.service");
    const titularCtx = (await resolveTenantContext(titular.user.id, A.org.id, META))!;
    expect((await getCertificateMaterial(titularCtx, certId, SIGN)).passphrase).toBe(PASS);
    expect(await db.certificateUsage.count({ where: { certificateId: certId, userId: titular.user.id, purpose: SIGN } })).toBe(1);

    for (const purpose of ["mni:consultarTeorComunicacao", "assinar", "ciencia", "qualquer:outra"]) {
      await expect(getCertificateMaterial(titularCtx, certId, purpose)).rejects.toThrow(/Esta finalidade não é permitida/);
    }
    expect((await getCertificateMaterial(colega.ctx, certId, READ)).passphrase).toBe(PASS);
  });

  it("quem só administra o cofre (nem titular nem autorizado) consulta mas não assina", async () => {
    expect((await getCertificateMaterial(admin.ctx, certId, READ)).passphrase).toBe(PASS);
    await expect(getCertificateMaterial(admin.ctx, certId, SIGN)).rejects.toThrow(/não foi autorizado a assinar/);
    await expect(getCertificateMaterial(A.ctx, certId, SIGN)).rejects.toThrow(/não foi autorizado a assinar/); // proprietário idem: precisa ser titular ou autorizado com poder de assinar
  });

  it("autorizado só passa a assinar com o poder concedido (e só se o perfil dele permitir)", async () => {
    // colega é advogado (sem :sign no perfil): conceder é recusado
    await expect(setCertificateSigner(A.ctx, certId, colega.ctx.userId, true)).rejects.toBeInstanceOf(ValidationError);
    // administrador autorizado a consultar + poder de assinar
    await authorizeCertificateUser(A.ctx, certId, admin.ctx.userId);
    expect((await listAuthorizedUsers(A.ctx, certId)).find((x) => x.userId === admin.ctx.userId)?.canSign).toBe(false);
    await setCertificateSigner(A.ctx, certId, admin.ctx.userId, true);
    expect((await listAuthorizedUsers(A.ctx, certId)).find((x) => x.userId === admin.ctx.userId)?.canSign).toBe(true);
    expect((await getCertificateMaterial(admin.ctx, certId, SIGN)).passphrase).toBe(PASS);
    // retirar o poder bloqueia de novo, sem mexer na consulta
    await setCertificateSigner(A.ctx, certId, admin.ctx.userId, false);
    await expect(getCertificateMaterial(admin.ctx, certId, SIGN)).rejects.toThrow(/não foi autorizado a assinar/);
    expect((await getCertificateMaterial(admin.ctx, certId, READ)).passphrase).toBe(PASS);
    // quem não está autorizado não recebe poder
    await expect(setCertificateSigner(A.ctx, certId, A.ctx.userId, false)).rejects.toBeInstanceOf(NotFoundError);
    // outro escritório
    await expect(setCertificateSigner(B.ctx, certId, admin.ctx.userId, true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("voltar para somente consulta bloqueia tudo de imediato e zera o poder de assinar dos autorizados", async () => {
    await setCertificateSigner(A.ctx, certId, admin.ctx.userId, true);
    await restrictCertificateToConsultation(A.ctx, certId);
    const c = await db.certificate.findUniqueOrThrow({ where: { id: certId } });
    expect(c.consultationOnly).toBe(true);
    expect(c.signingEnabledAt).toBeNull();
    expect((await listAuthorizedUsers(A.ctx, certId)).every((x) => x.canSign === false)).toBe(true);
    for (const who of [A, admin, titular]) await expect(getCertificateMaterial(who.ctx, certId, SIGN)).rejects.toThrow(/somente para consulta/);
    // para assinar de novo é preciso repetir o ato explícito, e conceder o poder novamente
    await expect(setCertificateSigner(A.ctx, certId, admin.ctx.userId, true)).rejects.toBeInstanceOf(ConflictError);
  });

  it("auditoria registra liberação, concessão, tentativa bloqueada e nunca guarda segredo", async () => {
    const rows = await db.auditLog.findMany({ where: { organizationId: A.org.id, resourceType: "certificate", resourceId: certId } });
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ["certificate.enable_signing", "certificate.signer_grant", "certificate.signer_revoke", "certificate.restrict_consultation", "certificate.use_blocked"]) expect(actions.has(a), a).toBe(true);
    const blocked = rows.filter((r) => r.action === "certificate.use_blocked").map((r) => JSON.stringify(r.metadata));
    expect(blocked.some((m) => m.includes("NOT_A_SIGNER"))).toBe(true);
    expect(blocked.some((m) => m.includes("CONSULTATION_ONLY"))).toBe(true);
    const all = JSON.stringify(rows.map((r) => r.metadata));
    expect(all).not.toContain(PASS);
    // outro escritório não vê nada disso
    expect(await db.auditLog.count({ where: { organizationId: B.org.id, resourceId: certId } })).toBe(0);
  });

  it("remover a autorização apaga também o poder de assinar", async () => {
    await enableCertificateSigning(A.ctx, certId, "A1 Dra. Talita");
    await setCertificateSigner(A.ctx, certId, admin.ctx.userId, true);
    await unauthorizeCertificateUser(A.ctx, certId, admin.ctx.userId);
    await authorizeCertificateUser(A.ctx, certId, admin.ctx.userId);
    expect((await listAuthorizedUsers(A.ctx, certId)).find((x) => x.userId === admin.ctx.userId)?.canSign).toBe(false);
  });
});
