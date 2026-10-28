import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { prepareOfficialMniTargets } from "@/server/services/mni-catalog.service";
import { OFFICIAL_MNI_TARGETS } from "@/lib/connectors/official-targets";
import { createConnection, updateConnectionTarget, inspectConnectionContract, syncAvisos } from "@/server/services/mni.service";
import { uploadCertificate, restrictCertificateToConsultation } from "@/server/services/certificate.service";
import { startEnrollment, confirmEnrollment } from "@/server/services/mfa.service";
import { makeTestPfx } from "../fixtures/make-pfx";
import { makeOrgWithOwner, META } from "./helpers";
const valid = "https://pjehml1g.trf1.jus.br/pje/intercomunicacao";
const swagger = "https://mni-client.stg.cnj.cloud/swagger-ui/index.html";
describe("correção de destino do MNI sem enviar credenciais a Swagger", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>; let id: string; let certId: string;
  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64"); process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    a = await makeOrgWithOwner("trf1-target"); const mfa = await startEnrollment(a.owner.id, a.owner.email); await confirmEnrollment(a.owner.id, totpCode(mfa.secret, totpStep()), META);
    certId = (await uploadCertificate(a.ctx, { file: makeTestPfx({ password: "fixture" }), password: "fixture", label: "Certificado legado", ownerUserId: a.owner.id })).id;
    id = (await createConnection(a.ctx, { label: "TRF1 teste", jtr: "4.01", endpointUrl: valid, authMode: "CERTIFICATE", certificateId: certId, document: "52998224725" })).id;
    await db.courtConnection.update({ where: { id }, data: { endpointUrl: swagger, enabled: true } });
    await db.certificate.update({ where: { id: certId }, data: { consultationOnly: false } });
  });
  it("recusa novo cadastro com URL de documentação", async () => {
    await expect(createConnection(a.ctx, { label: "Inválida", jtr: "4.01", endpointUrl: swagger, authMode: "CERTIFICATE", certificateId: certId, document: "52998224725" })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.courtConnection.count({ where: { organizationId: a.org.id } })).toBe(1);
  });
  it("interrompe consulta e verificação legadas antes de usar certificado ou fazer transporte", async () => {
    const post = vi.fn(async () => ""); const fetcher = vi.fn(async () => "");
    await expect(syncAvisos(a.ctx, id, post)).rejects.toThrow(/documentação ou login/);
    await expect(inspectConnectionContract(a.ctx, id, fetcher)).rejects.toThrow(/documentação ou login/);
    expect(post).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    expect(await db.certificateUsage.count({ where: { certificateId: certId } })).toBe(0);
  });
  it("corrige destino, preserva cofre, desliga conexão e protege certificado existente", async () => {
    const before = await db.certificate.findUniqueOrThrow({ where: { id: certId } });
    await updateConnectionTarget(a.ctx, id, { endpointUrl: valid, wsdlUrl: `${valid}?wsdl`, environment: "HOMOLOGATION", jtr: "4.01" });
    expect(await db.courtConnection.findUniqueOrThrow({ where: { id } })).toMatchObject({ endpointUrl: valid, certificateId: certId, enabled: false, wsdlStatus: null, wsdlOperations: [] });
    expect(await db.certificate.findUniqueOrThrow({ where: { id: certId } })).toMatchObject({ consultationOnly: true, pfxEnc: before.pfxEnc, passEnc: before.passEnc });
    expect(await db.case.count({ where: { organizationId: a.org.id } })).toBe(0);
  });
  it("prepara o catálogo oficial sem duplicar nem ligar conexões e recusa CPF diferente do certificado", async () => {
    await expect(prepareOfficialMniTargets(a.ctx, { certificateId: certId, document: "52998224725", keys: ["tjba-1"] })).rejects.toThrow(/não corresponde/);
    const input = { certificateId: certId, document: "12345678909", keys: OFFICIAL_MNI_TARGETS.map(t => t.key) };
    const result = await prepareOfficialMniTargets(a.ctx, input);
    expect(result).toEqual({ created: OFFICIAL_MNI_TARGETS.length - 1, existing: 1 });
    const rows = await db.courtConnection.findMany({ where: { organizationId: a.org.id } });
    expect(rows).toHaveLength(OFFICIAL_MNI_TARGETS.length);
    expect(rows.every(c => !c.enabled)).toBe(true);
    expect(await prepareOfficialMniTargets(a.ctx, input)).toEqual({ created: 0, existing: OFFICIAL_MNI_TARGETS.length });
    await expect(prepareOfficialMniTargets(a.ctx, { ...input, keys: ["tribunal-inventado"] })).rejects.toThrow();
  });
  it("também permite impor somente consulta ao certificado anterior sem mudar a conexão", async () => {
    await db.certificate.update({ where: { id: certId }, data: { consultationOnly: false } });
    await restrictCertificateToConsultation(a.ctx, certId);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: certId } })).consultationOnly).toBe(true);
  });
});
