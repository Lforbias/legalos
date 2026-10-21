import { addDays, dateToYmd, formatYmd, weekday } from "@/lib/dates/ymd";

/**
 * Calculadora AUXILIAR de prazos processuais.
 *
 * ATENÇÃO — não substitui a conferência humana. Considera apenas:
 *  - sábados e domingos;
 *  - feriados NACIONAIS (incl. Sexta-feira Santa) e a Consciência Negra (nacional desde 2024);
 *  - suspensão de 20/12 a 20/01 (CPC, art. 220), apenas na contagem em dias úteis.
 * NÃO considera: feriados estaduais/municipais, Carnaval, Corpus Christi e demais pontos facultativos, suspensões e
 * portarias de cada tribunal, indisponibilidade do sistema, prazos em dobro/especiais ou regras de procedimentos
 * específicos (CLT, JEC, execução fiscal etc.). Todo prazo calculado entra como RASCUNHO e exige validação humana.
 */

export type CountType = "BUSINESS" | "CALENDAR";

function easter(year: number): string {
  // Algoritmo de Meeus/Jones/Butcher (calendário gregoriano)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateToYmd(new Date(Date.UTC(year, month - 1, day)));
}

export function nationalHolidays(year: number): Map<string, string> {
  const y = String(year);
  const map = new Map<string, string>([
    [`${y}-01-01`, "Confraternização Universal"],
    [`${y}-04-21`, "Tiradentes"],
    [`${y}-05-01`, "Dia do Trabalho"],
    [`${y}-09-07`, "Independência do Brasil"],
    [`${y}-10-12`, "Nossa Senhora Aparecida"],
    [`${y}-11-02`, "Finados"],
    [`${y}-11-15`, "Proclamação da República"],
    [`${y}-12-25`, "Natal"],
  ]);
  if (year >= 2024) map.set(`${y}-11-20`, "Dia Nacional de Zumbi e da Consciência Negra");
  map.set(addDays(easter(year), -2), "Sexta-feira Santa");
  return map;
}

/** Recesso/suspensão de prazos: 20 de dezembro a 20 de janeiro (CPC, art. 220). */
export function isRecess(ymd: string): boolean {
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  return (month === 12 && day >= 20) || (month === 1 && day <= 20);
}

export type DayStatus = { business: boolean; reason?: string };

export function dayStatus(ymd: string, { applyRecess }: { applyRecess: boolean }): DayStatus {
  const wd = weekday(ymd);
  if (wd === 0) return { business: false, reason: "domingo" };
  if (wd === 6) return { business: false, reason: "sábado" };
  const holiday = nationalHolidays(Number(ymd.slice(0, 4))).get(ymd);
  if (holiday) return { business: false, reason: `feriado nacional (${holiday})` };
  if (applyRecess && isRecess(ymd)) return { business: false, reason: "suspensão de 20/12 a 20/01 (CPC, art. 220)" };
  return { business: true };
}

export type CalculationResult = {
  dueDate: string;
  /** Texto gravado junto ao prazo para auditoria humana: premissas e dias pulados. */
  note: string;
  skipped: { date: string; reason: string }[];
};

/**
 * @param startDate data da ciência/publicação (o dia do início NÃO é contado — CPC, art. 224)
 * @param days quantidade de dias do prazo (1 a 3650)
 */
export function calculateDeadline(input: { startDate: string; days: number; countType: CountType }): CalculationResult {
  const { startDate, days, countType } = input;
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new RangeError("Quantidade de dias inválida.");
  const skipped: { date: string; reason: string }[] = [];
  let cursor = startDate;
  let counted = 0;

  if (countType === "BUSINESS") {
    while (counted < days) {
      cursor = addDays(cursor, 1);
      const st = dayStatus(cursor, { applyRecess: true });
      if (st.business) counted += 1;
      else skipped.push({ date: cursor, reason: st.reason ?? "dia não útil" });
    }
  } else {
    cursor = addDays(startDate, days);
    // vencendo em dia sem expediente, prorroga para o primeiro dia útil seguinte (CPC, art. 224, § 1º)
    for (;;) {
      const st = dayStatus(cursor, { applyRecess: false });
      if (st.business) break;
      skipped.push({ date: cursor, reason: `${st.reason ?? "dia não útil"} — vencimento prorrogado` });
      cursor = addDays(cursor, 1);
    }
  }

  const label = countType === "BUSINESS" ? "dias úteis" : "dias corridos";
  const lines = [
    `Cálculo auxiliar: ${days} ${label} a partir de ${formatYmd(startDate)} (dia do início não contado).`,
    countType === "BUSINESS"
      ? "Excluídos sábados, domingos, feriados nacionais e o período de 20/12 a 20/01."
      : "Dias corridos; se o vencimento cair em dia sem expediente, prorroga-se ao primeiro dia útil seguinte.",
    skipped.length ? `Dias não contados/ajustados: ${skipped.map((s) => `${formatYmd(s.date)} (${s.reason})`).join("; ")}.` : "Nenhum dia pulado.",
    "Não considera feriados estaduais/municipais, suspensões do tribunal, prazo em dobro ou regras específicas. Requer validação humana.",
  ];
  return { dueDate: cursor, note: lines.join("\n"), skipped };
}
