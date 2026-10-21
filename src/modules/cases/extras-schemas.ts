import { z } from "zod";

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);

// ---------- campos personalizados ----------
export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "SELECT"] as const;
export const CUSTOM_FIELD_TYPE_LABEL: Record<(typeof CUSTOM_FIELD_TYPES)[number], string> = {
  TEXT: "Texto",
  NUMBER: "Número",
  DATE: "Data",
  SELECT: "Lista de opções",
};

export const customFieldDefSchema = z
  .object({
    label: z.string().trim().min(2, "Informe o nome do campo.").max(60),
    type: z.enum(CUSTOM_FIELD_TYPES),
    /** Uma opção por linha (só para "Lista de opções"). */
    options: text(2000),
  })
  .superRefine((v, ctx) => {
    if (v.type === "SELECT" && parseOptions(v.options).length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Informe ao menos duas opções (uma por linha)." });
  });
export type CustomFieldDefInput = z.infer<typeof customFieldDefSchema>;

export function parseOptions(raw: string): string[] {
  return [...new Set(raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))].slice(0, 40).map((s) => s.slice(0, 80));
}

/** Gera a chave estável do campo a partir do nome ("Número da pasta" -> "numero_da_pasta"). */
export function customFieldKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export const customValuesSchema = z.record(z.string().max(60), z.string().max(500));
export type CustomValuesInput = z.infer<typeof customValuesSchema>;

// ---------- notas do processo ----------
export const caseNoteSchema = z.object({
  title: text(120),
  body: z.string().trim().min(2, "Escreva a nota.").max(4000),
  pinned: z.boolean(),
});
export type CaseNoteInput = z.infer<typeof caseNoteSchema>;

export const BULK_NOTE_MAX = 50;
export const bulkNoteSchema = caseNoteSchema.extend({
  caseIds: z.array(z.uuid()).min(1, "Selecione ao menos um processo.").max(BULK_NOTE_MAX, `No máximo ${BULK_NOTE_MAX} processos por vez.`),
});
export type BulkNoteInput = z.infer<typeof bulkNoteSchema>;
