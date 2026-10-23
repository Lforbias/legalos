import { z } from "zod";
export const CONDITION_FIELDS = { label: "Título do gatilho", content: "Teor da intimação", court: "Tribunal / órgão", kind: "Tipo da intimação", source: "Origem (DJEN, MNI, IMPORTED, MANUAL, PASTED, FILE)", tag: "Etiqueta da intimação", area: "Área do processo" } as const;
export const conditionsSchema = z.object({ mode: z.enum(["ALL", "ANY"]), items: z.array(z.object({ field: z.enum(["label", "content", "court", "kind", "source", "tag", "area"]), operator: z.enum(["CONTAINS", "EQUALS", "NOT_CONTAINS"]), value: z.string().trim().min(1, "Informe o valor da condição.").max(200) })).max(10) });
export type Conditions = z.infer<typeof conditionsSchema>;
export const EMPTY_CONDITIONS: Conditions = { mode: "ALL", items: [] };
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
/** Sem regex de usuário. Campo ausente nunca satisfaz condição negativa. */
export function matchesConditions(raw: unknown, values: Partial<Record<keyof typeof CONDITION_FIELDS, string | string[] | null>>): boolean {
  const parsed = conditionsSchema.safeParse(raw);
  if (!parsed.success) return false;
  if (!parsed.data.items.length) return true;
  const matches = parsed.data.items.map(c => {
    const rawValue = values[c.field];
    if (rawValue == null) return false;
    const candidates = (Array.isArray(rawValue) ? rawValue : [rawValue]).map(fold);
    const needle = fold(c.value);
    if (c.operator === "NOT_CONTAINS") return candidates.every(v => !v.includes(needle));
    return candidates.some(v => c.operator === "EQUALS" ? v === needle : v.includes(needle));
  });
  return parsed.data.mode === "ALL" ? matches.every(Boolean) : matches.some(Boolean);
}
