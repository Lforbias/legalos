import { z } from "zod";
import { parseMoneyBR } from "@/lib/validation/money";
import { INDEX_SERIES } from "@/lib/finance/correction";

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const ymd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const dateOrEmpty = z.string().trim().refine((v) => v === "" || ymd(v), "Data inválida.");

export const FEE_KINDS = ["CONTRATUAL", "EXITO", "SUCUMBENCIA", "OUTRO"] as const;
export const FEE_KIND_LABEL: Record<(typeof FEE_KINDS)[number], string> = { CONTRATUAL: "Contratual", EXITO: "Êxito", SUCUMBENCIA: "Sucumbência", OUTRO: "Outro" };

export const feeSchema = z
  .object({
    kind: z.enum(FEE_KINDS),
    description: z.string().trim().min(3, "Descreva o honorário.").max(200),
    amount: text(20).refine((v) => v === "" || (parseMoneyBR(v) !== null), "Valor inválido. Exemplo: 1.234,56"),
    percent: text(6).refine((v) => v === "" || /^\d{1,3}([.,]\d{1,2})?$/.test(v), "Percentual inválido. Exemplo: 30"),
    notes: text(1000),
  })
  .refine((v) => v.amount !== "" || v.percent !== "", { message: "Informe o valor ou o percentual.", path: ["amount"] })
  .refine((v) => v.percent === "" || Number(v.percent.replace(",", ".")) <= 100, { message: "O percentual não pode passar de 100.", path: ["percent"] });
export type FeeInput = z.infer<typeof feeSchema>;

export const LINK_KINDS = ["APENSO", "DEPENDENTE", "CONEXO"] as const;
export const LINK_KIND_LABEL: Record<(typeof LINK_KINDS)[number], string> = { APENSO: "Apenso", DEPENDENTE: "Dependente / incidente", CONEXO: "Conexo / relacionado" };
export const linkSchema = z.object({ relatedCaseId: z.uuid("Escolha o processo."), kind: z.enum(LINK_KINDS), notes: text(500) });

export const DEGREES = ["PRIMEIRO", "SEGUNDO", "SUPERIOR", "EXTRAORDINARIO"] as const;
export const DEGREE_LABEL: Record<(typeof DEGREES)[number], string> = { PRIMEIRO: "1º grau", SEGUNDO: "2º grau", SUPERIOR: "Tribunais superiores (STJ/TST)", EXTRAORDINARIO: "STF" };
export const APPEAL_STATUSES = ["PENDENTE", "PROVIDO", "PARCIAL", "IMPROVIDO", "NAO_CONHECIDO", "DESISTIDO"] as const;
export const APPEAL_STATUS_LABEL: Record<(typeof APPEAL_STATUSES)[number], string> = { PENDENTE: "Pendente de julgamento", PROVIDO: "Provido", PARCIAL: "Parcialmente provido", IMPROVIDO: "Improvido", NAO_CONHECIDO: "Não conhecido", DESISTIDO: "Desistência" };
export const appealSchema = z
  .object({
    degree: z.enum(DEGREES),
    appealType: z.string().trim().min(2, "Informe o tipo (apelação, agravo…).").max(80),
    number: text(40),
    court: text(120),
    filedOn: dateOrEmpty,
    status: z.enum(APPEAL_STATUSES),
    judgedOn: dateOrEmpty,
    notes: text(1000),
  })
  .refine((v) => v.judgedOn === "" || v.filedOn === "" || v.judgedOn >= v.filedOn, { message: "O julgamento não pode ser antes da interposição.", path: ["judgedOn"] });
export type AppealInput = z.infer<typeof appealSchema>;

export const valuationSchema = z
  .object({
    claimBaseDate: dateOrEmpty,
    provisionValue: text(20).refine((v) => v === "" || parseMoneyBR(v) !== null, "Valor inválido. Exemplo: 1.234,56"),
    provisionBaseDate: dateOrEmpty,
    correctionIndex: z.enum(["", ...INDEX_SERIES]),
  })
  .refine((v) => v.provisionValue === "" || v.provisionBaseDate !== "", { message: "Informe a data da provisão.", path: ["provisionBaseDate"] });
export type ValuationInput = z.infer<typeof valuationSchema>;
