import { accumulate, brl, brNum, CalcError, fx, fxMoney, fxMul, fxStr, money, mm, monthFromIndex, monthIndex, monthKey, monthRange, rateFactor, S, toCents, centsToStr, type CalcResult, type Fx, type RateMap } from "./num";

/**
 * Atrasados previdenciários na Justiça Federal (Manual de Cálculos da JF, Tema 905 STJ):
 *  - parcelas até 06/2009: INPC mês a mês até 29/06/2009 + juros de 1% a.m. simples desde a citação, depois SELIC desde 30/06/2009;
 *  - parcelas a partir de 07/2009: apenas SELIC (fator único; sem INPC e sem juros por fora).
 * Ferramenta de apoio: o cálculo definitivo (RPV/precatório) é o do juízo/CálcJF.
 */
export const JF_BENEFIT_TYPES = ["NORMAL", "BPC", "AUXILIO_ACIDENTE"] as const;
export type JfBenefitType = (typeof JF_BENEFIT_TYPES)[number];
export const JF_BENEFIT_LABEL: Record<JfBenefitType, string> = { NORMAL: "Benefício com reajuste anual pelo INPC", BPC: "BPC/LOAS (segue o salário mínimo)", AUXILIO_ACIDENTE: "Auxílio-acidente (50% do salário de benefício)" };

export type JfInput = {
  processo?: string;
  autor?: string;
  benefitType: JfBenefitType;
  /** RMI (benefício normal e auxílio-acidente). No BPC não é usada. */
  rmi?: string;
  dib: string; // YYYY-MM-DD
  dip: string; // YYYY-MM-DD (início do pagamento administrativo; o atraso vai até o mês anterior)
  citacao?: string;
  /** Percentual do benefício (100 por padrão; 50 no auxílio-acidente). */
  percent?: string;
  /** Mês-base da atualização (YYYY-MM-DD). */
  dataBase: string;
  /** Incluir o 13º (abono anual) de cada ano. */
  decimoTerceiro?: boolean;
  /** Valor a deduzir (já recebido), abatido do total nominal. */
  deducao?: string;
};

export type JfData = { inpc: RateMap; selic: RateMap; /** ano → % */ reajuste: RateMap; /** mês → valor do salário mínimo */ salmin: RateMap };

const PHASE1_LAST = "2009-06";
const SELIC_START = "2009-07";

export function calcAtrasadosJf(i: JfInput, data: JfData, nowYm: string): CalcResult {
  const warnings: string[] = [];
  const dibM = monthKey(i.dib);
  const dipM = monthKey(i.dip);
  if (i.dip <= i.dib) throw new CalcError("A DIP precisa ser depois da DIB.");
  const lastM = monthFromIndex(monthIndex(dipM) - 1); // DCA: último dia do mês anterior à DIP
  if (monthIndex(lastM) < monthIndex(dibM)) throw new CalcError("Não há parcelas vencidas entre a DIB e a DIP.");
  if (i.dip > `${nowYm}-31`) warnings.push("A DIP está no futuro: confira a data.");
  const percent = fx(i.percent ?? (i.benefitType === "AUXILIO_ACIDENTE" ? "50" : "100"));
  if (percent === null || percent <= 0n) throw new CalcError("Percentual inválido.");
  if (i.benefitType !== "BPC" && !i.rmi) throw new CalcError("Informe a RMI.");
  const rmi = i.rmi ? money(i.rmi) : 0n;

  const citM = i.citacao ? monthKey(i.citacao) : null;
  const months = monthRange(dibM, lastM);
  const hasPhase1 = monthIndex(dibM) <= monthIndex(PHASE1_LAST);
  if (hasPhase1 && !citM) throw new CalcError("Há parcelas anteriores a 30/06/2009: informe a data da citação para os juros de 1% a.m.");
  if (hasPhase1 && citM && monthIndex(citM) > monthIndex(PHASE1_LAST)) warnings.push("Citação depois de 30/06/2009: não há juros de 1% a.m. na fase anterior (parcelas antigas só recebem INPC e depois SELIC).");
  if (citM && i.citacao! < "2009-06-30") warnings.push("Citação anterior a 30/06/2009: juros de 1% a.m. simples contados da citação até 06/2009 nas parcelas antigas.");

  // mês final da atualização: o da data-base; se a SELIC dele ainda não saiu, vai até o mês anterior (e avisa)
  const baseM = monthKey(i.dataBase);
  let endM = baseM;
  if (!data.selic.has(endM)) {
    endM = monthFromIndex(monthIndex(baseM) - 1);
    warnings.push(`SELIC de ${mm(baseM)} ainda não cadastrada/publicada: atualizado até ${mm(endM)} (resultado ligeiramente subestimado). Cadastre a taxa quando sair.`);
  }
  if (monthIndex(endM) < monthIndex(lastM)) throw new CalcError("A data-base é anterior à última parcela.");

  // valor mensal de cada competência
  const dibYear = Number(dibM.slice(0, 4));
  const monthly = new Map<string, Fx>();
  const missingReaj = new Set<string>();
  const missingSal: string[] = [];
  for (const m of months) {
    let v: Fx;
    if (i.benefitType === "BPC") {
      const sv = data.salmin.get(m);
      const f = sv === undefined ? null : fx(sv);
      if (f === null) { missingSal.push(m); continue; }
      v = f;
    } else {
      v = rmi;
      for (let y = dibYear + 1; y <= Number(m.slice(0, 4)); y++) {
        const r = data.reajuste.get(String(y));
        const p = r === undefined ? null : fx(r);
        if (p === null) { missingReaj.add(String(y)); break; }
        v = fxMul(v, rateFactor(p));
      }
    }
    v = fxMul(v, percent) / 100n;
    monthly.set(m, v);
  }
  if (missingSal.length) throw new CalcError("Falta o valor do salário mínimo de alguns meses (cadastre em Índices): " + missingSal.slice(0, 12).join(", ") + (missingSal.length > 12 ? "…" : ""), missingSal);
  if (missingReaj.size) throw new CalcError("Falta o reajuste anual do INSS (janeiro) de: " + [...missingReaj].join(", ") + ". Cadastre em Índices.", [...missingReaj]);

  // parcela do mês inicial proporcional (dias do mês a partir da DIB, base 30)
  const dibDay = Number(i.dib.slice(8, 10));
  if (dibDay > 1) {
    const days = Math.max(1, Math.min(30, 31 - dibDay)); // dia da DIB até o fim do mês, base comercial 30
    monthly.set(dibM, (monthly.get(dibM)! * BigInt(days)) / 30n);
    warnings.push(`Primeira competência proporcional: ${days}/30 (DIB no dia ${dibDay}).`);
  }

  type Row = { label: string; ym: string; year: string; due: Fx; fInpc: Fx | null; corrected: Fx; juros: Fx; fSelic: Fx; updated: Fx };
  const rows: Row[] = [];
  const missingAll = new Set<string>();
  const addRow = (label: string, ym: string, due: Fx) => {
    let corrected = due, juros = 0n, base = due, fInpc: Fx | null = null;
    let selicFrom: string;
    if (monthIndex(ym) <= monthIndex(PHASE1_LAST)) {
      const a = accumulate(monthRange(ym, PHASE1_LAST), data.inpc);
      if (!a.ok) { a.missing.forEach((x) => missingAll.add(`INPC ${x}`)); return; }
      fInpc = a.factor;
      corrected = fxMul(due, a.factor);
      if (citM && monthIndex(citM) <= monthIndex(PHASE1_LAST)) {
        const from = monthIndex(citM) > monthIndex(ym) ? citM : ym;
        const n = monthIndex(PHASE1_LAST) - monthIndex(from) + 1;
        juros = (fxMul(corrected, S / 100n) * BigInt(n));
      }
      base = corrected + juros;
      selicFrom = SELIC_START;
    } else selicFrom = ym;
    const sel = accumulate(monthRange(selicFrom, endM), data.selic);
    if (!sel.ok) { sel.missing.forEach((x) => missingAll.add(`SELIC ${x}`)); return; }
    rows.push({ label, ym, year: ym.slice(0, 4), due, fInpc, corrected, juros, fSelic: sel.factor, updated: fxMul(base, sel.factor) });
  };
  for (const m of months) {
    addRow(mm(m), m, monthly.get(m)!);
    if (i.decimoTerceiro && m.slice(5, 7) === "12") {
      const year = Number(m.slice(0, 4));
      const first = Math.max(monthIndex(dibM), year * 12);
      const mths = monthIndex(m) - first + 1;
      addRow(`13º/${year}`, m, (monthly.get(m)! * BigInt(Math.min(12, Math.max(1, mths)))) / 12n);
    }
  }
  // 13º do último ano incompleto (benefício que termina antes de dezembro): proporcional ao último mês
  if (i.decimoTerceiro && lastM.slice(5, 7) !== "12") {
    const year = Number(lastM.slice(0, 4));
    const first = Math.max(monthIndex(dibM), year * 12);
    const mths = monthIndex(lastM) - first + 1;
    addRow(`13º/${year} (proporcional)`, lastM, (monthly.get(lastM)! * BigInt(mths)) / 12n);
  }
  if (missingAll.size) {
    const list = [...missingAll];
    throw new CalcError(`Faltam índices para calcular (sincronize com o Banco Central ou cadastre em Índices): ${list.slice(0, 15).join(", ")}${list.length > 15 ? ` e mais ${list.length - 15}` : ""}.`, list);
  }

  const cents = (a: Fx) => toCents(a);
  const sumBy = (f: (r: Row) => Fx) => rows.reduce((s, r) => s + cents(f(r)), 0n);
  const totDue = sumBy((r) => r.due), totUpd = sumBy((r) => r.updated), totCorr = sumBy((r) => r.corrected), totJur = sumBy((r) => r.juros);
  const ded = i.deducao ? toCents(money(i.deducao)) : 0n;
  if (ded > 0n) warnings.push("Valor a deduzir abatido do total NOMINAL. Se houve pagamento administrativo no período, o correto é abater competência por competência (compensação).");
  const years = [...new Set(rows.map((r) => r.year))];
  const yearRows = years.map((y) => {
    const rs = rows.filter((r) => r.year === y);
    const d = rs.reduce((s, r) => s + cents(r.due), 0n);
    const u = rs.reduce((s, r) => s + cents(r.updated), 0n);
    return [y, String(rs.length), brl(centsToStr(d)), brl(centsToStr(u))];
  });
  const total = totUpd - ded;
  return {
    kind: "JF_ATRASADOS",
    title: `Atrasados previdenciários — Justiça Federal${i.processo ? ` — proc. ${i.processo}` : ""}${i.autor ? ` — ${i.autor}` : ""}`,
    total: centsToStr(total),
    summary: [
      ["Parcelas", String(rows.length)],
      ["Valor nominal devido", brl(centsToStr(totDue))],
      ...(hasPhase1 ? ([["Corrigido (INPC, fase até 06/2009)", brl(centsToStr(totCorr))], ["Juros 1% a.m. (fase até 06/2009)", brl(centsToStr(totJur))]] as [string, string][]) : []),
      ["Valor atualizado (com SELIC)", brl(centsToStr(totUpd))],
      ...(ded > 0n ? ([["(−) Valor a deduzir", brl(centsToStr(ded))]] as [string, string][]) : []),
      ["TOTAL", brl(centsToStr(total))],
      ["Atualizado até", mm(endM)],
    ],
    sections: [
      { title: "Competência a competência", columns: ["Competência", "Valor devido", "Fator INPC", "Corrigido", "Juros 1%", "Fator SELIC", "Atualizado"], rows: rows.map((r) => [r.label, brl(fxMoney(r.due)), r.fInpc ? brNum(fxStr(r.fInpc, 8)) : "—", brl(fxMoney(r.corrected)), r.juros ? brl(fxMoney(r.juros)) : "—", brNum(fxStr(r.fSelic, 8)), brl(fxMoney(r.updated))]) },
      { title: "Subtotais por ano", columns: ["Ano", "Parcelas", "Valor devido", "Atualizado"], rows: yearRows },
    ],
    warnings,
    criteria: [
      "Manual de Cálculos da Justiça Federal / Tema 905 do STJ.",
      "Parcelas até 06/2009: INPC mês a mês até 29/06/2009, juros de 1% a.m. simples desde a citação e SELIC a partir de 30/06/2009.",
      "Parcelas de 07/2009 em diante: apenas SELIC acumulada, desde o mês do vencimento (fator único, sem INPC e sem juros por fora).",
      i.benefitType === "BPC" ? "BPC/LOAS: valor mensal = salário mínimo vigente (tabela cadastrada), sem reajuste pelo INPC." : "Reajuste anual de janeiro pelos índices do INSS cadastrados (reajuste cheio a cada janeiro).",
      "Atraso: da DIB até o último dia do mês anterior à DIP.",
    ],
  };
}
