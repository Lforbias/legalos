import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { checkRequirements, COURT_SYSTEMS } from "@/lib/court-systems";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { sealBytes } from "@/lib/security/pfx";
import { totpCode, totpStep } from "@/lib/security/totp";
import { revokeCertificate, uploadCertificate, authorizeCertificateUser, listUsableCertificates } from "@/server/services/certificate.service";
import { deleteCredential, listMyCredentials, listOrgCredentials, resolveMyCredential, saveMyCredential, verifyMyCredential } from "@/server/services/court-credential.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { loadConnection } from "@/server/services/mni.service";
import { makeTestPfx } from "../fixtures/make-pfx";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const KEY = Buffer.alloc(32, 3).toString("base64");
const PASS = "senha-do-certificado";
const CPF = "52998224725";
const CPF2 = "11144477735";

async function enableMfaFor(userId: string, email: string) {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}

describe("3.0-F6b — credenciais por tribunal e usuário", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let beto: Awaited<ReturnType<typeof addMember>>;
  let noMfa: Awaited<ReturnType<typeof addMember>>;
  let certId: string;

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = KEY;
    A = await makeOrgWithOwner("l3f6b-a");
    B = await makeOrgWithOwner("l3f6b-b");
    ana = await addMember(A.org.id, "LAWYER", "l3f6b-ana");
    beto = await addMember(A.org.id, "LAWYER", "l3f6b-beto");
    noMfa = await addMember(A.org.id, "LAWYER", "l3f6b-nomfa");
    for (const m of [A.ctx, ana.ctx, beto.ctx]) {
      const u = await db.user.findUniqueOrThrow({ where: { id: m.userId } });
      await enableMfaFor(u.id, u.email);
    }
    const bo = await db.user.findUniqueOrThrow({ where: { id: B.ctx.userId } });
    await enableMfaFor(bo.id, bo.email);
    certId = (await uploadCertificate(A.ctx, { file: makeTestPfx({ password: PASS, cn: "ANA:52998224725", serial: "6b0001" }), password: PASS, label: "A1 da Ana", ownerUserId: ana.ctx.userId })).id;
  });

  it("registro de sistemas: confere o que cada um exige, sem acessar tribunal", () => {
    expect(COURT_SYSTEMS.find((s) => s.key === "pje-mni")?.connector).toBe(true);
    expect(checkRequirements({ system: "pje-mni", authMode: "PASSWORD", document: CPF, password: "x" })).toEqual([]);
    expect(checkRequirements({ system: "pje-mni", authMode: "PASSWORD", document: CPF })).toContain("Falta a senha.");
    expect(checkRequirements({ system: "esaj", authMode: "PASSWORD", document: CPF, password: "x" }).join(" ")).toMatch(/não aceita/);
    expect(checkRequirements({ system: "pje-mni", authMode: "CERTIFICATE", document: "123" })).toEqual(expect.arrayContaining(["CPF/CNPJ inválido.", "Falta escolher o certificado do cofre."]));
    expect(checkRequirements({ system: "nada", authMode: "PASSWORD", document: CPF, password: "x" })).toEqual(["Sistema de tribunal desconhecido."]);
  });

  it("guardar exige cofre configurado, 2FA e dados válidos", async () => {
    const ok = { system: "pje-mni", authMode: "PASSWORD", document: CPF, password: "s3nha" };
    await expect(saveMyCredential(noMfa.ctx, ok)).rejects.toBeInstanceOf(ConflictError);
    delete process.env.CERT_ENCRYPTION_KEY;
    await expect(saveMyCredential(ana.ctx, ok)).rejects.toThrow(/CERT_ENCRYPTION_KEY/);
    process.env.CERT_ENCRYPTION_KEY = KEY;
    await expect(saveMyCredential(ana.ctx, { ...ok, system: "xx" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveMyCredential(ana.ctx, { ...ok, courtCode: "9.99" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveMyCredential(ana.ctx, { ...ok, document: "123" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveMyCredential(ana.ctx, { ...ok, password: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveMyCredential(ana.ctx, { ...ok, system: "esaj" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("guarda cifrado; a listagem nunca traz senha; salvar de novo substitui; cada um vê só o seu", async () => {
    await saveMyCredential(ana.ctx, { system: "pje-mni", courtCode: "8.05", authMode: "PASSWORD", document: CPF, password: "SENHA-SECRETA-123" });
    const raw = await db.courtCredential.findFirstOrThrow({ where: { userId: ana.ctx.userId } });
    expect(raw.secretEnc).not.toContain("SENHA-SECRETA-123");
    expect(raw.secretEnc).not.toContain(Buffer.from("SENHA-SECRETA-123").toString("base64"));
    const mine = await listMyCredentials(ana.ctx);
    expect(mine).toHaveLength(1);
    expect(JSON.stringify(mine)).not.toMatch(/SENHA-SECRETA|secretEnc/);
    expect(mine[0]!.documentHint).toBe("CPF final 25");
    await saveMyCredential(ana.ctx, { system: "pje-mni", courtCode: "8.05", authMode: "PASSWORD", document: CPF, password: "outra-senha" });
    expect(await listMyCredentials(ana.ctx)).toHaveLength(1); // substituiu
    expect(await listMyCredentials(beto.ctx)).toHaveLength(0);
    await expect(listOrgCredentials(ana.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    const org = await listOrgCredentials(A.ctx);
    expect(org.map((c) => c.userId)).toEqual([ana.ctx.userId]);
    expect(JSON.stringify(org)).not.toMatch(/outra-senha|secretEnc/);
    expect(await listOrgCredentials(B.ctx)).toHaveLength(0); // outro escritório
  });

  it("certificado: só quem pode usar escolhe; autorização libera; revogado deixa a credencial pendente", async () => {
    const withCert = { system: "pje-mni", courtCode: "4.01", authMode: "CERTIFICATE", document: CPF2, certificateId: certId };
    expect(await listUsableCertificates(beto.ctx)).toHaveLength(0);
    await expect(saveMyCredential(beto.ctx, withCert)).rejects.toBeInstanceOf(NotFoundError);
    await authorizeCertificateUser(A.ctx, certId, beto.ctx.userId);
    expect((await listUsableCertificates(beto.ctx)).map((c) => c.id)).toEqual([certId]);
    const c = await saveMyCredential(beto.ctx, withCert);
    expect(await verifyMyCredential(beto.ctx, c.id)).toMatchObject({ status: "PRONTA" });
    await expect(verifyMyCredential(ana.ctx, c.id)).rejects.toBeInstanceOf(NotFoundError); // não confere a dos outros
    const eproc = await saveMyCredential(beto.ctx, { system: "eproc", authMode: "PASSWORD", document: CPF2, password: "x" });
    expect(await verifyMyCredential(beto.ctx, eproc.id)).toMatchObject({ status: "SEM_CONECTOR" });
    await revokeCertificate(A.ctx, certId);
    const after = await verifyMyCredential(beto.ctx, c.id);
    expect(after.status).toBe("PENDENTE");
    expect(after.message).toMatch(/revogado/);
  });

  it("a do tribunal exato vale mais que a geral; quem não tem recebe null; a conexão pessoal só vale em ação pessoal", async () => {
    await saveMyCredential(beto.ctx, { system: "pje-mni", courtCode: "", authMode: "PASSWORD", document: CPF, password: "geral" });
    await saveMyCredential(beto.ctx, { system: "pje-mni", courtCode: "8.26", authMode: "PASSWORD", document: CPF2, password: "tjsp" });
    expect((await resolveMyCredential(beto.ctx, "pje-mni", "8.26"))?.secret.password).toBe("tjsp");
    expect((await resolveMyCredential(beto.ctx, "pje-mni", "8.05"))?.secret.password).toBe("geral");
    expect(await resolveMyCredential(noMfa.ctx, "pje-mni", "8.26")).toBeNull();
    expect(await resolveMyCredential(B.ctx, "pje-mni", "8.26")).toBeNull();

    const conn = await db.courtConnection.create({ data: { organizationId: A.org.id, label: "TJSP", jtr: "8.26", endpointUrl: "https://pje.example.jus.br/mni", authMode: "PASSWORD", secretEnc: sealBytes(Buffer.from(JSON.stringify({ document: CPF, password: "do-escritorio" })), Buffer.from(KEY, "base64")) } });
    const personal = await loadConnection(beto.ctx, conn.id, { personal: true });
    expect(personal.personal).toBe(true);
    expect(personal.secret.password).toBe("tjsp");
    const robot = await loadConnection(beto.ctx, conn.id); // rotina automática
    expect(robot.personal).toBe(false);
    expect(robot.secret.password).toBe("do-escritorio");
    const noCred = await loadConnection(ana.ctx, conn.id, { personal: true }); // Ana não tem para 8.26 (a dela é 8.05)
    expect(noCred.personal).toBe(false);
    expect(noCred.secret.password).toBe("do-escritorio");
  });

  it("remover: o dono remove a sua; outro não; administrador de integrações remove a de qualquer um", async () => {
    const c = await db.courtCredential.findFirstOrThrow({ where: { userId: ana.ctx.userId } });
    await expect(deleteCredential(beto.ctx, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteCredential(B.ctx, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteCredential(A.ctx, c.id);
    expect(await listMyCredentials(ana.ctx)).toHaveLength(0);
    const mine = await db.courtCredential.findFirstOrThrow({ where: { userId: beto.ctx.userId } });
    await deleteCredential(beto.ctx, mine.id);
    await expect(deleteCredential(beto.ctx, mine.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
