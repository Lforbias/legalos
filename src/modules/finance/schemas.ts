import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";
import { parseMoneyBR } from "@/lib/validation/money";

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const uuidOrEmpty = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador inválido.");
const money = (required: boolean) =>
  text(20).refine((v) => (v === "" ? !required : parseMoneyBR(v) !== null), required ? "Informe um valor válido. Exemplo: 1.234,56" : "Valor inválido. Exemplo: 1.234,56");
const ymd = (msg = "Data inválida.") => text(10).refine((v) => isYmd(v), msg);

export const ENTRY_KINDS = ["RECEIVABLE", "PAYABLE"] as const;
export const ENTRY_KIND_LABEL: Record<(typeof ENTRY_KINDS)[number], string> = { RECEIVABLE: "A receber", PAYABLE: "A pagar" };
export const ENTRY_TYPES = ["FEE", "EXPENSE", "OTHER"] as const;
export const ENTRY_TYPE_LABEL: Record<(typeof ENTRY_TYPES)[number], string> = { FEE: "Honorários", EXPENSE: "Despesa", OTHER: "Outro" };
export const ENTRY_STATUS_LABEL = { OPEN: "Em aberto", PARTIAL: "Parcial", PAID: "Pago", CANCELED: "Cancelado" } as const;
export type EntryStatusKey = keyof typeof ENTRY_STATUS_LABEL;
export const ACCOUNT_KINDS = ["CHECKING", "CASH", "OTHER"] as const;
export const ACCOUNT_KIND_LABEL: Record<(typeof ACCOUNT_KINDS)[number], string> = { CHECKING: "Conta corrente", CASH: "Caixa", OTHER: "Outra" };
export const PAYMENT_METHODS = ["PIX", "Transferência", "Boleto", "Cartão", "Dinheiro", "Cheque", "Outro"] as const;

export const accountSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  kind: z.enum(ACCOUNT_KINDS),
  initialBalance: money(false),
  openingDate: text(10).refine((v) => v === "" || isYmd(v), "Data inválida."),
});
export type AccountInput = z.infer<typeof accountSchema>;
export const EMPTY_ACCOUNT: AccountInput = { name: "", kind: "CHECKING", initialBalance: "", openingDate: "" };

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  color: text(7).refine((v) => v === "" || /^#[0-9A-Fa-f]{6}$/.test(v), "Use o formato #RRGGBB."),
});
export type CategoryInput = z.infer<typeof categorySchema>;
export const EMPTY_CATEGORY: CategoryInput = { name: "", color: "" };

export const costCenterSchema = z.object({ name: z.string().trim().min(2, "Informe o nome.").max(80) });
export type CostCenterInput = z.infer<typeof costCenterSchema>;

export const entrySchema = z.object({
  kind: z.enum(ENTRY_KINDS),
  type: z.enum(ENTRY_TYPES),
  description: z.string().trim().min(2, "Descreva o lançamento.").max(200),
  amount: money(true),
  issueDate: ymd("Informe a data de emissão."),
  dueDate: ymd("Informe o vencimento."),
  accountId: uuidOrEmpty,
  categoryId: uuidOrEmpty,
  costCenterId: uuidOrEmpty,
  clientId: uuidOrEmpty,
  caseId: uuidOrEmpty,
  counterparty: text(160),
  notes: text(2000),
  installments: z.string().refine((v) => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 60, "Use de 1 a 60 parcelas."),
});
export type EntryInput = z.infer<typeof entrySchema>;
export const EMPTY_ENTRY: EntryInput = {
  kind: "RECEIVABLE", type: "FEE", description: "", amount: "", issueDate: "", dueDate: "", accountId: "", categoryId: "", costCenterId: "", clientId: "", caseId: "", counterparty: "", notes: "", installments: "1",
};

export const paymentSchema = z.object({
  amount: money(true),
  paidOn: ymd("Informe a data do pagamento."),
  accountId: z.string().refine((v) => z.uuid().safeParse(v).success, "Escolha a conta."),
  method: text(40),
  note: text(500),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const reasonSchema = z.object({ reason: z.string().trim().min(3, "Informe o motivo.").max(500) });
export type ReasonInput = z.infer<typeof reasonSchema>;
