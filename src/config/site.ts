/**
 * Vitrine pública do escritório (página inicial antes do login).
 * Dados de contato NUNCA são inventados: só aparecem se definidos no ambiente.
 *   PUBLIC_FIRM_NAME, PUBLIC_OAB, PUBLIC_CONTACT_WHATSAPP (só dígitos, com DDI+DDD), PUBLIC_CONTACT_EMAIL, PUBLIC_CONTACT_ADDRESS
 */
export function siteInfo() {
  const e = process.env;
  const wa = (e.PUBLIC_CONTACT_WHATSAPP ?? "").replace(/\D/g, "");
  const email = (e.PUBLIC_CONTACT_EMAIL ?? "").trim();
  return {
    firmName: e.PUBLIC_FIRM_NAME?.trim() || "Equipe Dra. Talita Silva de Brito",
    lawyer: "Dra. Talita Silva de Brito",
    oab: e.PUBLIC_OAB?.trim() || null,
    whatsapp: /^\d{10,15}$/.test(wa) ? wa : null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    address: e.PUBLIC_CONTACT_ADDRESS?.trim() || null,
  };
}

export const PRACTICE_AREAS = [
  { icon: "briefcase", title: "Direito do Trabalho", text: "Reclamações trabalhistas, verbas rescisórias, reconhecimento de vínculo, rescisão indireta, reversão de justa causa e cálculo de liquidação." },
  { icon: "heart", title: "Direito Previdenciário", text: "Benefícios do INSS (aposentadorias, auxílios, BPC), revisões, recursos administrativos e ações na Justiça Federal, inclusive cálculo de atrasados." },
  { icon: "shield", title: "Doença ocupacional e saúde mental", text: "Burnout, adoecimento psíquico ligado ao trabalho, benefício acidentário, CAT recusada, nexo causal e estabilidade." },
  { icon: "home", title: "Imobiliário e consumidor", text: "Locação, despejo, compra e venda, distrato, atraso de obra, financiamento e alienação fiduciária, vícios do imóvel." },
  { icon: "scale", title: "Direito Civil", text: "Defesa e ação em demandas de indenização, cobrança, obrigação de fazer e tutelas de urgência." },
  { icon: "landmark", title: "Execução fiscal", text: "Defesa contra cobranças de municípios e Estado (IPTU, ISS, taxas), análise da CDA, embargos e prescrição." },
] as const;
