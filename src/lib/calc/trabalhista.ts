import { accumulate, brl, CalcError, fx, fxMoney, fxMul, fxStr, money, mm, monthIndex, monthKey, monthRange, S, toCents, centsToStr, type CalcResult, type Fx, type RateMap } from "./num";
import { diffDays } from "@/lib/dates/ymd";

/**
 * Verbas trabalhistas (TRT/TST). Dois modos:
 *  - ATUALIZACAO: atualiza as verbas já condenadas conforme a ADC 58/STF (pré-judicial: TR até 03/2015 e IPCA-E depois, com juros de
 *    1% a.m. pro rata die; judicial: SELIC "cheia", que já traz correção e juros);
 *  - RESCISAO: verbas rescisórias a partir dos dados do contrato.
 * O valor oficial para liquidar/peticionar é o do PJe-Calc; aqui é conferência e estimativa.
 */
export type LaborItem = { nome: string; competencia: string; valor: string };
export type LaborUpdateInput = {
  processo?: string;
  reclamante?: string;
  itens: LaborItem[];
  /** Data do ajuizamento da reclamação (1ª instância). */
  ajuizamento: string;
  dataBase: string;
  /** Honorários devidos ao procurador do reclamante (art. 791-A CLT), % sobre o total atualizado. */
  honorariosPercent?: string;
};
export type LaborData = { tr: RateMap; ipcae: RateMap; selic: RateMap };

export function calcTrabalhistaAtualizacao(i: LaborUpdateInput, data: LaborData): CalcResult {
  if (i.itens.length === 0) throw new CalcError("Informe ao menos uma verba.");
  if (i.ajuizamento > i.dataBase) throw new CalcError("O ajuizamento é posterior à data-base.");
  const warnings: string[] = [];
  const ajM = monthKey(i.ajuizamento);
  const baseM = monthKey(i.dataBase);
  let endM = baseM;
  if (!data.selic.has(endM)) {
    endM = `${monthKey(new Date(Date.UTC(Number(baseM.slice(0, 4)), Number(baseM.slice(5, 7)) - 2, 1)).toISOString())}`;
    warnings.push(`SELIC de ${mm(baseM)} ainda não cadastrada/publicada: atualizado até ${mm(endM)}.`);
  }
  const missing = new Set<string>();
  type Row = { nome: string; comp: string; orig: Fx; indice: string; fator: string; corrigido: Fx; juros: string; jurosV: Fx; selic: string; total: Fx };
  const rows: Row[] = [];
  for (const it of i.itens) {
    const orig = money(it.valor);
    const cm = monthKey(it.competencia);
    // venc. no mês da competência; fase pré-judicial vai até o ajuizamento
    const pre = monthIndex(cm) < monthIndex(ajM);
    let corrigido = orig, jurosV = 0n, indice = "—", fatorTxt = "—", jurosTxt = "—";
    if (pre) {
      // Súmula 381 TST: índice a partir do mês SUBSEQUENTE ao vencimento, até o mês anterior ao do ajuizamento
      const firstIdx = monthIndex(cm) + 1;
      const months = monthRange(`${String(Math.floor(firstIdx / 12)).padStart(4, "0")}-${String((firstIdx % 12) + 1).padStart(2, "0")}`, `${String(Math.floor((monthIndex(ajM) - 1) / 12)).padStart(4, "0")}-${String(((monthIndex(ajM) - 1) % 12) + 1).padStart(2, "0")}`);
      const tr = months.filter((m) => m < "2015-04");
      const ipca = months.filter((m) => m >= "2015-04");
      let f: Fx = S;
      if (tr.length) { const a = accumulate(tr, data.tr); if (a.ok) f = fxMul(f, a.factor); else a.missing.forEach((m) => missing.add(`TR ${mm(m)}`)); }
      if (ipca.length) { const a = accumulate(ipca, data.ipcae); if (a.ok) f = fxMul(f, a.factor); else a.missing.forEach((m) => missing.add(`IPCA-E ${mm(m)}`)); }
      indice = [tr.length ? "TR" : "", ipca.length ? "IPCA-E" : ""].filter(Boolean).join(" + ") || "—";
      fatorTxt = fxStr(f, 8).replace(".", ",");
      corrigido = fxMul(orig, f);
      // juros 1% a.m. pro rata die: dias entre o último dia da competência e o ajuizamento
      const lastDay = new Date(Date.UTC(Number(cm.slice(0, 4)), Number(cm.slice(5, 7)), 0)).getUTCDate();
      const dias = Math.max(0, diffDays(i.ajuizamento, `${cm}-${String(lastDay).padStart(2, "0")}`));
      jurosV = (fxMul(corrigido, S / 100n) * BigInt(dias)) / 30n;
      jurosTxt = `${dias} dias (${fxStr((BigInt(dias) * S) / 30n, 2).replace(".", ",")}%)`;
    }
    // fase judicial: SELIC do mês do ajuizamento (ou da competência, se posterior) até a data-base
    const selicFrom = pre ? ajM : cm;
    let total = corrigido + jurosV, selicTxt = "—";
    if (monthIndex(selicFrom) <= monthIndex(endM)) {
      const a = accumulate(monthRange(selicFrom, endM), data.selic);
      if (a.ok) { total = fxMul(total, a.factor); selicTxt = fxStr(a.factor, 8).replace(".", ","); }
      else a.missing.forEach((m) => missing.add(`SELIC ${mm(m)}`));
    }
    rows.push({ nome: it.nome, comp: mm(cm), orig, indice: pre ? indice : "SELIC", fator: fatorTxt, corrigido, juros: jurosTxt, jurosV, selic: selicTxt, total });
  }
  if (missing.size) {
    const list = [...missing];
    throw new CalcError(`Faltam índices (cadastre em Índices; TR e IPCA-E são lançados pelo escritório): ${list.slice(0, 12).join(", ")}${list.length > 12 ? ` e mais ${list.length - 12}` : ""}.`, list);
  }
  const c = (a: Fx) => toCents(a);
  const origC = rows.reduce((s, r) => s + c(r.orig), 0n);
  const totC = rows.reduce((s, r) => s + c(r.total), 0n);
  const hp = i.honorariosPercent ? fx(i.honorariosPercent) : null;
  if (i.honorariosPercent && hp === null) throw new CalcError("Percentual de honorários inválido.");
  const honC = hp ? toCents(fxMul(totC * (S / 100n), hp) / 100n) : 0n;
  const custasC = (origC * 2n + 50n) / 100n;
  const grand = totC + honC + custasC;
  warnings.push("Para liquidar ou peticionar, confirme o valor no PJe-Calc (sistema homologado). Este cálculo é de conferência.");
  return {
    kind: "TRABALHISTA",
    title: `Atualização de verbas trabalhistas${i.processo ? ` — proc. ${i.processo}` : ""}${i.reclamante ? ` — ${i.reclamante}` : ""}`,
    total: centsToStr(grand),
    summary: [
      ["Principal original", brl(centsToStr(origC))],
      ["Principal atualizado", brl(centsToStr(totC))],
      ...(honC > 0n ? ([[`(+) Honorários ${i.honorariosPercent}% (art. 791-A CLT)`, brl(centsToStr(honC))]] as [string, string][]) : []),
      ["(+) Custas (2% do valor original, art. 789 CLT)", brl(centsToStr(custasC))],
      ["TOTAL GERAL", brl(centsToStr(grand))],
      ["Atualizado até", mm(endM)],
    ],
    sections: [{ title: "Verbas atualizadas", columns: ["Verba", "Competência", "Valor principal", "Índice", "Fator pré-judicial", "Corrigido", "Juros 1% (pro rata)", "Fator SELIC", "Total"], rows: rows.map((r) => [r.nome, r.comp, brl(fxMoney(r.orig)), r.indice, r.fator, brl(fxMoney(r.corrigido)), r.jurosV ? `${brl(fxMoney(r.jurosV))} — ${r.juros}` : "SELIC inclusa", r.selic, brl(fxMoney(r.total))]) }],
    warnings,
    criteria: [
      "ADC 58/STF. Pré-judicial (até o ajuizamento): TR até 03/2015 e IPCA-E depois, a partir do mês subsequente ao vencimento (Súmula 381 TST), mais juros de 1% a.m. pro rata die.",
      "Judicial (do ajuizamento em diante): SELIC acumulada, que já inclui correção e juros (não se soma nada por fora).",
      "Honorários só do procurador do reclamante; honorários do advogado da reclamada não entram.",
    ],
  };
}

// ---------- rescisão ----------
export const TERMINATION_TYPES = ["SEM_JUSTA_CAUSA", "JUSTA_CAUSA", "PEDIDO_DEMISSAO", "ACORDO"] as const;
export type TerminationType = (typeof TERMINATION_TYPES)[number];
export const TERMINATION_LABEL: Record<TerminationType, string> = { SEM_JUSTA_CAUSA: "Dispensa sem justa causa", JUSTA_CAUSA: "Dispensa por justa causa", PEDIDO_DEMISSAO: "Pedido de demissão", ACORDO: "Acordo (art. 484-A CLT)" };

export type RescisaoInput = {
  reclamante?: string;
  admissao: string;
  demissao: string;
  tipo: TerminationType;
  salario: string;
  /** Períodos aquisitivos completos de férias não gozadas. */
  feriasVencidas?: number;
  /** Saldo do FGTS (extrato). Sem ele, estima 8% do salário × meses de contrato e avisa. */
  saldoFgts?: string;
  /** Verbas pagas depois do prazo do art. 477, §6º. */
  atrasoPagamento?: boolean;
  /** Valor incontroverso não pago até a audiência (multa do art. 467 = 50%). Só dispensa sem justa causa. */
  incontroverso?: string;
};

function addYears(ymd: string, n: number) { return `${String(Number(ymd.slice(0, 4)) + n).padStart(4, "0")}${ymd.slice(4)}`; }
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Meses "avos" de [start, end] dentro do ano/período: mês conta inteiro com 15 dias ou mais de trabalho. */
function avos(start: string, end: string): number {
  let n = 0;
  for (let i = monthIndex(monthKey(start)); i <= monthIndex(monthKey(end)); i++) {
    const y = Math.floor(i / 12), m = (i % 12) + 1;
    const from = i === monthIndex(monthKey(start)) ? Number(start.slice(8, 10)) : 1;
    const to = i === monthIndex(monthKey(end)) ? Number(end.slice(8, 10)) : dim(y, m);
    if (to - from + 1 >= 15) n++;
  }
  return n;
}

export function calcRescisao(i: RescisaoInput): CalcResult {
  if (i.demissao < i.admissao) throw new CalcError("A demissão é anterior à admissão.");
  const sal = money(i.salario);
  const warnings: string[] = [];
  const rows: [string, string, string][] = [];
  let total = 0n;
  const add = (nome: string, detalhe: string, v: Fx) => { const c = toCents(v); rows.push([nome, detalhe, brl(centsToStr(c))]); total += c; };

  const dY = Number(i.demissao.slice(0, 4)), dD = Number(i.demissao.slice(8, 10));
  const justa = i.tipo === "JUSTA_CAUSA";
  const sj = i.tipo === "SEM_JUSTA_CAUSA";
  const acordo = i.tipo === "ACORDO";

  add("Saldo de salário", `${dD} dias`, (sal * BigInt(dD)) / 30n);

  // anos completos de contrato
  let anos = 0;
  while (addYears(i.admissao, anos + 1) <= i.demissao) anos++;
  if (sj || acordo) {
    const dias = Math.min(30 + 3 * anos, 90);
    const full = (sal * BigInt(dias)) / 30n;
    add(acordo ? "Aviso prévio indenizado (50%)" : "Aviso prévio indenizado", `${dias} dias (Lei 12.506/2011)`, acordo ? full / 2n : full);
    warnings.push("O aviso prévio indenizado integra o tempo de serviço (projeção): confira se 13º e férias proporcionais devem considerá-lo. Aqui não foi projetado.");
  }
  if (!justa) {
    const yStart = `${dY}-01-01` > i.admissao ? `${dY}-01-01` : i.admissao;
    const n13 = avos(yStart, i.demissao);
    add("13º salário proporcional", `${n13}/12`, (sal * BigInt(n13)) / 12n);
    // período aquisitivo em curso
    const acq = addYears(i.admissao, anos);
    const nf = avos(acq, i.demissao);
    const f = (sal * BigInt(Math.min(nf, 12))) / 12n;
    add("Férias proporcionais", `${Math.min(nf, 12)}/12`, f);
    add("1/3 constitucional sobre férias proporcionais", "1/3", f / 3n);
  }
  const fv = i.feriasVencidas ?? 0;
  if (fv > 0) {
    add("Férias vencidas", `${fv} período(s)`, sal * BigInt(fv));
    add("1/3 constitucional sobre férias vencidas", "1/3", (sal * BigInt(fv)) / 3n);
  }
  if (sj || acordo) {
    let saldo: Fx;
    if (i.saldoFgts) saldo = money(i.saldoFgts);
    else {
      const meses = Math.max(1, monthIndex(monthKey(i.demissao)) - monthIndex(monthKey(i.admissao)) + 1);
      saldo = (sal * BigInt(meses) * 8n) / 100n;
      warnings.push("Saldo do FGTS ESTIMADO em 8% do salário atual × meses de contrato. Use o extrato do FGTS para o valor correto.");
    }
    add(acordo ? "Multa do FGTS (20%)" : "Multa do FGTS (40%)", `sobre ${brl(fxMoney(saldo))}`, (saldo * (acordo ? 20n : 40n)) / 100n);
  }
  if (i.atrasoPagamento) add("Multa do art. 477, §8º, CLT", "1 salário", sal);
  if (i.incontroverso) {
    if (sj) add("Multa do art. 467 CLT (50% do incontroverso)", brl(fxMoney(money(i.incontroverso))), money(i.incontroverso) / 2n);
    else warnings.push("A multa do art. 467 só foi calculada para dispensa sem justa causa; ignorada neste tipo de rescisão.");
  }
  if (justa && fv === 0) warnings.push("Justa causa: sem 13º, férias proporcionais, aviso nem multa do FGTS. Só saldo de salário e férias vencidas (se houver).");
  return {
    kind: "RESCISAO",
    title: `Verbas rescisórias${i.reclamante ? ` — ${i.reclamante}` : ""}`,
    total: centsToStr(total),
    summary: [["Tipo", TERMINATION_LABEL[i.tipo]], ["Salário", brl(fxMoney(sal))], ["Anos completos de contrato", String(anos)], ["TOTAL BRUTO", brl(centsToStr(total))]],
    sections: [{ title: "Verbas", columns: ["Verba", "Base", "Valor"], rows: rows.map((r) => [...r]) }],
    warnings: [...warnings, "Valores brutos, sem descontos de INSS/IRRF. Horas extras, adicionais e reflexos não entram neste cálculo."],
    criteria: ["Fórmulas do art. 487 CLT, Lei 12.506/2011 e regras do 13º/férias (mês com 15 dias ou mais conta inteiro).", "Saldo de salário = salário ÷ 30 × dias trabalhados no mês."],
  };
}
