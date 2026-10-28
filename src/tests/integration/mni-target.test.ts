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
import { MniError, MNI_SERVICE_NS } from "@/lib/mni/xml";
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
  it("registra falha de WSDL sem alegar sincronização, apagar contrato anterior ou alterar processos", async () => {
    const at = new Date("2026-10-01T10:00:00Z");
    await db.courtConnection.update({ where: { id }, data: { wsdlStatus: "COMPATIBLE", wsdlCheckedAt: at, wsdlOperations: ["consultarProcesso"], lastSyncAt: null } });
    const fetcher = vi.fn(async () => { throw new MniError("O tribunal bloqueou o IP de saída do servidor (HTTP 403)."); });
    await expect(inspectConnectionContract(a.ctx, id, fetcher)).rejects.toThrow(/bloqueou o IP/);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await db.courtConnection.findUniqueOrThrow({ where: { id } })).toMatchObject({ lastStatus: "ERROR", lastMessage: expect.stringMatching(/^Verificação WSDL:.*bloqueou o IP/), lastSyncAt: null, wsdlStatus: "COMPATIBLE", wsdlCheckedAt: at, enabled: false });
    expect(await db.auditLog.count({ where: { resourceId: id, action: "court_connection.contract_check_failed" } })).toBe(1);
    expect(await db.courtNotice.count({ where: { organizationId: a.org.id } })).toBe(0);
    expect(await db.case.count({ where: { organizationId: a.org.id } })).toBe(0);
  });
  it("limpa o erro após recuperar o WSDL, sem alegar acesso autenticado ou ativar a conexão", async () => {
    const wsdl = `<definitions targetNamespace="${MNI_SERVICE_NS}" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"><portType name="Port"><operation name="consultarProcesso"/></portType><binding name="Binding" type="tns:Port"><soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/><operation name="consultarProcesso"/></binding><service name="Mni"><port binding="tns:Binding"><soap:address location="${valid}"/></port></service></definitions>`;
    expect(await inspectConnectionContract(a.ctx, id, async () => wsdl)).toMatchObject({ compatible: true });
    expect(await db.courtConnection.findUniqueOrThrow({ where: { id } })).toMatchObject({ enabled: false, lastMessage: null, lastStatus: "PENDING", lastSyncAt: null, wsdlStatus: "COMPATIBLE" });
  });
});
