/** Respostas SINTÉTICAS do DJEN, só para testes (formato conforme relatos de integradores; não são dados reais). */
export const djenItem = (over: Record<string, unknown> = {}) => ({
  id: 900001,
  hash: "abc123",
  data_disponibilizacao: "2026-10-15",
  siglaTribunal: "TRT5",
  tipoComunicacao: "Intimação",
  nomeOrgao: "1ª Vara do Trabalho de Teste",
  nomeClasse: "ATOrd",
  tipoDocumento: "Despacho",
  numero_processo: "",
  texto: "Fica a parte intimada para se manifestar no prazo legal sobre o laudo apresentado.",
  link: "https://exemplo.invalid/doc",
  ativo: true,
  ...over,
});
export const djenPage = (items: unknown[], count = items.length) => JSON.stringify({ status: "success", message: "ok", count, items });
