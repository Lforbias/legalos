import { ACTS, type ActDef } from "@/lib/calc/prazos";

/**
 * 5.0-F4 — leitura por REGRAS (sem IA) do que uma publicação exige. Só afirma o que o texto traz: o ato é um palpite para a
 * pessoa conferir, e o prazo vem da tabela do ato (CPC/JEC/CLT) ou do número de dias escrito no próprio texto.
 */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type TriageGuess = { requirement: string; summary: string; act: ActDef | null; days: number | null; countType: "BUSINESS" | "CALENDAR" | null; fromText: boolean };

const act = (key: string) => ACTS.find((a) => a.key === key) ?? null;

type Rule = { test: RegExp; requirement: string; key: string | ((ctx: { juizado: boolean; trabalho: boolean }) => string) };
const RULES: Rule[] = [
  { test: /para (apresentar )?contest|contestar|prazo para contesta|citad[oa]/, requirement: "Citação/intimação para apresentar contestação.", key: "cpc-contestacao" },
  { test: /impugna[cç]ao ao cumprimento|intimad[oa] para pagar|cumprimento de senten.*(pagar|prazo)/, requirement: "Intimação no cumprimento de sentença (pagar ou impugnar).", key: "cpc-impugnacao-cumprimento" },
  { test: /embargos? [àa] execu[cç]ao fiscal/, requirement: "Embargos à execução fiscal.", key: "lef-embargos" },
  { test: /(manifest|especific|impugn)\w* .*laudo|laudo pericial|vista do laudo/, requirement: "Manifestação sobre o laudo pericial.", key: "cpc-laudo" },
  { test: /replic|manifest\w* sobre a contesta|impugnar a contesta/, requirement: "Réplica/manifestação sobre a contestação.", key: "cpc-replica" },
  { test: /senten[cç]a.*(publicad|prolatad|julg|proced|improced)|julgo (proced|improced)|dispositivo/, requirement: "Sentença publicada: avaliar recurso (e embargos de declaração, se houver omissão ou contradição).", key: ({ juizado, trabalho }) => (trabalho ? "clt-ro" : juizado ? "jec-recurso-inominado" : "cpc-apelacao") },
  { test: /ac[oó]rd[aã]o/, requirement: "Acórdão publicado: avaliar embargos de declaração e recursos aos tribunais superiores.", key: ({ trabalho }) => (trabalho ? "clt-ed" : "cpc-embargos-declaracao") },
  { test: /embargos de declara[cç]ao/, requirement: "Embargos de declaração no processo.", key: ({ trabalho, juizado }) => (trabalho ? "clt-ed" : juizado ? "jec-embargos" : "cpc-embargos-declaracao") },
  { test: /agravo interno/, requirement: "Agravo interno.", key: "cpc-agravo-interno" },
  { test: /(intim|manifest)\w* .*(prazo|dias)|manifeste-se|manifestem-se|diga a parte|digam as partes/, requirement: "Intimação para manifestação.", key: "" },
];

const DAYS = /prazo (?:de|legal de)?\s*(\d{1,3})\s*\(?[^)]*\)?\s*dias(?:\s+(uteis|corridos))?|(\d{1,3})\s*\(?[^)]*\)?\s*dias(?:\s+(uteis|corridos))/;

export function guessTriage(content: string, ctx: { court?: string | null }): TriageGuess {
  const t = norm(content);
  const court = norm(ctx.court ?? "");
  const juizado = /juizado|jef|jec|turma recursal/.test(court + " " + t);
  const trabalho = /trt|trabalho|vara do trabalho|tst/.test(court);
  const hit = RULES.find((r) => r.test.test(t));
  const key = hit ? (typeof hit.key === "function" ? hit.key({ juizado, trabalho }) : hit.key) : "";
  const a = key ? act(key) : null;
  let days: number | null = a?.days ?? null;
  let countType: TriageGuess["countType"] = a?.type ?? null;
  let fromText = false;
  const m = DAYS.exec(t);
  if (m) {
    const n = Number(m[1] ?? m[3]);
    const kind = m[2] ?? m[4];
    if (n >= 1 && n <= 365) {
      days = n;
      fromText = true;
      if (kind === "corridos") countType = "CALENDAR";
      else if (kind === "uteis") countType = "BUSINESS";
      else if (!a) countType = juizado || trabalho ? "CALENDAR" : "BUSINESS";
    }
  }
  const requirement = hit ? hit.requirement : "Não foi possível identificar o que a publicação exige. Leia o texto e defina a providência.";
  const summary = content.replace(/\s+/g, " ").trim().slice(0, 280);
  return { requirement, summary, act: a, days, countType, fromText };
}

/** Modelo de minuta SEM IA: só a estrutura, com [PREENCHER] onde falta dado. */
export function skeletonMinuta(i: { actLabel: string | null; caseNumber: string | null; court: string | null }): string {
  const what = i.actLabel ?? "manifestação";
  return [
    "MINUTA-MODELO (sem IA). REVISAR E COMPLETAR ANTES DE USAR.",
    "",
    `EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO/FEDERAL/DO TRABALHO ${i.court ? `(${i.court})` : "[PREENCHER: órgão]"}`,
    "",
    `Processo nº ${i.caseNumber ?? "[PREENCHER: número do processo]"}`,
    "",
    `[PREENCHER: nome e qualificação da parte], por seu(sua) advogado(a) que esta subscreve, vem, respeitosamente, apresentar ${what.toLowerCase()}, nos termos a seguir.`,
    "",
    "I — DOS FATOS",
    "[PREENCHER: resumo dos fatos relevantes do processo]",
    "",
    "II — DO DIREITO",
    "[PREENCHER: fundamentos jurídicos — conferir cada dispositivo e precedente]",
    "",
    "III — DOS PEDIDOS",
    "[PREENCHER: o que se requer]",
    "",
    "Nestes termos, pede deferimento.",
    "[PREENCHER: local e data]",
    "[PREENCHER: advogado(a) e OAB]",
  ].join("\n");
}
