import { calculateDeadline, type CountType } from "@/lib/deadlines/calculator";
import { diffDays, formatYmd } from "@/lib/dates/ymd";
import { CalcError, type CalcResult } from "./num";

/** Atos mais comuns, com prazo e tipo de contagem (CPC, Lei 9.099/95 e CLT). O cálculo é auxiliar e exige conferência humana. */
export type ActDef = { key: string; label: string; days: number; type: CountType; rite: "CPC" | "JEC" | "CLT" | "LEF"; basis: string };
export const ACTS: ActDef[] = [
  { key: "cpc-contestacao", label: "Contestação", days: 15, type: "BUSINESS", rite: "CPC", basis: "art. 335 CPC" },
  { key: "cpc-replica", label: "Réplica / manifestação sobre a contestação", days: 15, type: "BUSINESS", rite: "CPC", basis: "art. 351 CPC" },
  { key: "cpc-embargos-declaracao", label: "Embargos de declaração", days: 5, type: "BUSINESS", rite: "CPC", basis: "art. 1.023 CPC" },
  { key: "cpc-apelacao", label: "Apelação (razões e contrarrazões)", days: 15, type: "BUSINESS", rite: "CPC", basis: "art. 1.003, §5º, CPC" },
  { key: "cpc-agravo-instrumento", label: "Agravo de instrumento", days: 15, type: "BUSINESS", rite: "CPC", basis: "art. 1.003, §5º, CPC" },
  { key: "cpc-agravo-interno", label: "Agravo interno", days: 15, type: "BUSINESS", rite: "CPC", basis: "art. 1.003, §5º, CPC" },
  { key: "cpc-resp-re", label: "Recurso especial / extraordinário", days: 15, type: "BUSINESS", rite: "CPC", basis: "art. 1.003, §5º, CPC" },
  { key: "cpc-impugnacao-cumprimento", label: "Impugnação ao cumprimento de sentença", days: 15, type: "BUSINESS", rite: "CPC", basis: "art. 525 CPC" },
  { key: "cpc-embargos-execucao", label: "Embargos à execução", days: 15, type: "BUSINESS", rite: "CPC", basis: "art. 915 CPC" },
  { key: "lef-embargos", label: "Embargos à execução fiscal", days: 30, type: "CALENDAR", rite: "LEF", basis: "art. 16 LEF" },
  { key: "cpc-laudo", label: "Manifestação sobre laudo pericial", days: 15, type: "BUSINESS", rite: "CPC", basis: "art. 477 CPC" },
  { key: "cpc-gratuidade", label: "Impugnação à gratuidade", days: 15, type: "BUSINESS", rite: "CPC", basis: "art. 100 CPC" },
  { key: "jec-recurso-inominado", label: "Recurso inominado", days: 10, type: "CALENDAR", rite: "JEC", basis: "Lei 9.099/95" },
  { key: "jec-contrarrazoes", label: "Contrarrazões de recurso inominado", days: 10, type: "CALENDAR", rite: "JEC", basis: "Lei 9.099/95" },
  { key: "jec-embargos", label: "Embargos de declaração (JEC)", days: 5, type: "CALENDAR", rite: "JEC", basis: "Lei 9.099/95" },
  { key: "clt-ro", label: "Recurso ordinário", days: 8, type: "CALENDAR", rite: "CLT", basis: "CLT" },
  { key: "clt-rr", label: "Recurso de revista", days: 8, type: "CALENDAR", rite: "CLT", basis: "CLT" },
  { key: "clt-ed", label: "Embargos de declaração (trabalho)", days: 5, type: "CALENDAR", rite: "CLT", basis: "CLT" },
  { key: "clt-ai", label: "Agravo de instrumento (trabalho)", days: 8, type: "CALENDAR", rite: "CLT", basis: "CLT" },
];

export type PrazoInput = { processo?: string; actKey: string; intimacao: string; hoje: string; customDays?: number; customType?: CountType };

export function calcPrazo(i: PrazoInput): CalcResult {
  const act = ACTS.find((a) => a.key === i.actKey);
  const days = i.customDays ?? act?.days;
  const type = i.customType ?? act?.type;
  if (!days || !type) throw new CalcError("Escolha o ato ou informe os dias e o tipo de contagem.");
  const r = calculateDeadline({ startDate: i.intimacao, days, countType: type });
  const left = diffDays(r.dueDate, i.hoje);
  const a1 = r.dueDate;
  const label = act ? act.label : "Prazo informado";
  const alerts = [5, 2, 1].map((n) => { const d = new Date(`${a1}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return [`${n} dia(s) antes`, formatYmd(d.toISOString().slice(0, 10))]; });
  return {
    kind: "PRAZO",
    title: `Prazo: ${label}${i.processo ? ` — proc. ${i.processo}` : ""}`,
    total: "0.00",
    summary: [
      ["Ato", label],
      ["Rito / fundamento", act ? `${act.rite} — ${act.basis}` : "informado manualmente"],
      ["Data da intimação", formatYmd(i.intimacao)],
      ["Prazo", `${days} ${type === "BUSINESS" ? "dias úteis" : "dias corridos"}`],
      ["VENCIMENTO", formatYmd(r.dueDate)],
      ["Dias restantes", left >= 0 ? String(left) : `vencido há ${-left} dia(s)`],
    ],
    sections: [{ title: "Alertas sugeridos", columns: ["Quando", "Data"], rows: alerts }, ...(r.skipped.length ? [{ title: "Dias não contados", columns: ["Data", "Motivo"], rows: r.skipped.map((s) => [formatYmd(s.date), s.reason]) }] : [])],
    warnings: ["Cálculo auxiliar: não considera feriados estaduais/municipais, suspensões do tribunal, prazo em dobro ou regras específicas. Confira antes de confiar.", ...(left < 0 ? ["Prazo vencido."] : [])],
    criteria: r.note.split("\n"),
  };
}
