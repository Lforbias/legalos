/** Etapas do funil do LegalOS Comercial. As probabilidades e os prazos são PREMISSAS iniciais: a equipe ajusta com os números reais. */
export const STAGE_KEYS = ["IDENTIFICADO", "QUALIFICADO", "CONTATO", "DEMONSTRACAO", "PROPOSTA", "NEGOCIACAO", "GANHO", "PERDIDO"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const OPEN_STAGES: StageKey[] = ["IDENTIFICADO", "QUALIFICADO", "CONTATO", "DEMONSTRACAO", "PROPOSTA", "NEGOCIACAO"];

export const STAGE_INFO: Record<StageKey, { label: string; hint: string; color: string; defaultProbability: number; defaultDaysToClose: number }> = {
  IDENTIFICADO: { label: "Identificado", hint: "Está na lista, ainda sem contato.", color: "#64748b", defaultProbability: 5, defaultDaysToClose: 120 },
  QUALIFICADO: { label: "Qualificado", hint: "Tem perfil e telefone/e-mail conferidos.", color: "#0ea5e9", defaultProbability: 10, defaultDaysToClose: 100 },
  CONTATO: { label: "Em contato", hint: "Já falamos com alguém do escritório.", color: "#6366f1", defaultProbability: 20, defaultDaysToClose: 80 },
  DEMONSTRACAO: { label: "Demonstração", hint: "Demonstração marcada ou feita.", color: "#a855f7", defaultProbability: 35, defaultDaysToClose: 55 },
  PROPOSTA: { label: "Proposta", hint: "Proposta com preço enviada.", color: "#f59e0b", defaultProbability: 50, defaultDaysToClose: 35 },
  NEGOCIACAO: { label: "Negociação", hint: "Ajustando preço e condições.", color: "#f97316", defaultProbability: 70, defaultDaysToClose: 15 },
  GANHO: { label: "Ganho", hint: "Virou cliente.", color: "#16a34a", defaultProbability: 100, defaultDaysToClose: 0 },
  PERDIDO: { label: "Perdido", hint: "Não vai fechar (anote o motivo).", color: "#dc2626", defaultProbability: 0, defaultDaysToClose: 0 },
};

export function isStageKey(v: unknown): v is StageKey {
  return typeof v === "string" && (STAGE_KEYS as readonly string[]).includes(v);
}

export type StageNumbers = Record<StageKey, number>;

/** Mescla o que foi salvo com os padrões; ignora valores inválidos. */
export function mergeStageNumbers(saved: unknown, pick: "defaultProbability" | "defaultDaysToClose", min: number, max: number): StageNumbers {
  const out = {} as StageNumbers;
  const src = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  for (const k of STAGE_KEYS) {
    const v = src[k];
    out[k] = typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : STAGE_INFO[k][pick];
  }
  out.GANHO = pick === "defaultProbability" ? 100 : 0;
  out.PERDIDO = 0;
  return out;
}

export const ACTIVITY_LABEL: Record<string, string> = {
  LIGACAO: "Ligação",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  REUNIAO: "Reunião",
  DEMONSTRACAO: "Demonstração",
  NOTA: "Anotação",
  ETAPA: "Mudança de etapa",
};
