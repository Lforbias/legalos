import type { OperationFailure } from "./contracts";

export type FailureCode = OperationFailure["code"];

/**
 * Explicação de uma falha na linguagem do advogado (sem termos técnicos) e o que fazer.
 * Quem administra continua vendo o código e a mensagem original na área técnica.
 */
export function plainFailure(code: string): { what: string; next: string; automatic: boolean } {
  switch (code as FailureCode) {
    case "GEO_BLOCKED":
      return { what: "O serviço do tribunal não aceitou a consulta vinda do servidor do LegalOS.", next: "Isso não é um erro do seu cadastro. Avise o suporte do LegalOS: a consulta precisa sair de um servidor no Brasil.", automatic: false };
    case "UNAVAILABLE":
    case "TIMEOUT":
      return { what: "O serviço do tribunal está fora do ar ou muito lento agora.", next: "O LegalOS tenta de novo sozinho. Nada foi perdido.", automatic: true };
    case "RATE_LIMITED":
      return { what: "O tribunal limitou as consultas por alguns minutos.", next: "O LegalOS tenta de novo sozinho, respeitando o limite.", automatic: true };
    case "AUTH_REQUIRED":
      return { what: "Falta uma autorização para este acesso (login, código de verificação ou certificado).", next: "Complete o acesso em Conexões Judiciais.", automatic: false };
    case "AUTH_EXPIRED":
      return { what: "O acesso ao tribunal expirou.", next: "Renove o acesso em Conexões Judiciais.", automatic: false };
    case "AUTH_REJECTED":
      return { what: "O tribunal recusou o acesso.", next: "Confira login, senha ou certificado e atualize o acesso.", automatic: false };
    case "NEEDS_PERSON":
      return { what: "O tribunal pediu uma verificação que só uma pessoa pode fazer (código, captcha ou desbloqueio da conta).", next: "Faça a verificação no portal do tribunal e tente novamente. O LegalOS não contorna essa etapa.", automatic: false };
    case "LAYOUT_CHANGED":
      return { what: "O tribunal mudou o funcionamento do portal e a leitura automática parou para não errar.", next: "O suporte do LegalOS já é avisado. Até lá, esta fonte não deve ser considerada em dia.", automatic: false };
    case "UNSUPPORTED":
      return { what: "Este tribunal ainda não tem essa função no LegalOS.", next: "Use a consulta no próprio tribunal para essa etapa.", automatic: false };
    case "INVALID_RESPONSE":
      return { what: "O tribunal respondeu de um jeito inesperado.", next: "O LegalOS não trata isso como “sem publicações”. Se continuar, avise o suporte.", automatic: true };
    default:
      return { what: "Houve uma falha interna do LegalOS ao registrar o resultado.", next: "Tente novamente. Se continuar, avise o suporte.", automatic: false };
  }
}

/** "2026-10-28" → "28/10/2026". */
export const ymdToBr = (ymd: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : ymd);

export type PlainOutcome = { tone: "success" | "warning" | "error"; title: string; detail: string };

/** Resultado de uma consulta ao DJEN em linguagem simples. Nunca chama de "ok" uma leitura parcial. */
export function describeDjenRun(r: { found: number; imported: number; alreadyKnown: number; complete: boolean; from: string; to: string }): PlainOutcome {
  const period = `${ymdToBr(r.from)} a ${ymdToBr(r.to)}`;
  if (!r.complete) {
    return { tone: "warning", title: "Consulta parcial", detail: `Foram lidas ${r.found} publicação(ões) de ${period}, mas a leitura não chegou ao fim. O LegalOS continua de onde parou na próxima consulta; até lá, a fonte não está em dia.` };
  }
  if (r.found === 0) {
    return { tone: "success", title: "A consulta funciona", detail: `O DJEN respondeu normalmente e não há publicações para esta OAB entre ${period}. Quando uma publicação for disponibilizada, ela entra sozinha na Caixa de Entrada.` };
  }
  const known = r.alreadyKnown > 0 ? ` e ${r.alreadyKnown} que o LegalOS já tinha` : "";
  return { tone: "success", title: "Consulta concluída", detail: `Encontramos ${r.found} publicação(ões) entre ${period}: ${r.imported} nova(s) na Caixa de Entrada${known}.` };
}
