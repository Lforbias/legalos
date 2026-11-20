/**
 * MVP: a conciliação bancária (importação de extrato e baixa por linha) ainda não tem testes com extratos reais
 * e registra baixas de verdade. Fica desligada até a revisão. Religar: LEGALOS_FIN_CONCILIACAO=1.
 */
export const reconciliationEnabled = () => process.env.LEGALOS_FIN_CONCILIACAO === "1";
