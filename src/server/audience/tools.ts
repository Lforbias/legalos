import { toolSchema } from "@/lib/audience/policy";
import { calculateDeadline } from "@/lib/deadlines/calculator";
import { calcRescisao } from "@/lib/calc/trabalhista";
import type { CalcResult } from "@/lib/calc/num";
export function calculatePublic(input: unknown): {
  input: ReturnType<typeof toolSchema.parse>;
  result: CalcResult;
} {
  const i = toolSchema.parse(input);
  if (i.tool === "rescisao") return { input: i, result: calcRescisao(i) };
  const r = calculateDeadline(i);
  return {
    input: i,
    result: {
      kind: "PRAZO",
      title: "Contagem auxiliar de prazo",
      total: "0.00",
      summary: [
        ["Data inicial", i.startDate],
        ["Quantidade", String(i.days)],
        [
          "Contagem",
          i.countType === "BUSINESS" ? "Dias úteis" : "Dias corridos",
        ],
        ["VENCIMENTO SUGERIDO", r.dueDate],
      ],
      sections: [
        {
          title: "Dias não contados",
          columns: ["Data", "Motivo"],
          rows: r.skipped.map((x) => [x.date, x.reason]),
        },
      ],
      warnings: [
        "Não considera feriados locais, suspensões do tribunal, prazo em dobro, indisponibilidade ou regras específicas do procedimento. Confira o termo inicial e a contagem com um advogado.",
      ],
      criteria: r.note.split("\n"),
    },
  };
}
