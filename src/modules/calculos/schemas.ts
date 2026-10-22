import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";
import { parseMoneyBR } from "@/lib/validation/money";
import { JF_BENEFIT_TYPES } from "@/lib/calc/jf";
import { TJSP_METHODS } from "@/lib/calc/tjsp";
import { TERMINATION_TYPES } from "@/lib/calc/trabalhista";
import { ACTS } from "@/lib/calc/prazos";

export const CALC_KINDS = ["JF_ATRASADOS", "TJSP", "TRABALHISTA", "RESCISAO", "PRAZO"] as const;
export type CalcKind = (typeof CALC_KINDS)[number];
export const CALC_KIND_LABEL: Record<CalcKind, string> = {
  JF_ATRASADOS: "Atrasados previdenciários (Justiça Federal)",
  TJSP: "Débito judicial cível (TJSP)",
  TRABALHISTA: "Atualização de verbas trabalhistas",
  RESCISAO: "Verbas rescisórias",
  PRAZO: "Prazo processual",
};

const ymd = z.string().refine(isYmd, "Data inválida.");
const optYmd = z.preprocess((v) => (v === "" || v == null ? undefined : v), ymd.optional());
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());
const moneyBR = z.string().transform((v, ctx) => {
  const m = parseMoneyBR(v);
  if (m === null) { ctx.addIssue({ code: "custom", message: "Valor inválido. Exemplo: 1.234,56" }); return z.NEVER; }
  return m;
});
const optMoney = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), moneyBR.optional());
/** Percentual/taxa em formato brasileiro ("0,5", "10") → "0.5". */
const pct = z.string().transform((v, ctx) => {
  const t = v.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,6})?$/.test(t)) { ctx.addIssue({ code: "custom", message: "Percentual inválido. Exemplo: 10 ou 0,5" }); return z.NEVER; }
  return t;
});
const optPct = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), pct.optional());
const flag = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

export const jfSchema = z.object({
  processo: optText(60), autor: optText(160),
  benefitType: z.enum(JF_BENEFIT_TYPES),
  rmi: optMoney, dib: ymd, dip: ymd, citacao: optYmd, percent: optPct, dataBase: ymd,
  decimoTerceiro: flag.optional(), deducao: optMoney,
});
export const tjspSchema = z.object({
  processo: optText(60), metodo: z.enum(TJSP_METHODS), dataBase: ymd,
  itens: z.array(z.object({ descricao: z.string().trim().min(1, "Descreva o item.").max(120), valor: moneyBR, vencimento: ymd })).min(1, "Informe ao menos um valor.").max(100),
  jurosMensais: optPct, multa10: flag.optional(), honorariosPercent: optPct,
});
export const trabalhistaSchema = z.object({
  processo: optText(60), reclamante: optText(160), ajuizamento: ymd, dataBase: ymd, honorariosPercent: optPct,
  itens: z.array(z.object({ nome: z.string().trim().min(1, "Descreva a verba.").max(120), competencia: ymd, valor: moneyBR })).min(1, "Informe ao menos uma verba.").max(200),
});
export const rescisaoSchema = z.object({
  reclamante: optText(160), admissao: ymd, demissao: ymd, tipo: z.enum(TERMINATION_TYPES), salario: moneyBR,
  feriasVencidas: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().int().min(0).max(10)),
  saldoFgts: optMoney, atrasoPagamento: flag.optional(), incontroverso: optMoney,
});
export const prazoSchema = z.object({
  processo: optText(60), actKey: z.string().refine((k) => ACTS.some((a) => a.key === k), "Escolha o ato."), intimacao: ymd,
});

export const SCHEMAS = { JF_ATRASADOS: jfSchema, TJSP: tjspSchema, TRABALHISTA: trabalhistaSchema, RESCISAO: rescisaoSchema, PRAZO: prazoSchema } as const;

export const indexInputSchema = z.object({
  series: z.enum(["INPC", "IPCA", "SELIC", "IPCAE", "TR", "TJSP", "REAJUSTE_INSS", "SALMIN"]),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido."),
  value: z.string().trim().min(1, "Informe o valor."),
});
