/**
 * Catálogo nacional de tribunais — 91 órgãos jurisdicionais + 4 instituições de referência.
 *
 * O catálogo é uma lista de COBERTURA a desenvolver. Figurar aqui não significa que o
 * LegalOS já acessa o portal. O campo `integrationStatus` distingue claramente o que
 * tem adaptador real, o que está apenas cadastrado e o que depende de acesso autorizado.
 *
 * Fontes:
 *  - Catálogo oficial do CNJ: https://www.cnj.jus.br/poder-judiciario/tribunais/.
 *  - Os motores foram identificados pelos portais públicos; onde não foi possível confirmar,
 *    `engine` é null e `engineSource` explica.
 *
 * Atualização: edite este arquivo e adicione `verifiedAt` / `verifiedSource` quando a
 * informação mudar. A arquitetura dos robôs não depende deste catálogo: os adaptadores
 * registram-se pelo `connectorKey` em catalog.ts.
 */

// ────────── Tipos ──────────

export type CourtBranch =
  | "ESTADUAL"
  | "FEDERAL"
  | "TRABALHO"
  | "ELEITORAL"
  | "MILITAR_ESTADUAL"
  | "SUPERIOR"
  | "REFERENCIA";

export type CourtDegree = "1" | "2" | "TR" | "ORIGINARIO";

export type CourtEngine = "PJE" | "EPROC" | "ESAJ" | "PROJUDI" | "PROPRIO" | null;

export type IntegrationStatus =
  | "NOT_STARTED"
  | "CATALOG_ONLY"
  | "ADAPTER_WIP"
  | "ADAPTER_READY"
  | "PILOT"
  | "OPERATIONAL";

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  NOT_STARTED: "Não iniciada",
  CATALOG_ONLY: "Apenas cadastrado",
  ADAPTER_WIP: "Adaptador em desenvolvimento",
  ADAPTER_READY: "Adaptador pronto (não habilitado)",
  PILOT: "Piloto controlado",
  OPERATIONAL: "Operacional (com evidência)",
};

export type CourtEntry = {
  code: string;
  name: string;
  branch: CourtBranch;
  ufs: string[];
  degrees: CourtDegree[];
  portalUrl: string | null;
  engine: CourtEngine;
  engineSource: string | null;
  integrationStatus: IntegrationStatus;
  verifiedAt: string | null;
  verifiedSource: string | null;
};

// ────────── Justiça Estadual (27) ──────────

const ESTADUAIS: CourtEntry[] = [
  { code: "TJAC", name: "Tribunal de Justiça do Acre", branch: "ESTADUAL", ufs: ["AC"], degrees: ["1", "2"], portalUrl: "https://www.tjac.jus.br", engine: "EPROC", engineSource: "Portal público do TJAC", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJAL", name: "Tribunal de Justiça de Alagoas", branch: "ESTADUAL", ufs: ["AL"], degrees: ["1", "2"], portalUrl: "https://www.tjal.jus.br", engine: "PJE", engineSource: "Portal público do TJAL", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJAP", name: "Tribunal de Justiça do Amapá", branch: "ESTADUAL", ufs: ["AP"], degrees: ["1", "2"], portalUrl: "https://www.tjap.jus.br", engine: "PJE", engineSource: "Portal público do TJAP", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJAM", name: "Tribunal de Justiça do Amazonas", branch: "ESTADUAL", ufs: ["AM"], degrees: ["1", "2"], portalUrl: "https://www.tjam.jus.br", engine: "PJE", engineSource: "Portal público do TJAM", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJBA", name: "Tribunal de Justiça da Bahia", branch: "ESTADUAL", ufs: ["BA"], degrees: ["1", "2"], portalUrl: "https://www.tjba.jus.br", engine: "PJE", engineSource: "Portal público do TJBA", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJCE", name: "Tribunal de Justiça do Ceará", branch: "ESTADUAL", ufs: ["CE"], degrees: ["1", "2"], portalUrl: "https://www.tjce.jus.br", engine: "PJE", engineSource: "Portal público do TJCE", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJDFT", name: "Tribunal de Justiça do Distrito Federal e dos Territórios", branch: "ESTADUAL", ufs: ["DF"], degrees: ["1", "2"], portalUrl: "https://www.tjdft.jus.br", engine: "PJE", engineSource: "Portal público do TJDFT", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJES", name: "Tribunal de Justiça do Espírito Santo", branch: "ESTADUAL", ufs: ["ES"], degrees: ["1", "2"], portalUrl: "https://www.tjes.jus.br", engine: "PJE", engineSource: "Portal público do TJES", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJGO", name: "Tribunal de Justiça de Goiás", branch: "ESTADUAL", ufs: ["GO"], degrees: ["1", "2"], portalUrl: "https://www.tjgo.jus.br", engine: "PJE", engineSource: "Portal público do TJGO", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJMA", name: "Tribunal de Justiça do Maranhão", branch: "ESTADUAL", ufs: ["MA"], degrees: ["1", "2"], portalUrl: "https://www.tjma.jus.br", engine: "PJE", engineSource: "Portal público do TJMA", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJMT", name: "Tribunal de Justiça de Mato Grosso", branch: "ESTADUAL", ufs: ["MT"], degrees: ["1", "2"], portalUrl: "https://www.tjmt.jus.br", engine: "PJE", engineSource: "Portal público do TJMT", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJMS", name: "Tribunal de Justiça de Mato Grosso do Sul", branch: "ESTADUAL", ufs: ["MS"], degrees: ["1", "2"], portalUrl: "https://www.tjms.jus.br", engine: "ESAJ", engineSource: "Portal público do TJMS usa e-SAJ", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJMG", name: "Tribunal de Justiça de Minas Gerais", branch: "ESTADUAL", ufs: ["MG"], degrees: ["1", "2"], portalUrl: "https://www.tjmg.jus.br", engine: "EPROC", engineSource: "eproc em implantação; PJe legado permanece para parte do acervo", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "Portal público do TJMG" },
  { code: "TJPA", name: "Tribunal de Justiça do Pará", branch: "ESTADUAL", ufs: ["PA"], degrees: ["1", "2"], portalUrl: "https://www.tjpa.jus.br", engine: "PJE", engineSource: "Portal público do TJPA", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJPB", name: "Tribunal de Justiça da Paraíba", branch: "ESTADUAL", ufs: ["PB"], degrees: ["1", "2"], portalUrl: "https://www.tjpb.jus.br", engine: "PJE", engineSource: "Portal público do TJPB", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJPR", name: "Tribunal de Justiça do Paraná", branch: "ESTADUAL", ufs: ["PR"], degrees: ["1", "2"], portalUrl: "https://www.tjpr.jus.br", engine: "PROJUDI", engineSource: "O Projudi exige certificado A3 em token/cartão; o LegalOS ainda não tem a ponte local necessária para esse certificado.", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "Portal oficial do Projudi TJPR" },
  { code: "TJPE", name: "Tribunal de Justiça de Pernambuco", branch: "ESTADUAL", ufs: ["PE"], degrees: ["1", "2"], portalUrl: "https://www.tjpe.jus.br", engine: "PJE", engineSource: "Portal público do TJPE", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJPI", name: "Tribunal de Justiça do Piauí", branch: "ESTADUAL", ufs: ["PI"], degrees: ["1", "2"], portalUrl: "https://www.tjpi.jus.br", engine: "PJE", engineSource: "Portal público do TJPI", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJRJ", name: "Tribunal de Justiça do Rio de Janeiro", branch: "ESTADUAL", ufs: ["RJ"], degrees: ["1", "2"], portalUrl: "https://www.tjrj.jus.br", engine: "EPROC", engineSource: "eproc nas novas distribuições cíveis; PJe e DCP permanecem como legado", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "Portal público do TJRJ" },
  { code: "TJRN", name: "Tribunal de Justiça do Rio Grande do Norte", branch: "ESTADUAL", ufs: ["RN"], degrees: ["1", "2"], portalUrl: "https://www.tjrn.jus.br", engine: "PJE", engineSource: "Portal público do TJRN", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJRS", name: "Tribunal de Justiça do Rio Grande do Sul", branch: "ESTADUAL", ufs: ["RS"], degrees: ["1", "2"], portalUrl: "https://www.tjrs.jus.br", engine: "EPROC", engineSource: "Portal público do TJRS usa eproc", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJRO", name: "Tribunal de Justiça de Rondônia", branch: "ESTADUAL", ufs: ["RO"], degrees: ["1", "2"], portalUrl: "https://www.tjro.jus.br", engine: "PJE", engineSource: "Portal público do TJRO", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJRR", name: "Tribunal de Justiça de Roraima", branch: "ESTADUAL", ufs: ["RR"], degrees: ["1", "2"], portalUrl: "https://www.tjrr.jus.br", engine: "PJE", engineSource: "Portal público do TJRR", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJSC", name: "Tribunal de Justiça de Santa Catarina", branch: "ESTADUAL", ufs: ["SC"], degrees: ["1", "2"], portalUrl: "https://www.tjsc.jus.br", engine: "EPROC", engineSource: "Portal público do TJSC usa eproc", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJSP", name: "Tribunal de Justiça de São Paulo", branch: "ESTADUAL", ufs: ["SP"], degrees: ["1", "2"], portalUrl: "https://www.tjsp.jus.br/eproc", engine: "EPROC", engineSource: "eproc em implantação gradual; e-SAJ permanece em unidades ainda não migradas", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "Portal público do TJSP" },
  { code: "TJSE", name: "Tribunal de Justiça de Sergipe", branch: "ESTADUAL", ufs: ["SE"], degrees: ["1", "2"], portalUrl: "https://www.tjse.jus.br", engine: "PJE", engineSource: "Portal público do TJSE", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TJTO", name: "Tribunal de Justiça do Tocantins", branch: "ESTADUAL", ufs: ["TO"], degrees: ["1", "2"], portalUrl: "https://www.tjto.jus.br", engine: "PJE", engineSource: "Portal público do TJTO", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
];

// ────────── Justiça Federal (6) ──────────

const FEDERAIS: CourtEntry[] = [
  { code: "TRF1", name: "Tribunal Regional Federal da 1ª Região", branch: "FEDERAL", ufs: ["AC", "AM", "AP", "BA", "DF", "GO", "MA", "MT", "PA", "PI", "RO", "RR", "TO"], degrees: ["1", "2"], portalUrl: "https://www.trf1.jus.br", engine: "PJE", engineSource: "Portal público do TRF1", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TRF2", name: "Tribunal Regional Federal da 2ª Região", branch: "FEDERAL", ufs: ["ES", "RJ"], degrees: ["1", "2"], portalUrl: "https://www.trf2.jus.br", engine: "EPROC", engineSource: "Portal público do TRF2 usa eproc", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TRF3", name: "Tribunal Regional Federal da 3ª Região", branch: "FEDERAL", ufs: ["MS", "SP"], degrees: ["1", "2"], portalUrl: "https://www.trf3.jus.br", engine: "PJE", engineSource: "Portal público do TRF3", integrationStatus: "ADAPTER_WIP", verifiedAt: null, verifiedSource: "Login real ainda não homologado com acesso autorizado" },
  { code: "TRF4", name: "Tribunal Regional Federal da 4ª Região", branch: "FEDERAL", ufs: ["PR", "RS", "SC"], degrees: ["1", "2"], portalUrl: "https://www.trf4.jus.br", engine: "EPROC", engineSource: "Portal público do TRF4 usa eproc", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TRF5", name: "Tribunal Regional Federal da 5ª Região", branch: "FEDERAL", ufs: ["AL", "CE", "PB", "PE", "RN", "SE"], degrees: ["1", "2"], portalUrl: "https://www.trf5.jus.br", engine: "PJE", engineSource: "Portal público do TRF5", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TRF6", name: "Tribunal Regional Federal da 6ª Região", branch: "FEDERAL", ufs: ["MG"], degrees: ["1", "2"], portalUrl: "https://portal.trf6.jus.br/e-proc/", engine: "EPROC", engineSource: "eproc nos 1º e 2º graus; acervo legado ainda pode permanecer no PJe", integrationStatus: "ADAPTER_WIP", verifiedAt: "2026-11", verifiedSource: "Portal público do TRF6" },
];

// ────────── Justiça do Trabalho (24) ──────────

const TRABALHO: CourtEntry[] = Array.from({ length: 24 }, (_, i) => {
  const n = i + 1;
  const ufMap: Record<number, string[]> = {
    1: ["RJ"], 2: ["SP"], 3: ["MG"], 4: ["RS"], 5: ["BA"], 6: ["PE"], 7: ["CE"],
    8: ["AP", "PA"], 9: ["PR"], 10: ["DF", "TO"], 11: ["AM", "RR"], 12: ["SC"],
    13: ["PB"], 14: ["AC", "RO"], 15: ["SP"], 16: ["MA"], 17: ["ES"],
    18: ["GO"], 19: ["AL"], 20: ["SE"], 21: ["RN"], 22: ["PI"], 23: ["MT"], 24: ["MS"],
  };
  return {
    code: `TRT${n}`,
    name: `Tribunal Regional do Trabalho da ${n}ª Região`,
    branch: "TRABALHO" as CourtBranch,
    ufs: ufMap[n] ?? [],
    degrees: ["1", "2"] as CourtDegree[],
    portalUrl: `https://www.trt${n}.jus.br`,
    engine: "PJE" as CourtEngine,
    engineSource: "PJe é o sistema padrão da Justiça do Trabalho",
    integrationStatus: "CATALOG_ONLY" as IntegrationStatus,
    verifiedAt: "2026-11",
    verifiedSource: "CNJ / portal público",
  };
});

// ────────── Justiça Eleitoral (27) ──────────

const UF_LIST = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
const UF_NAME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

const ELEITORAIS: CourtEntry[] = UF_LIST.map((uf) => ({
  code: `TRE-${uf}`,
  name: `Tribunal Regional Eleitoral ${uf === "DF" ? "do Distrito Federal" : UF_NAME[uf] ? `do ${UF_NAME[uf]}` : `de ${uf}`}`,
  branch: "ELEITORAL" as CourtBranch,
  ufs: [uf],
  degrees: ["1", "2"] as CourtDegree[],
  portalUrl: `https://www.tre-${uf.toLowerCase()}.jus.br`,
  engine: "PJE" as CourtEngine,
  engineSource: "PJe é o sistema padrão da Justiça Eleitoral",
  integrationStatus: "CATALOG_ONLY" as IntegrationStatus,
  verifiedAt: "2026-11",
  verifiedSource: "CNJ / portal público",
}));

// ────────── Justiça Militar Estadual (3) ──────────

const MILITAR_ESTADUAL: CourtEntry[] = [
  { code: "TJMSP", name: "Tribunal de Justiça Militar de São Paulo", branch: "MILITAR_ESTADUAL", ufs: ["SP"], degrees: ["1", "2"], portalUrl: "https://www.tjmsp.jus.br", engine: null, engineSource: "Motor não identificado publicamente", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ" },
  { code: "TJMMG", name: "Tribunal de Justiça Militar de Minas Gerais", branch: "MILITAR_ESTADUAL", ufs: ["MG"], degrees: ["1", "2"], portalUrl: "https://www.tjmmg.jus.br", engine: null, engineSource: "Motor não identificado publicamente", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ" },
  { code: "TJMRS", name: "Tribunal de Justiça Militar do Rio Grande do Sul", branch: "MILITAR_ESTADUAL", ufs: ["RS"], degrees: ["1", "2"], portalUrl: "https://www.tjmrs.jus.br", engine: null, engineSource: "Motor não identificado publicamente", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ" },
];

// ────────── Tribunais Superiores (4) ──────────

const SUPERIORES: CourtEntry[] = [
  { code: "STJ", name: "Superior Tribunal de Justiça", branch: "SUPERIOR", ufs: [], degrees: ["ORIGINARIO"], portalUrl: "https://www.stj.jus.br", engine: "PROPRIO", engineSource: "Sistema próprio do STJ", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TST", name: "Tribunal Superior do Trabalho", branch: "SUPERIOR", ufs: [], degrees: ["ORIGINARIO"], portalUrl: "https://www.tst.jus.br", engine: "PJE", engineSource: "PJe (instância nacional)", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "TSE", name: "Tribunal Superior Eleitoral", branch: "SUPERIOR", ufs: [], degrees: ["ORIGINARIO"], portalUrl: "https://www.tse.jus.br", engine: "PJE", engineSource: "PJe (instância nacional)", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
  { code: "STM", name: "Superior Tribunal Militar", branch: "SUPERIOR", ufs: [], degrees: ["ORIGINARIO"], portalUrl: "https://www.stm.jus.br", engine: "PROPRIO", engineSource: "Sistema próprio do STM", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "CNJ / portal público" },
];

// ────────── Instituições de referência (não contam na contagem de 91) ──────────

const REFERENCIA: CourtEntry[] = [
  { code: "STF", name: "Supremo Tribunal Federal", branch: "REFERENCIA", ufs: [], degrees: ["ORIGINARIO"], portalUrl: "https://portal.stf.jus.br", engine: "PROPRIO", engineSource: "Sistema próprio do STF", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "Identificado separadamente — não é parte dos 91" },
  { code: "CNJ", name: "Conselho Nacional de Justiça", branch: "REFERENCIA", ufs: [], degrees: [], portalUrl: "https://www.cnj.jus.br", engine: null, engineSource: "Órgão regulador, não jurisdicional", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "Identificado separadamente" },
  { code: "CJF", name: "Conselho da Justiça Federal", branch: "REFERENCIA", ufs: [], degrees: [], portalUrl: "https://www.cjf.jus.br", engine: null, engineSource: "Órgão regulador, não jurisdicional", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "Identificado separadamente" },
  { code: "CSJT", name: "Conselho Superior da Justiça do Trabalho", branch: "REFERENCIA", ufs: [], degrees: [], portalUrl: "https://www.csjt.jus.br", engine: null, engineSource: "Órgão regulador, não jurisdicional", integrationStatus: "CATALOG_ONLY", verifiedAt: "2026-11", verifiedSource: "Identificado separadamente" },
];

// ────────── Catálogo completo ──────────

export const COURT_CATALOG: readonly CourtEntry[] = [
  ...ESTADUAIS,
  ...FEDERAIS,
  ...TRABALHO,
  ...ELEITORAIS,
  ...MILITAR_ESTADUAL,
  ...SUPERIORES,
  ...REFERENCIA,
];

export const JURISDICTIONAL_COURTS = COURT_CATALOG.filter((c) => c.branch !== "REFERENCIA");
export const REFERENCE_INSTITUTIONS = COURT_CATALOG.filter((c) => c.branch === "REFERENCIA");

/** Tribunais dentro do escopo de conectores solicitado: Sul/Sudeste, estadual/federal/trabalho. */
export const CONNECTOR_SCOPE_UFS = ["ES", "MG", "RJ", "SP", "PR", "RS", "SC"] as const;
export const CONNECTOR_SCOPE_BRANCHES: readonly CourtBranch[] = ["ESTADUAL", "FEDERAL", "TRABALHO"];
export const REGIONAL_CONNECTOR_COURTS = JURISDICTIONAL_COURTS.filter(
  (court) => CONNECTOR_SCOPE_BRANCHES.includes(court.branch) && court.ufs.some((uf) => CONNECTOR_SCOPE_UFS.includes(uf as (typeof CONNECTOR_SCOPE_UFS)[number])),
);

export const getCourtByCode = (code: string) => COURT_CATALOG.find((c) => c.code === code) ?? null;

export const courtsByBranch = (branch: CourtBranch) => COURT_CATALOG.filter((c) => c.branch === branch);

export const courtsByEngine = (engine: CourtEngine) => COURT_CATALOG.filter((c) => c.engine === engine);

export const courtsByUf = (uf: string) => COURT_CATALOG.filter((c) => c.ufs.includes(uf));

export const BRANCH_LABEL: Record<CourtBranch, string> = {
  ESTADUAL: "Justiça Estadual",
  FEDERAL: "Justiça Federal",
  TRABALHO: "Justiça do Trabalho",
  ELEITORAL: "Justiça Eleitoral",
  MILITAR_ESTADUAL: "Justiça Militar Estadual",
  SUPERIOR: "Tribunais Superiores",
  REFERENCIA: "Instituições de referência",
};

export const DEGREE_LABEL: Record<CourtDegree, string> = {
  "1": "1º grau",
  "2": "2º grau",
  TR: "Turma Recursal",
  ORIGINARIO: "Competência originária",
};

export const ENGINE_LABEL: Record<string, string> = {
  PJE: "PJe",
  EPROC: "eproc",
  ESAJ: "e-SAJ",
  PROJUDI: "PROJUDI",
  PROPRIO: "Sistema próprio",
};
