import { describe, expect, it } from "vitest";
import { inspectMniContract } from "@/lib/connectors/contract";
import { connectionSupports } from "@/lib/connectors/capabilities";
import { tjprDailyPassword } from "@/lib/connectors/auth";
import { MNI_SERVICE_NS } from "@/lib/mni/xml";
const endpoint = "https://tribunal.jus.br/ws?srv=mni";
const wsdl = (ops = ["consultarProcesso"], ns = MNI_SERVICE_NS, address = endpoint) => `<definitions targetNamespace="${ns}" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"><portType name="Port">${ops.map(op => `<operation name="${op}"/>`).join("")}</portType><binding name="Binding" type="tns:Port"><soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>${ops.map(op => `<operation name="${op}"/>`).join("")}</binding><service name="Mni"><port binding="tns:Binding"><soap:address location="${address}"/></port></service></definitions>`;
describe("contratos de conectores de tribunal", () => {
  it("aceita somente operações declaradas no portType e binding do endpoint", () => {
    const r = inspectMniContract(wsdl(["consultarProcesso", "consultarAvisosPendentes"]), endpoint);
    expect(r.compatible).toBe(true); expect(r.operations).not.toContain("entregarManifestacaoProcessual");
    const extra = wsdl().replace('</definitions>', '<portType name="Outro"><operation name="entregarManifestacaoProcessual"/></portType></definitions>');
    expect(inspectMniContract(extra, endpoint).operations).toEqual(["consultarProcesso"]);
  });
  it("recusa versão, endereço, seletor de serviço, binding ou conteúdo incompatível", () => {
    expect(inspectMniContract(wsdl([], "http://www.cnj.jus.br/servico-intercomunicacao-3.0.0/"), endpoint).compatible).toBe(false);
    expect(inspectMniContract(wsdl(["consultarProcesso"], MNI_SERVICE_NS, endpoint.replace("mni", "outro")), endpoint).compatible).toBe(false);
    expect(inspectMniContract(wsdl().replace('binding="tns:Binding"', 'binding="tns:Ausente"'), endpoint).compatible).toBe(false);
    expect(inspectMniContract('<!DOCTYPE x><definitions/>', endpoint).compatible).toBe(false);
    expect(inspectMniContract("<html>Login</html>", endpoint).compatible).toBe(false);
    expect(inspectMniContract(wsdl().replace('soap/http', 'outro'), endpoint).compatible).toBe(false);
  });
  it("novos sistemas exigem contrato; legado PJe e restrições SCMPP continuam explícitos", () => {
    for (const system of ["esaj", "eproc", "projudi"]) expect(connectionSupports({ system, wsdlStatus: null, wsdlOperations: [] }, "consultarProcesso")).toBe(false);
    expect(connectionSupports({ system: "pje-mni", wsdlStatus: null, wsdlOperations: [] }, "consultarProcesso")).toBe(true);
    expect(connectionSupports({ system: "pje-mni", wsdlStatus: "INCOMPATIBLE", wsdlOperations: [] }, "consultarProcesso")).toBe(false);
    expect(connectionSupports({ system: "projudi", authProfile: "TJPR_SCMPP", wsdlStatus: "COMPATIBLE", wsdlOperations: ["consultarProcesso", "entregarManifestacaoProcessual"] }, "entregarManifestacaoProcessual")).toBe(false);
  });
  it("preserva SOAPAction e recusa cabeçalhos inseguros e contratos SOAP 1.2", () => {
    const actionXml = wsdl().replace('<operation name="consultarProcesso"/></binding>', '<operation name="consultarProcesso"><soap:operation soapAction="urn:consultar"/></operation></binding>');
    expect(inspectMniContract(actionXml, endpoint).actions).toEqual({ consultarProcesso: "urn:consultar" });
    expect(inspectMniContract(actionXml.replace("urn:consultar", "urn:invalido com espaco"), endpoint).compatible).toBe(false);
    expect(inspectMniContract(wsdl().replace('xmlns:soap=', 'xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/" xmlns:soap='), endpoint).compatible).toBe(false);
  });
  it("senha SCMPP usa a data de Brasília, inclusive na virada UTC", () => {
    expect(tjprDailyPassword("CODIGO", new Date("2026-10-24T02:59:00Z"))).toBe(tjprDailyPassword("CODIGO", new Date("2026-10-23T14:00:00Z")));
    expect(tjprDailyPassword("CODIGO", new Date("2026-10-24T03:01:00Z"))).not.toBe(tjprDailyPassword("CODIGO", new Date("2026-10-23T14:00:00Z")));
  });
});
