import { describe, expect, it } from "vitest";
import { mniEndpointProblem, TRF1_MNI_TARGETS } from "@/lib/connectors/endpoint";
describe("endereço MNI é serviço, não página de documentação", () => {
  it("recusa o Swagger da imagem, páginas HTML e login SSO", () => {
    for (const endpoint of ["https://mni-client.stg.cnj.cloud/swagger-ui/index.html", "https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth", "https://pje.trf1.jus.br/pje/login.seam", "https://example.test/docs.html", "https://example.test/soap#swagger"]) expect(mniEndpointProblem(endpoint)).toBeTruthy();
  });
  it("mantém serviços e WSDL publicados pelo TRF1 como candidatos que ainda exigem verificação", () => {
    for (const target of TRF1_MNI_TARGETS) { expect(mniEndpointProblem(target.endpointUrl)).toBeNull(); expect(mniEndpointProblem(`${target.endpointUrl}?wsdl`)).toBeNull(); }
  });
});
