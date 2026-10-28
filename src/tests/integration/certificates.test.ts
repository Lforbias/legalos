import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { certStatus, listCertificateUsage, listCertificates, revokeCertificate, runCertificateExpiryCheck, uploadCertificate, getCertificateMaterial } from "@/server/services/certificate.service";
import { makeTestPfx } from "../fixtures/make-pfx";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const PASS = "senha-do-certificado";
const KEY = Buffer.alloc(32, 3).toString("base64");

async function enableMfaFor(userId: string, email: string) {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}

describe("cofre de certificados A1 (Etapa 0 do motor de tribunais)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let other: Awaited<ReturnType<typeof addMember>>;

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = KEY;
    A = await makeOrgWithOwner("cert-A");
    B = await makeOrgWithOwner("cert-B");
    lawyer = await addMember(A.org.id, "LAWYER", "cert-law");
    other = await addMember(A.org.id, "LAWYER", "cert-law2");
    const owner = await db.user.findUniqueOrThrow({ where: { id: A.ctx.userId } });
    await enableMfaFor(owner.id, owner.email);
  });

  it("permissões e pré-requisitos: sem permissão recusa; sem chave de cifra recusa; sem 2FA recusa", async () => {
    const pfx = makeTestPfx({ password: PASS });
    await expect(uploadCertificate(lawyer.ctx, { file: pfx, password: PASS, label: "x", ownerUserId: lawyer.ctx.userId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listCertificates(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    delete process.env.CERT_ENCRYPTION_KEY;
    await expect(uploadCertificate(A.ctx, { file: pfx, password: PASS, label: "x", ownerUserId: lawyer.ctx.userId })).rejects.toThrow(/CERT_ENCRYPTION_KEY/);
    process.env.CERT_ENCRYPTION_KEY = KEY;
    await expect(uploadCertificate(B.ctx, { file: pfx, password: PASS, label: "x", ownerUserId: B.ctx.userId })).rejects.toThrow(/duas etapas/);
  });

  it("valida o arquivo: senha errada, sem chave privada, vencido, titular de fora, arquivo lixo", async () => {
    const ok = makeTestPfx({ password: PASS });
    await expect(uploadCertificate(A.ctx, { file: ok, password: "errada", label: "x", ownerUserId: lawyer.ctx.userId })).rejects.toBeInstanceOf(ValidationError);
    await expect(uploadCertificate(A.ctx, { file: Buffer.from("isto não é um pfx"), password: PASS, label: "x", ownerUserId: lawyer.ctx.userId })).rejects.toBeInstanceOf(ValidationError);
    await expect(uploadCertificate(A.ctx, { file: makeTestPfx({ password: PASS, withKey: false }), password: PASS, label: "x", ownerUserId: lawyer.ctx.userId })).rejects.toThrow(/chave privada/);
    const expired = makeTestPfx({ password: PASS, notBefore: new Date(Date.now() - 400 * 86400000), notAfter: new Date(Date.now() - 86400000) });
    await expect(uploadCertificate(A.ctx, { file: expired, password: PASS, label: "x", ownerUserId: lawyer.ctx.userId })).rejects.toThrow(/vencido/);
    await expect(uploadCertificate(A.ctx, { file: ok, password: PASS, label: "x", ownerUserId: B.ctx.userId })).rejects.toThrow(/membro ativo/);
  });

  it("guarda cifrado: nada em claro no banco, listagem sem segredos, duplicado recusado, auditoria sem segredo", async () => {
    const pfx = makeTestPfx({ password: PASS, cn: "DRA TESTE:12345678909", serial: "abc123" });
    const c = await uploadCertificate(A.ctx, { file: pfx, password: PASS, label: "Dra. Teste A1", ownerUserId: lawyer.ctx.userId });
    const raw = await db.certificate.findUniqueOrThrow({ where: { id: c.id } });
    expect(raw.pfxEnc).not.toContain(pfx.toString("base64").slice(0, 40));
    expect(raw.passEnc).not.toContain(Buffer.from(PASS).toString("base64"));
    expect(raw.documentHint).toBe("***.456.789-**");
    expect(raw.documentHint).not.toContain("12345678909");

    const list = await listCertificates(A.ctx);
    const row = list.find((x) => x.id === c.id)!;
    expect(row.status).toBe("ACTIVE");
    expect(JSON.stringify(list)).not.toMatch(/pfxEnc|passEnc/);
    await expect(uploadCertificate(A.ctx, { file: pfx, password: PASS, label: "dup", ownerUserId: lawyer.ctx.userId })).rejects.toBeInstanceOf(ConflictError);

    const logs = await db.auditLog.findMany({ where: { organizationId: A.org.id, action: "certificate.upload" } });
    expect(JSON.stringify(logs)).not.toContain(PASS);
    // isolamento entre escritórios
    expect((await db.certificate.count({ where: { organizationId: B.org.id } }))).toBe(0);
  });

  it("uso: só o titular ou quem administra; registra uso; revogado/vencido/outro escritório recusam", async () => {
    const pfx = makeTestPfx({ password: PASS, serial: "use001" });
    const c = await uploadCertificate(A.ctx, { file: pfx, password: PASS, label: "Uso", ownerUserId: lawyer.ctx.userId });
    const m = await getCertificateMaterial(lawyer.ctx, c.id, "mni:consultarAvisosPendentes");
    expect(Buffer.compare(m.pfx, pfx)).toBe(0);
    expect(m.passphrase).toBe(PASS);
    await expect(getCertificateMaterial(other.ctx, c.id, "x")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCertificateMaterial(B.ctx, c.id, "x")).rejects.toBeInstanceOf(NotFoundError);
    await getCertificateMaterial(A.ctx, c.id, "mni:consultarProcesso", null);
    const usage = await listCertificateUsage(A.ctx, c.id);
    expect(usage).toHaveLength(2);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: c.id } })).lastUsedAt).not.toBeNull();

    await db.certificate.update({ where: { id: c.id }, data: { notAfter: new Date(Date.now() - 1000), notBefore: new Date(Date.now() - 86400000 * 3) } });
    await expect(getCertificateMaterial(lawyer.ctx, c.id, "x")).rejects.toThrow(/vencido/);
  });

  it("revogar apaga o material cifrado e impede o uso; segunda revogação falha; sem 2FA recusa", async () => {
    const c = await uploadCertificate(A.ctx, { file: makeTestPfx({ password: PASS, serial: "rev001" }), password: PASS, label: "Revogar", ownerUserId: lawyer.ctx.userId });
    await expect(revokeCertificate(B.ctx, c.id)).rejects.toThrow(/duas etapas/);
    await revokeCertificate(A.ctx, c.id);
    const raw = await db.certificate.findUniqueOrThrow({ where: { id: c.id } });
    expect(raw.pfxEnc).toBe("");
    expect(raw.passEnc).toBe("");
    await expect(getCertificateMaterial(A.ctx, c.id, "x")).rejects.toThrow(/revogado/);
    await expect(revokeCertificate(A.ctx, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("alerta de vencimento: avisa titular e administradores uma vez por faixa (30 e 7 dias)", async () => {
    const c = await uploadCertificate(A.ctx, { file: makeTestPfx({ password: PASS, serial: "exp001", notAfter: new Date(Date.now() + 20 * 86400000) }), password: PASS, label: "Vencendo", ownerUserId: lawyer.ctx.userId });
    expect(certStatus({ revokedAt: null, notAfter: new Date(Date.now() + 20 * 86400000) })).toBe("EXPIRING");
    const n1 = await runCertificateExpiryCheck(A.org.id);
    expect(n1).toBeGreaterThanOrEqual(2);
    expect(await runCertificateExpiryCheck(A.org.id)).toBe(0);
    expect(await db.notification.count({ where: { userId: lawyer.ctx.userId, dedupeKey: `cert-expiry:${c.id}:30` } })).toBe(1);
    await db.certificate.update({ where: { id: c.id }, data: { notAfter: new Date(Date.now() + 3 * 86400000) } });
    expect(await runCertificateExpiryCheck(A.org.id)).toBeGreaterThanOrEqual(2);
    expect(await db.notification.count({ where: { userId: lawyer.ctx.userId, dedupeKey: `cert-expiry:${c.id}:7` } })).toBe(1);
  });
});
