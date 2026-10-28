/** Human-facing page URLs cannot receive SOAP or the lawyer's certificate. */
export function mniEndpointProblem(raw: string): string | null {
  try {
    const url = new URL(raw);
    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (/swagger|api-docs|redoc|openid-connect|\/auth\/realms|\/login(?:\.|\/|$)|\.(?:html?|pdf)$/.test(path)) return "Esse endereço é uma página de documentação ou login, não o serviço MNI SOAP do tribunal. Informe o endpoint de intercomunicação e seu WSDL oficiais.";
    if (url.hash) return "O endereço do serviço MNI não deve conter fragmento de uma página de documentação.";
    return null;
  } catch { return "Endereço do serviço MNI inválido."; }
}
export const TRF1_MNI_SOURCE = "https://www.trf1.jus.br/trf1/conteudo/NUGTI/MNI_Orienta%C3%A7%C3%B5es.pdf";
export const TRF1_MNI_TARGETS = [
  { key: "hml1g", label: "TRF1 · Homologação HML1 · 1º grau", environment: "HOMOLOGATION", endpointUrl: "https://pjehml1g.trf1.jus.br/pje/intercomunicacao" },
  { key: "hml2g", label: "TRF1 · Homologação HML1 · 2º grau", environment: "HOMOLOGATION", endpointUrl: "https://pjehml2g.trf1.jus.br/pje/intercomunicacao" },
  { key: "prod1g", label: "TRF1 · Produção · 1º grau", environment: "PRODUCTION", endpointUrl: "https://pje1g.trf1.jus.br/pje/intercomunicacao" },
  { key: "prod2g", label: "TRF1 · Produção · 2º grau", environment: "PRODUCTION", endpointUrl: "https://pje2g.trf1.jus.br/pje/intercomunicacao" },
] as const;
