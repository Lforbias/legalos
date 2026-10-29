/**
 * Box 2.0 — contratos do motor de integrações judiciais.
 *
 * Princípios (não negociáveis):
 *  - Cada capacidade é independente. Um conector que consulta processos NÃO é, por isso, capaz de ler intimações,
 *    baixar documentos ou protocolar. O que não está implementado não é oferecido nem simulado.
 *  - "Implementada" (existe código) é diferente de "comprovada" (há evidência real de funcionamento naquele tribunal).
 *  - Nenhum método existe para contornar CAPTCHA, MFA ou bloqueios do tribunal. Quando é preciso uma pessoa, o
 *    resultado diz isso (`needsPerson`).
 */

export const CAPABILITIES = [
  "discover",
  "checkAvailability",
  "validateCredentials",
  "listNotices",
  "listMovements",
  "getCase",
  "listDocuments",
  "downloadDocument",
  "validateFiling",
  "submitFiling",
  "getOfficialReceipt",
  "checkFilingStatus",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Rótulos na linguagem do advogado (a tela principal nunca fala em SOAP, endpoint ou WSDL). */
export const CAPABILITY_LABEL: Record<Capability, string> = {
  discover: "Descobrir fontes disponíveis",
  checkAvailability: "Verificar se o serviço está no ar",
  validateCredentials: "Conferir o acesso (login)",
  listNotices: "Receber publicações e intimações",
  listMovements: "Acompanhar movimentações",
  getCase: "Consultar o processo",
  listDocuments: "Listar documentos dos autos",
  downloadDocument: "Baixar documentos dos autos",
  validateFiling: "Validar a petição antes do envio",
  submitFiling: "Protocolar a petição",
  getOfficialReceipt: "Obter o comprovante oficial",
  checkFilingStatus: "Conferir se o tribunal recebeu o protocolo",
};

/** Capacidades que, se falharem, impedem o monitoramento de comunicações (o que o advogado espera do Box). */
export const MONITORING_CAPABILITIES: readonly Capability[] = ["checkAvailability", "listNotices"];

export type ConnectorFamily = "DJEN" | "PJE" | "EPROC" | "ESAJ" | "PROJUDI" | "DATAJUD" | "DOMICILIO";
export type AccessMethod = "PUBLIC" | "OFFICIAL_API" | "MNI" | "PORTAL_ROBOT" | "CERTIFICATE" | "ASSISTED";
export type EvidenceEnvironment = "PRODUCTION" | "HOMOLOGATION" | "SIMULATED";

export type CapabilityStatus = {
  /** Existe código que executa esta operação. */
  implemented: boolean;
  /** Por que não (quando não implementada) ou observação importante (quando implementada). */
  note?: string;
};

export type ConnectorDescriptor = {
  /** Identificador estável do conector (ex.: "djen", "pje-portal", "pje-mni"). */
  key: string;
  /** Versão do adaptador; muda quando o contrato com a fonte muda. */
  version: string;
  family: ConnectorFamily;
  label: string;
  accessMethod: AccessMethod;
  /** true = exige credencial/certificado/autorização do próprio advogado. */
  requiresAuthorization: boolean;
  capabilities: Record<Capability, CapabilityStatus>;
  /** Limitações conhecidas, em linguagem simples. */
  limitations: string[];
};

/** Resultado de qualquer operação de um conector: sempre diz o que aconteceu, nunca "falha genérica". */
export type OperationFailure = {
  ok: false;
  code:
    | "UNAVAILABLE" // serviço fora do ar / bloqueio de rede
    | "GEO_BLOCKED" // a fonte recusa o país do servidor
    | "RATE_LIMITED"
    | "AUTH_REQUIRED" // falta credencial ou autorização
    | "AUTH_EXPIRED"
    | "AUTH_REJECTED" // a fonte recusou a credencial
    | "NEEDS_PERSON" // captcha, 2º fator ou ação humana necessária
    | "LAYOUT_CHANGED" // a interface/contrato mudou: o adaptador parou para não errar
    | "UNSUPPORTED" // a capacidade não existe neste conector
    | "INVALID_RESPONSE"
    | "TIMEOUT"
    | "INTERNAL";
  message: string;
  retryable: boolean;
  /** Quando houver, em quantos segundos tentar de novo (Retry-After). */
  retryAfterSec?: number;
};
export type OperationResult<T> = ({ ok: true } & T) | OperationFailure;

export type NoticeQuery = {
  /** Identidade profissional (OAB) cujas comunicações serão buscadas. */
  oabNumber: string;
  oabUf: string;
  /** Janela de disponibilização (YYYY-MM-DD, inclusive). */
  from: string;
  to: string;
  /** Página (1-based) quando a fonte pagina. */
  page: number;
  pageSize: number;
  /** Restringe a um tribunal (sigla), quando a fonte suporta. */
  courtCode?: string;
};

export type NoticePage = {
  items: NormalizedCommunication[];
  /** Itens que a fonte devolveu mas que não puderam ser interpretados (nunca são inventados). */
  unparsed: number;
  /** Quantos itens brutos vieram nesta página (antes de filtrar). */
  rawCount: number;
  /** Total informado pela fonte para a janela inteira, quando informa. */
  reportedTotal: number | null;
  /** Há mais páginas? */
  hasMore: boolean;
};

/** Contrato do adaptador de leitura de comunicações. Cada método é opcional: só existe o que foi implementado. */
export interface NoticeSourceAdapter {
  descriptor: ConnectorDescriptor;
  /** Pergunta mínima à fonte, com a identidade que será monitorada (nunca com a de outra pessoa). */
  checkAvailability?(probe: { oabNumber: string; oabUf: string }): Promise<OperationResult<{ latencyMs: number; detail?: string }>>;
  listNotices?(q: NoticeQuery): Promise<OperationResult<NoticePage>>;
}

// ───────── Comunicação normalizada ─────────

/**
 * Origens juridicamente distintas. NÃO são fundidas num tipo único:
 *  - publicação do DJEN (pública, efeito de publicação no Diário);
 *  - comunicação privada (intimação/citação eletrônica entregue pelo tribunal ou Domicílio, efeito próprio de ciência);
 *  - movimentação processual (andamento; não é comunicação com prazo por si só).
 */
export const COMMUNICATION_ORIGINS = ["DJEN_PUBLICATION", "PRIVATE_COMMUNICATION", "PROCESS_MOVEMENT"] as const;
export type CommunicationOrigin = (typeof COMMUNICATION_ORIGINS)[number];
export const ORIGIN_KINDS = [...COMMUNICATION_ORIGINS, "IMPORT", "MANUAL"] as const;
export type OriginKind = (typeof ORIGIN_KINDS)[number];

export const ORIGIN_LABEL: Record<OriginKind, string> = {
  DJEN_PUBLICATION: "Publicação no DJEN",
  PRIVATE_COMMUNICATION: "Comunicação eletrônica privada",
  PROCESS_MOVEMENT: "Movimentação processual",
  IMPORT: "Histórico importado",
  MANUAL: "Registro manual",
};

export type NoticeKindKey = "INTIMACAO" | "CITACAO" | "DESPACHO" | "DECISAO" | "SENTENCA" | "OUTRO";

export type NormalizedCommunication = {
  origin: CommunicationOrigin;
  /** Sistema de origem (ex.: "djen", "pje", "eproc"). */
  sourceSystem: string;
  /** Identificador oficial na fonte. Junto com `sourceSystem` forma a chave de idempotência. */
  officialId: string;
  courtCode: string | null;
  /** Número CNJ formatado e com dígito verificador válido; null quando ausente/inválido. */
  cnj: string | null;
  kind: NoticeKindKey;
  title: string;
  content: string;
  /** Data oficial de disponibilização/publicação (YYYY-MM-DD). */
  publishedOn: string | null;
  orgao: string | null;
  classe: string | null;
  link: string | null;
  cancelled: boolean;
  /** Hash do conteúdo bruto recebido (prova de integridade da captura; não contém o texto). */
  rawHash: string;
};
