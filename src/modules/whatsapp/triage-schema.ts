import { z } from "zod";

/** Áreas do modelo de triagem. Palavras iniciais vêm do que o escritório já usa hoje; o escritório edita antes de criar. "Outros" não tem regra: cai na fila padrão. */
export const TRIAGE_AREAS = [
  { key: "previdenciario", label: "Previdenciário", keywords: ["inss", "aposentadoria", "auxílio doença", "auxilio-doenca", "bpc", "loas", "pensão por morte", "perícia", "benefício negado", "benefício cortado", "salário maternidade", "cnis"] },
  { key: "trabalhista", label: "Trabalhista", keywords: ["fui demitido", "mandaram embora", "justa causa", "rescisão", "fgts", "hora extra", "verbas rescisórias", "salário atrasado", "assédio", "carteira assinada", "sem registro"] },
  { key: "civel", label: "Cível", keywords: ["nome negativado", "negativaram", "serasa", "cobrança indevida", "banco", "empréstimo", "plano de saúde", "divórcio", "guarda", "pensão alimentícia", "inventário", "herança", "acidente", "erro médico"] },
] as const;
export type TriageAreaKey = (typeof TRIAGE_AREAS)[number]["key"];

export const triageSchema = z.object({
  areas: z.array(z.object({
    key: z.enum(["previdenciario", "trabalhista", "civel"]),
    queueId: z.string().uuid().nullable(),
    userId: z.string().uuid().nullable(),
    keywords: z.string().max(1000),
  })).min(1).max(3),
});
export type TriageInput = z.infer<typeof triageSchema>;
export const triageRuleName = (label: string) => `Triagem: ${label}`;
