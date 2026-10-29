import { CAPABILITIES, type Capability, type CapabilityStatus, type ConnectorDescriptor } from "./contracts";

/**
 * Catálogo dos conectores do Box 2.0. Cada capacidade declara SOMENTE o que existe como código.
 * Isto NÃO é cobertura: cobertura é o que há de evidência real por tribunal (veja evidence.ts).
 *
 * Revisão do registro antigo (src/lib/connectors/registry.ts): ele declarava PJe, eproc, e-SAJ e PROJUDI como
 * "consulta, importação e protocolo" de forma genérica. Aqui cada família diz exatamente o que o código faz.
 */
const none = (note?: string): CapabilityStatus => ({ implemented: false, ...(note ? { note } : {}) });
const yes = (note?: string): CapabilityStatus => ({ implemented: true, ...(note ? { note } : {}) });

function caps(over: Partial<Record<Capability, CapabilityStatus>>, reason = "Ainda não implementado neste conector."): Record<Capability, CapabilityStatus> {
  return Object.fromEntries(CAPABILITIES.map((c) => [c, over[c] ?? none(reason)])) as Record<Capability, CapabilityStatus>;
}

export const CONNECTORS: readonly ConnectorDescriptor[] = [
  {
    key: "djen",
    version: "2.0.0",
    family: "DJEN",
    label: "DJEN — Diário de Justiça Eletrônico Nacional",
    accessMethod: "PUBLIC",
    requiresAuthorization: false,
    capabilities: caps(
      {
        discover: none("O DJEN é uma fonte nacional única; as fontes por OAB são criadas automaticamente."),
        checkAvailability: yes("Consulta mínima (1 item) para saber se o serviço responde de verdade."),
        listNotices: yes("Busca por número e UF da OAB, com paginação, checkpoint e conferência do total informado."),
      },
      "O DJEN publica apenas comunicações públicas; não há consulta de autos nem protocolo por esta fonte.",
    ),
    limitations: [
      "Só publicações públicas. Intimações privadas (com ciência) não passam pelo DJEN.",
      "O serviço recusa servidores fora do Brasil; o LegalOS precisa rodar em servidor brasileiro.",
      "O contrato da API não tem documentação oficial estável: a primeira verificação real a partir do servidor registra a evidência.",
    ],
  },
  {
    key: "pje-portal",
    version: "1.0.0",
    family: "PJE",
    label: "PJe — acesso pelo login do advogado (portal)",
    accessMethod: "PORTAL_ROBOT",
    requiresAuthorization: true,
    capabilities: caps(
      { validateCredentials: yes("Login com CPF, senha e 2º fator (QR). Captcha e bloqueio param o robô.") },
      "O robô só confirma o login. A leitura de intimações, autos e protocolo pelo portal ainda não foi implementada.",
    ),
    limitations: [
      "A leitura das intimações do painel só será liberada depois de validar a tela real de cada tribunal.",
      "Login por certificado digital (A1) pelo SSO ainda não é suportado: o formato do PJeOffice não é público.",
      "Captcha, 2º fator recusado e bloqueio de conta exigem uma pessoa; o robô nunca tenta contornar.",
    ],
  },
  {
    key: "pje-mni",
    version: "1.0.0",
    family: "PJE",
    label: "PJe — Modelo Nacional de Interoperabilidade (MNI 2.2.2)",
    accessMethod: "MNI",
    requiresAuthorization: true,
    capabilities: caps({
      getCase: yes("consultarProcesso"),
      listNotices: yes("consultarAvisosPendentes (não abre o teor: abrir o teor gera ciência)."),
      listDocuments: yes("Importação dos autos pelo MNI."),
      downloadDocument: yes("Importação dos autos pelo MNI."),
      submitFiling: yes("entregarManifestacaoProcessual."),
    }),
    limitations: [
      "O MNI exige habilitação do tribunal e, em geral, liberação do IP do servidor.",
      "Nenhum tribunal real foi homologado até agora: o código foi testado só contra um tribunal simulado.",
      "Compatibilidade de contrato (WSDL) não significa conexão funcional nem permissão concedida.",
    ],
  },
  {
    key: "eproc-mni",
    version: "1.0.0",
    family: "EPROC",
    label: "eproc — via MNI 2.2.2 (onde o tribunal habilita)",
    accessMethod: "MNI",
    requiresAuthorization: true,
    capabilities: caps({
      getCase: yes("consultarProcesso, só em instâncias MNI 2.2.2."),
      listNotices: yes("consultarAvisosPendentes, só em instâncias MNI 2.2.2."),
      downloadDocument: yes("Importação dos autos, só em instâncias MNI 2.2.2."),
    }),
    limitations: [
      "O eproc tem interface própria; instâncias MNI 3.0 e serviços proprietários não são suportados.",
      "Sem robô de interface para o eproc (TRF2, TJSP etc.): ainda não implementado.",
      "Nenhuma instância homologada em tribunal real.",
    ],
  },
  {
    key: "esaj-mni",
    version: "1.0.0",
    family: "ESAJ",
    label: "e-SAJ — somente se o tribunal oferecer MNI 2.2.2",
    accessMethod: "MNI",
    requiresAuthorization: true,
    capabilities: caps({ getCase: yes("consultarProcesso, só se o tribunal oferecer este serviço."), listNotices: yes("consultarAvisosPendentes, só se o tribunal oferecer este serviço.") }),
    limitations: ["Os webservices proprietários do e-SAJ não são MNI e não são suportados.", "Nenhuma instância homologada em tribunal real."],
  },
  {
    key: "projudi-mni",
    version: "1.0.0",
    family: "PROJUDI",
    label: "PROJUDI — somente se o tribunal oferecer MNI 2.2.2",
    accessMethod: "MNI",
    requiresAuthorization: true,
    capabilities: caps({ getCase: yes("consultarProcesso, só se o tribunal oferecer este serviço."), listNotices: yes("consultarAvisosPendentes, só se o tribunal oferecer este serviço.") }),
    limitations: ["Usuário de integração e permissões variam por tribunal.", "Nenhuma instância homologada em tribunal real."],
  },
  {
    key: "esaj",
    version: "0.0.0",
    family: "ESAJ",
    label: "e-SAJ (interface própria)",
    accessMethod: "OFFICIAL_API",
    requiresAuthorization: true,
    capabilities: caps({}, "Sem conector: os webservices do e-SAJ são proprietários e não equivalem ao MNI."),
    limitations: ["Sem conector no LegalOS. Consulta e protocolo precisam ser feitos no portal do tribunal."],
  },
  {
    key: "projudi",
    version: "0.0.0",
    family: "PROJUDI",
    label: "PROJUDI (interface própria)",
    accessMethod: "OFFICIAL_API",
    requiresAuthorization: true,
    capabilities: caps({}, "Sem conector: depende de interface de cada tribunal."),
    limitations: ["Sem conector no LegalOS. Consulta e protocolo precisam ser feitos no portal do tribunal."],
  },
  {
    key: "datajud",
    version: "1.0.0",
    family: "DATAJUD",
    label: "DataJud (CNJ) — dados públicos de processos",
    accessMethod: "OFFICIAL_API",
    requiresAuthorization: false,
    capabilities: caps(
      { getCase: yes("Dados públicos do processo."), listMovements: yes("Movimentos públicos do processo.") },
      "O DataJud é base pública de dados processuais; não entrega comunicações privadas nem documentos.",
    ),
    limitations: ["Não substitui comunicações privadas autenticadas nem o teor dos autos.", "Exige chave do DataJud (do escritório ou da plataforma)."],
  },
  {
    key: "domicilio-judicial",
    version: "0.0.0",
    family: "DOMICILIO",
    label: "Domicílio Judicial Eletrônico",
    accessMethod: "OFFICIAL_API",
    requiresAuthorization: true,
    capabilities: caps({}, "Fluxo separado do DJEN, com efeitos jurídicos próprios; não há integração implementada."),
    limitations: ["Sem integração. As comunicações do Domicílio Judicial têm efeito próprio de ciência e não podem ser confundidas com o DJEN."],
  },
];

export const getConnector = (key: string) => CONNECTORS.find((c) => c.key === key) ?? null;

export const implementedCapabilities = (c: ConnectorDescriptor): Capability[] => CAPABILITIES.filter((k) => c.capabilities[k].implemented);

export const isImplemented = (connectorKey: string, cap: Capability) => Boolean(getConnector(connectorKey)?.capabilities[cap].implemented);

/** Mapeia o `system` antigo de CourtConnection (pje-mni, eproc, esaj, projudi) para o conector novo. */
export function connectorKeyForMniSystem(system: string): string {
  if (system === "pje-mni") return "pje-mni";
  if (system === "eproc") return "eproc-mni";
  if (system === "esaj") return "esaj-mni";
  if (system === "projudi") return "projudi-mni";
  return system;
}
