import { z } from "zod";

export const OFFSET_PRESETS = [-7, -3, -1, 0, 1, 3, 7, 15, 30] as const;
export const offsetLabel = (o: number) => (o < 0 ? `${-o} dia${o === -1 ? "" : "s"} antes do vencimento` : o === 0 ? "no dia do vencimento" : `${o} dia${o === 1 ? "" : "s"} depois do vencimento (atraso)`);

export const billingSchema = z.object({
  offsets: z.array(z.number().int().min(-30).max(365)).min(1, "Escolha pelo menos um momento de envio.").max(8, "No máximo 8 momentos."),
  sendHour: z.number().int().min(0).max(23),
  skipWeekends: z.boolean(),
  maxOverdueDays: z.number().int().min(1).max(365),
  beforeText: z.string().trim().min(10, "Texto do lembrete: mínimo 10 caracteres.").max(800, "Texto do lembrete: no máximo 800 caracteres."),
  dueText: z.string().trim().min(10, "Texto do dia do vencimento: mínimo 10 caracteres.").max(800, "Texto do dia do vencimento: no máximo 800 caracteres."),
  overdueText: z.string().trim().min(10, "Texto de atraso: mínimo 10 caracteres.").max(800, "Texto de atraso: no máximo 800 caracteres."),
  paymentInfo: z.string().trim().max(500, "Dados de pagamento: no máximo 500 caracteres.").nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
});
export type BillingInput = z.infer<typeof billingSchema>;

export const BILLING_VARS = ["nome", "valor", "vencimento", "parcela", "descricao"] as const;
export const BILLING_VARS_HINT = "Pode usar {{nome}}, {{valor}} (saldo em aberto), {{vencimento}}, {{parcela}} e {{descricao}}.";

export type BillingVars = Record<(typeof BILLING_VARS)[number], string>;
export function renderBilling(text: string, v: BillingVars): string {
  return text.replace(/\{\{(nome|valor|vencimento|parcela|descricao)\}\}/g, (_, k: keyof BillingVars) => v[k]);
}

export type BillingKind = "BEFORE" | "DUE" | "OVERDUE";
export const BILLING_KIND_LABEL: Record<BillingKind, string> = { BEFORE: "Lembrete antes do vencimento", DUE: "Vence hoje", OVERDUE: "Em atraso" };
/** Palavras com que o cliente pede para parar de receber os lembretes. */
export const STOP_WORDS = ["parar", "pare", "sair"];
