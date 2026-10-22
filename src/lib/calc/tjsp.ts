import { accumulate, brl, brNum, CalcError, fx, fxMoney, fxMul, fxStr, fxDiv, money, mm, monthFromIndex, monthIndex, monthKey, monthRange, S, toCents, centsToStr, type CalcResult, type Fx, type RateMap } from "./num";

/**
 * Débitos judiciais cíveis (TJSP) — Lei 14.905/2024 e Prov. CG 54/2024. A metodologia vem da sentença:
 *  TABELA_TJSP: fator da Tabela Prática (F_fim/F_ini) + juros de 1% a.m. simples sobre o corrigido (meses inteiros, do mês do vencimento ao da tabela, inclusive);
 *  SELIC: valor × SELIC acumulada (sem correção da tabela nem 1% por cima);
 *  HIBRIDO: até 29/08/2024 tabela + 1%; de 30/08/2024 em diante SELIC.
 */
export const TJSP_METHODS = ["TABELA_TJSP", "SELIC", "HIBRIDO"] as const;
export type TjspMethod = (typeof TJSP_METHODS)[number];
export const TJSP_METHOD_LABEL: Record<TjspMethod, string> = { TABELA_TJSP: "Tabela Prática do TJSP + juros de 1% a.m.", SELIC: "Somente SELIC", HIBRIDO: "Híbrido (tabela + 1% até 29/08/2024; SELIC depois)" };

export type TjspItem = { descricao: string; valor: string; vencimento: string };
export type TjspInput = {
  processo?: string;
  metodo: TjspMethod;
  itens: TjspItem[];
  /** Mês da tabela / data-base (YYYY-MM-DD). */
  dataBase: string;
  /** Juros mensais simples da fase "tabela" em % (1 por padrão; 0,5 para Fazenda Pública — art. 1º-F da Lei 9.494/97). */
  jurosMensais?: string;
  /** Multa do art. 523 §1º CPC (10%) — só se a sentença determinar. */
  multa10?: boolean;
  /** Honorários (art. 85 CPC), % sobre o total atualizado — só se a sentença determinar. */
  honorariosPercent?: string;
};
export type TjspData = { tabela: RateMap; selic: RateMap };

const HYBRID_CUT_DAY = "2024-08-30";
const HYBRID_LAST_TABLE = "2024-08";

export function calcTjsp(i: TjspInput, data: TjspData): CalcResult {
  if (i.itens.length === 0) throw new CalcError("Informe ao menos um valor.");
  const warnings: string[] = [];
  const baseM = monthKey(i.dataBase);
  const juros = fx(i.jurosMensais ?? "1");
  if (juros === null || juros < 0n) throw new CalcError("Taxa de juros inválida.");
  const factor = (m: string) => { const v = data.tabela.get(m); return v === undefined ? null : fx(v); };
  const missing = new Set<string>();

  // SELIC: da fonte; mês-base ainda não publicado → vai até o mês anterior e avisa
  let selicEnd = baseM;
  if (i.metodo !== "TABELA_TJSP" && !data.selic.has(selicEnd)) {
    selicEnd = monthFromIndex(monthIndex(baseM) - 1);
    warnings.push(`SELIC de ${mm(baseM)} ainda não publicada/cadastrada: atualizado até ${mm(selicEnd)}. Para o mês corrente use a SELIC diária e cadastre a taxa quando fechar.`);
  }
  if (i.metodo !== "SELIC" && factor(baseM) === null) missing.add(`Tabela TJSP ${mm(baseM)}`);

  type Row = { desc: string; venc: string; orig: Fx; fator: string; corrigido: Fx; meses: string; juros: Fx; selic: string; total: Fx };
  const rows: Row[] = [];
  for (const it of i.itens) {
    const orig = money(it.valor);
    const vm = monthKey(it.vencimento);
    if (monthIndex(vm) > monthIndex(baseM)) throw new CalcError(`Vencimento de "${it.descricao}" é posterior à data-base.`);
    let tableEnd: string | null = null; // fim da fase "tabela"
    let selicFrom: string | null = null;
    if (i.metodo === "TABELA_TJSP") tableEnd = baseM;
    else if (i.metodo === "SELIC") selicFrom = monthFromIndex(monthIndex(vm) + 1);
    else if (it.vencimento >= HYBRID_CUT_DAY) selicFrom = monthFromIndex(monthIndex(vm) + 1);
    else { tableEnd = HYBRID_LAST_TABLE; selicFrom = "2024-09"; }
    if (tableEnd && monthIndex(tableEnd) > monthIndex(baseM)) { tableEnd = baseM; selicFrom = null; }

    let corrigido = orig, jur = 0n, fatorTxt = "—", mesesTxt = "—", selicTxt = "—";
    if (tableEnd) {
      const fi = factor(vm), ff = factor(tableEnd);
      if (fi === null) missing.add(`Tabela TJSP ${mm(vm)}`);
      if (ff === null) missing.add(`Tabela TJSP ${mm(tableEnd)}`);
      if (fi === null || ff === null) continue;
      const fat = fxDiv(ff, fi);
      corrigido = fxMul(orig, fat);
      const n = monthIndex(tableEnd) - monthIndex(vm) + 1;
      jur = (fxMul(corrigido, juros / 100n) * BigInt(n));
      fatorTxt = brNum(fxStr(fat, 8));
      mesesTxt = `${n} meses (${brNum(fxStr(juros * BigInt(n), 2))}%)`;
    }
    let total = corrigido + jur;
    if (selicFrom && monthIndex(selicFrom) <= monthIndex(selicEnd)) {
      const a = accumulate(monthRange(selicFrom, selicEnd), data.selic);
      if (!a.ok) { a.missing.forEach((m) => missing.add(`SELIC ${mm(m)}`)); continue; }
      total = fxMul(total, a.factor);
      selicTxt = brNum(fxStr(a.factor, 8));
    }
    if (toCents(total) < toCents(orig)) warnings.push(`"${it.descricao}": o total ficou menor que o valor original (índice negativo). Confira com a sentença.`);
    rows.push({ desc: it.descricao, venc: it.vencimento, orig, fator: fatorTxt, corrigido, meses: mesesTxt, juros: jur, selic: selicTxt, total });
  }
  if (missing.size) {
    const list = [...missing];
    throw new CalcError(`Faltam índices para calcular (cadastre em Índices ou carregue as tabelas do escritório): ${list.slice(0, 12).join(", ")}${list.length > 12 ? ` e mais ${list.length - 12}` : ""}.`, list);
  }
  const c = (a: Fx) => toCents(a);
  const sum = (f: (r: Row) => Fx) => rows.reduce((s, r) => s + c(f(r)), 0n);
  const principal = sum((r) => r.orig), updated = sum((r) => r.total);
  const multaC = i.multa10 ? (updated * 10n + 50n) / 100n : 0n;
  const hp = i.honorariosPercent ? fx(i.honorariosPercent) : null;
  if (i.honorariosPercent && (hp === null || hp < 0n)) throw new CalcError("Percentual de honorários inválido.");
  const honC = hp ? toCents(fxMul(updated * (S / 100n), hp) / 100n) : 0n;
  const total = updated + multaC + honC;
  return {
    kind: "TJSP",
    title: `Débito judicial cível (TJSP)${i.processo ? ` — proc. ${i.processo}` : ""}`,
    total: centsToStr(total),
    summary: [
      ["Metodologia", TJSP_METHOD_LABEL[i.metodo]],
      ["Valor original", brl(centsToStr(principal))],
      ["Valor atualizado", brl(centsToStr(updated))],
      ...(i.multa10 ? ([["Multa 10% (art. 523, §1º, CPC)", brl(centsToStr(multaC))]] as [string, string][]) : []),
      ...(honC > 0n ? ([[`Honorários ${i.honorariosPercent}% (art. 85 CPC)`, brl(centsToStr(honC))]] as [string, string][]) : []),
      ["TOTAL", brl(centsToStr(total))],
      ["Data-base", mm(baseM)],
    ],
    sections: [{ title: "Atualização por item", columns: ["Item", "Vencimento", "Valor original", "Fator da tabela", "Corrigido", "Juros", "Fator SELIC", "Total"], rows: rows.map((r) => [r.desc, `${r.venc.slice(8)}/${r.venc.slice(5, 7)}/${r.venc.slice(0, 4)}`, brl(fxMoney(r.orig)), r.fator, brl(fxMoney(r.corrigido)), r.juros ? `${brl(fxMoney(r.juros))} — ${r.meses}` : "—", r.selic, brl(fxMoney(r.total))]) }],
    warnings,
    criteria: [
      "Lei 14.905/2024 e Provimento CG 54/2024 (TJSP). A metodologia é a da sentença.",
      i.metodo === "SELIC" ? "SELIC: valor × SELIC acumulada a partir do mês seguinte ao vencimento; sem correção da tabela nem 1% a.m. por cima (vedado bis in idem)." : "Tabela Prática: fator = F(mês final) ÷ F(mês do vencimento); juros simples sobre o valor corrigido, em meses inteiros do mês do vencimento ao da tabela, inclusive (sem pro rata).",
      ...(i.metodo === "HIBRIDO" ? ["Híbrido: até 29/08/2024 tabela + juros; de 30/08/2024 em diante a SELIC incide sobre o total da fase anterior."] : []),
      "Arredondamento em 2 casas apenas no resultado de cada linha.",
    ],
  };
}
