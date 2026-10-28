import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { totpCode, totpStep } from "@/lib/security/totp";
import { createCaseSchema } from "@/modules/cases/schemas";
import { createCase } from "@/server/services/case.service";
import { uploadCertificate, getCertificateMaterial, assertCertificatePurpose, listCertificates, testCertificateTls } from "@/server/services/certificate.service";
import { createConnection, mtlsFor } from "@/server/services/mni.service";
import { mniAdapter } from "@/server/services/mni-petition.service";
import { startEnrollment, confirmEnrollment } from "@/server/services/mfa.service";
import { makeTestPfx } from "../fixtures/make-pfx";
import { META, makeOrgWithOwner } from "./helpers";

describe("certificado novo estritamente informacional", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let certificateId: string;
  let caseId: string;
  const pass = "senha-apenas-fixture";
  const p = { sequence: "0000011", year: "2026", segment: "4", court: "03", origin: "6100" };
  const cnj = `${p.sequence}-${computeCnjCheck(p)}.2026.4.03.6100`;
  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    a = await makeOrgWithOwner("cert-consulta");
    const enrollment = await startEnrollment(a.owner.id, a.owner.email);
    await confirmEnrollment(a.owner.id, totpCode(enrollment.secret, totpStep()), META);
    certificateId = (await uploadCertificate(a.ctx, { file: makeTestPfx({ password: pass }), password: pass, label: "Somente consulta", ownerUserId: a.owner.id })).id;
    caseId = (await createCase(a.ctx, createCaseSchema.parse({ nature: "JUDICIAL", number: cnj, legacyNumber: "", title: "Consulta sem protocolo", area: "Previdenciário", court: "TRF3", courtUnit: "", courtState: "SP", subject: "", claimValue: "", status: "ACTIVE", phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" }))).id;
    await createConnection(a.ctx, { label: "TRF3 fixture sem requisição real", jtr: "4.03", endpointUrl: "https://pje1g.trf3.jus.br/pje/intercomunicacao", authMode: "CERTIFICATE", certificateId, document: "52998224725" });
  });
  it("upload impõe somente consulta e não envia nem agenda petições", async () => {
    expect((await listCertificates(a.ctx)).find(c => c.id === certificateId)?.consultationOnly).toBe(true);
    expect(await db.petitionFiling.count({ where: { organizationId: a.org.id } })).toBe(0);
  });
  it("permite apenas as quatro finalidades de leitura conhecidas", async () => {
    for (const purpose of ["mni:wsdl", "mni:consultarAvisosPendentes", "mni:consultarProcesso", "mni:consultarProcesso:autos", "local:tls-check"]) {
      expect((await getCertificateMaterial(a.ctx, certificateId, purpose)).passphrase).toBe(pass);
    }
  });
  it("testa o certificado para TLS localmente sem alterar o cofre", async () => {
    const before = await db.certificate.findUniqueOrThrow({ where: { id: certificateId } });
    expect(await testCertificateTls(a.ctx, certificateId)).toMatchObject({ compatible: true });
    const after = await db.certificate.findUniqueOrThrow({ where: { id: certificateId } });
    expect(after.pfxEnc).toBe(before.pfxEnc); expect(after.passEnc).toBe(before.passEnc); expect(after.consultationOnly).toBe(true);
  });
  it("nega protocolo, assinatura, ciência e finalidade desconhecida antes de entregar a chave", async () => {
    const before = await db.certificateUsage.count({ where: { certificateId } });
    for (const purpose of ["mni:entregarManifestacaoProcessual", "assinar", "mni:consultarTeorComunicacao", "qualquer:outra:finalidade"]) {
      await expect(getCertificateMaterial(a.ctx, certificateId, purpose)).rejects.toThrow(/somente para consulta/);
      await expect(assertCertificatePurpose(a.ctx, certificateId, purpose)).rejects.toThrow(/somente para consulta/);
    }
    expect(await db.certificateUsage.count({ where: { certificateId } })).toBe(before);
    await expect(mtlsFor(a.ctx, certificateId, "mni:entregarManifestacaoProcessual", caseId)).rejects.toThrow(/somente para consulta/);
  });
  it("bloqueia adaptador real antes de reservar envio ou executar transporte, mesmo para administrador", async () => {
    const post = vi.fn(async () => { throw new Error("O transporte jamais deve ser chamado."); });
    const input = { petitionId: crypto.randomUUID(), caseNumber: cnj, court: "TRF3", title: "Envio proibido", document: { fileName: "peticao.pdf", mimeType: "application/pdf", sizeBytes: 4, sha256: "a".repeat(64) }, attachments: [] };
    const env = { ctx: a.ctx, caseId, post, files: { main: Buffer.from("%PDF"), attachments: [] } };
    await expect(mniAdapter.preflight!(input, env)).rejects.toThrow(/somente para consulta/);
    await expect(mniAdapter.submit(input, env)).rejects.toThrow(/somente para consulta/);
    expect(post).not.toHaveBeenCalled();
    expect(await db.petitionFiling.count({ where: { organizationId: a.org.id, status: "SUBMITTING" } })).toBe(0);
  });
});
