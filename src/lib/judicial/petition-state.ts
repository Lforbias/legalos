import { ConflictError, ValidationError } from "@/lib/permissions/check";

/**
 * Máquina de estados do peticionamento (Box 2.0). Regras que a tela e o servidor compartilham:
 *  - "Protocolada com confirmação oficial" só existe com recibo oficial de um tribunal REAL (produção). Teste, simulação e demonstração nunca viram isso.
 *  - Sem resposta do tribunal = "Estado desconhecido": a petição PODE ter sido protocolada. Nunca é reenviada às cegas; uma pessoa confere e registra.
 *  - Falha definitiva (o tribunal recusou antes de aceitar) é a única que permite novo envio.
 */
export type PetitionStatusKey = "DRAFT" | "IN_REVIEW" | "APPROVED" | "SUBMITTING" | "AWAITING_CONFIRMATION" | "FILED_CONFIRMED" | "SUBMITTED" | "UNKNOWN" | "FAILED" | "CANCELED";
export const PETITION_STATUS_KEYS: readonly PetitionStatusKey[] = ["DRAFT", "IN_REVIEW", "APPROVED", "SUBMITTING", "AWAITING_CONFIRMATION", "FILED_CONFIRMED", "SUBMITTED", "UNKNOWN", "FAILED", "CANCELED"];

export type FilingEnvironment = "DEMO" | "SIMULATED" | "HOMOLOGATION" | "PRODUCTION";
export const FILING_ENVIRONMENTS: readonly FilingEnvironment[] = ["DEMO", "SIMULATED", "HOMOLOGATION", "PRODUCTION"];
export const FILING_ENV_LABEL: Record<FilingEnvironment, string> = {
  DEMO: "Demonstração (nada foi enviado a tribunal)",
  SIMULATED: "Tribunal simulado (teste)",
  HOMOLOGATION: "Homologação do tribunal (teste, sem efeito no processo)",
  PRODUCTION: "Produção (tribunal real)",
};

/** Para onde cada estado pode ir. `UNKNOWN` e `AWAITING_CONFIRMATION` NUNCA voltam a `SUBMITTING`: só uma pessoa os resolve. */
export const PETITION_TRANSITIONS: Record<PetitionStatusKey, readonly PetitionStatusKey[]> = {
  DRAFT: ["IN_REVIEW", "CANCELED"],
  IN_REVIEW: ["APPROVED", "DRAFT", "CANCELED"],
  APPROVED: ["SUBMITTING", "DRAFT", "CANCELED", "FILED_CONFIRMED"],
  SUBMITTING: ["SUBMITTED", "FILED_CONFIRMED", "AWAITING_CONFIRMATION", "UNKNOWN", "FAILED"],
  AWAITING_CONFIRMATION: ["FILED_CONFIRMED", "FAILED"],
  UNKNOWN: ["FILED_CONFIRMED", "FAILED"],
  FAILED: ["SUBMITTING", "DRAFT", "CANCELED", "FILED_CONFIRMED"],
  SUBMITTED: [],
  FILED_CONFIRMED: [],
  CANCELED: [],
};

/** Resultado de um envio que o tribunal (ou a demonstração) respondeu. */
export function statusAfterDelivery(i: { environment: FilingEnvironment; protocol: string | null | undefined; officialReceipt: boolean }): "SUBMITTED" | "FILED_CONFIRMED" | "AWAITING_CONFIRMATION" {
  if (i.environment !== "PRODUCTION") return "SUBMITTED"; // teste nunca é protocolo oficial
  if (!i.protocol?.trim() || !i.officialReceipt) return "AWAITING_CONFIRMATION"; // sem protocolo E recibo, falta a prova oficial
  return "FILED_CONFIRMED";
}

/**
 * Falha definitiva = nada chegou a ser aceito (nenhuma chance de duplicar ao reenviar). Em demonstração tudo é definitivo (nada sai).
 * Em adaptador real, só os erros que o próprio adaptador declara como recusa ou configuração são definitivos; qualquer outro erro
 * (queda, resposta ilegível, exceção inesperada) deixa o envio em dúvida.
 */
export function isDefiniteFailure(err: unknown, adapterIsDemo: boolean): boolean {
  if (adapterIsDemo) return true;
  return err instanceof ConflictError || err instanceof ValidationError;
}

/** Marca de legado: antes do Box 2.0 a dúvida era guardada como "Falha" com este texto. Continua bloqueando reenvio. */
export const LEGACY_UNCERTAIN_MARK = "ATENÇÃO: não recebemos confirmação";
export const isLegacyUncertain = (error: string | null | undefined) => Boolean(error?.startsWith(LEGACY_UNCERTAIN_MARK));

export type AttemptOutcome = "STARTED" | "CONFIRMED" | "REJECTED" | "UNCERTAIN" | "ABORTED";

/** Pode haver novo envio? Só de `APPROVED`, ou de `FAILED` quando a última tentativa foi uma recusa definitiva. */
export function canSubmitAgain(i: { status: string; lastAttempt: AttemptOutcome | null; error: string | null }): { ok: true } | { ok: false; reason: string } {
  if (i.status === "APPROVED") return { ok: true };
  if (i.status === "FAILED") {
    if (isLegacyUncertain(i.error) || i.lastAttempt === "UNCERTAIN" || i.lastAttempt === "STARTED") return { ok: false, reason: "Não há certeza de que o tribunal não recebeu a petição. Confira no tribunal e registre o resultado antes de enviar de novo." };
    return { ok: true };
  }
  if (i.status === "UNKNOWN" || i.status === "AWAITING_CONFIRMATION") return { ok: false, reason: "A petição pode já ter sido protocolada. Confira no tribunal e registre o resultado; não reenviamos às cegas." };
  return { ok: false, reason: "A petição não está aprovada para envio (ou já está sendo enviada)." };
}

type Tone = "neutral" | "info" | "warning" | "success" | "danger";
export type PetitionStateInfo = {
  label: string;
  tone: Tone;
  /** Há prova oficial de protocolo (recibo de tribunal real ou confirmação registrada por uma pessoa com o recibo). */
  officiallyFiled: boolean;
  /** Foi só teste: nada com efeito no processo real. */
  testOnly: boolean;
  /** Uma pessoa precisa conferir no tribunal e registrar o resultado. */
  needsReconciliation: boolean;
  explanation: string;
};

export function petitionStateInfo(status: string, env: string | null, isDemo = false): PetitionStateInfo {
  const e = (FILING_ENVIRONMENTS as readonly string[]).includes(env ?? "") ? (env as FilingEnvironment) : isDemo ? "DEMO" : null;
  const base = { officiallyFiled: false, testOnly: false, needsReconciliation: false };
  switch (status) {
    case "DRAFT": return { ...base, label: "Rascunho", tone: "neutral", explanation: "Ainda em preparação." };
    case "IN_REVIEW": return { ...base, label: "Em revisão", tone: "warning", explanation: "Aguardando revisão e aprovação." };
    case "APPROVED": return { ...base, label: "Aprovada, pronta para protocolar", tone: "info", explanation: "A versão aprovada está pronta para ser enviada." };
    case "SUBMITTING": return { ...base, label: "Enviando ao tribunal…", tone: "info", explanation: "O envio está em andamento. Não envie de novo." };
    case "AWAITING_CONFIRMATION": return { ...base, needsReconciliation: true, label: "Enviada — falta a confirmação oficial", tone: "warning", explanation: "O tribunal respondeu, mas sem o recibo oficial. Confira no tribunal e registre o recibo para considerar protocolada." };
    case "FILED_CONFIRMED": return { ...base, officiallyFiled: true, label: "Protocolada com confirmação oficial", tone: "success", explanation: "Há recibo oficial do protocolo." };
    case "SUBMITTED":
      if (e === "DEMO") return { ...base, testOnly: true, label: "Enviada em demonstração", tone: "warning", explanation: "Nada foi enviado a nenhum tribunal." };
      if (e === "SIMULATED") return { ...base, testOnly: true, label: "Enviada a tribunal simulado (teste)", tone: "warning", explanation: "Teste: nenhum tribunal real recebeu esta petição." };
      if (e === "HOMOLOGATION") return { ...base, testOnly: true, label: "Enviada em homologação (teste)", tone: "warning", explanation: "Ambiente de testes do tribunal: não tem efeito no processo real." };
      return { ...base, label: "Enviada (registro anterior, sem recibo oficial verificado)", tone: "warning", explanation: "Registro feito antes do Box 2.0: não há recibo oficial verificado. Confira no tribunal." };
    case "UNKNOWN": return { ...base, needsReconciliation: true, label: "Estado desconhecido — confira no tribunal", tone: "danger", explanation: "Não houve resposta confiável do tribunal: a petição PODE ter sido protocolada. Não envie de novo antes de conferir." };
    case "FAILED": return { ...base, label: "Falha no envio", tone: "danger", explanation: "O envio não foi aceito. Veja o motivo." };
    case "CANCELED": return { ...base, label: "Cancelada", tone: "neutral", explanation: "Cancelada: não será enviada." };
    default: return { ...base, label: status, tone: "neutral", explanation: "" };
  }
}
