/**
 * Tradução de andamento para linguagem simples (5.0-F2). É uma lista de regras ESCRITA À MÃO, não IA: cada regra devolve um texto
 * genérico que não afirma nenhum fato que não esteja no andamento (sem datas, valores ou resultados). A pessoa da equipe sempre
 * revisa e aprova antes de o cliente ver qualquer coisa.
 */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Rule = { key: string; label: string; test: RegExp; text: string };
export const PLAIN_RULES: Rule[] = [
  { key: "pericia-marcada", label: "Perícia marcada", test: /pericia.*(design|agend|marc|data)|(design|agend|marc).*pericia/, text: "Foi marcada a perícia (um exame feito por um profissional indicado pelo juiz). A equipe vai passar a data, o local e o que levar." },
  { key: "pericia", label: "Aguarda perícia", test: /pericia|pericial/, text: "O processo aguarda a perícia (um exame feito por um profissional indicado pelo juiz). Quando houver data, a equipe avisa você." },
  { key: "laudo", label: "Laudo no processo", test: /laudo/, text: "O laudo do exame (perícia) chegou ao processo. A equipe vai analisar e, se for preciso, conversar com você." },
  { key: "concluso-sentenca", label: "Aguarda sentença", test: /concluso.*senten|aguard.*senten/, text: "O processo está com o juiz, que vai proferir a sentença (a decisão que resolve o processo nessa fase). Não há nada a fazer por enquanto." },
  { key: "transito", label: "Decisão definitiva", test: /transito em julgado|transitou em julgado/, text: "A decisão se tornou definitiva: não cabe mais recurso. A equipe vai explicar os próximos passos." },
  { key: "sentenca", label: "Sentença", test: /senten[cç]a/, text: "O juiz proferiu a sentença (a decisão que resolve o processo nessa fase). A equipe vai analisar o resultado e explicar o que vem a seguir." },
  { key: "audiencia", label: "Audiência", test: /audiencia/, text: "Há uma audiência no processo (um encontro com o juiz). A equipe vai informar a data e como se preparar." },
  { key: "citacao", label: "Citação", test: /cita[cç]ao|citad[oa]/, text: "A parte contrária foi avisada oficialmente (citada) do processo e terá um prazo para responder." },
  { key: "contestacao", label: "Defesa da outra parte", test: /contesta[cç]ao/, text: "A parte contrária apresentou a defesa dela (contestação). A equipe vai analisar e responder, se necessário." },
  { key: "recurso", label: "Recurso", test: /recurso|apela[cç]ao|agravo|embargos/, text: "Há um recurso no processo: alguém pediu que a decisão seja revista. Essa fase costuma levar tempo; a equipe avisa quando houver resultado." },
  { key: "pagamento", label: "Pagamento", test: /alvara|rpv|precatorio|pagamento|levantamento/, text: "Houve movimentação sobre pagamento ou valores do processo. A equipe vai orientar você sobre os próximos passos." },
  { key: "cumprimento", label: "Cumprimento da decisão", test: /cumprimento de senten|execucao|liquidacao/, text: "O processo está na fase de fazer valer a decisão (cumprimento/execução). A equipe acompanha cada passo." },
  { key: "arquivado", label: "Arquivamento", test: /arquiv/, text: "O processo foi enviado ao arquivo. A equipe confirma se ainda há algo a fazer." },
  { key: "suspenso", label: "Suspenso", test: /suspen[sc]/, text: "O andamento do processo está temporariamente suspenso. A equipe acompanha e avisa quando voltar a andar." },
  { key: "concluso", label: "Com o juiz", test: /concluso/, text: "O processo está com o juiz para decidir. Não há nada a fazer por enquanto." },
  { key: "juntada", label: "Documento juntado", test: /juntada|juntou|juntad/, text: "Um documento foi anexado ao processo. A equipe está acompanhando." },
  { key: "decisao", label: "Decisão ou despacho", test: /despacho|decisao|determin/, text: "O juiz tomou uma decisão ou fez uma determinação no processo. A equipe vai analisar e cuidar do que for preciso." },
  { key: "comunicacao", label: "Comunicação oficial", test: /intima[cç]ao|publica[cç]ao|disponibiliza/, text: "Saiu uma comunicação oficial no processo. A equipe já está cuidando do que for necessário." },
];

export function suggestPlain(original: string): { key: string; label: string; text: string } | null {
  const t = norm(original);
  const r = PLAIN_RULES.find((x) => x.test.test(t));
  return r ? { key: r.key, label: r.label, text: r.text } : null;
}
