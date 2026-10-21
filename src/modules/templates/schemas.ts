import { z } from "zod";

const uuidOrEmpty = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador inválido.");

export const templateSchema = z.object({
  name: z.string().trim().min(3, "Informe um nome (mín. 3 caracteres).").max(120, "Máximo de 120 caracteres."),
  description: z.string().trim().max(500, "Máximo de 500 caracteres."),
  category: z.string().trim().max(60, "Máximo de 60 caracteres."),
  body: z.string().min(1, "Escreva o texto do modelo.").max(100000, "Máximo de 100.000 caracteres."),
  active: z.boolean(),
});
export type TemplateFormInput = z.infer<typeof templateSchema>;
export const EMPTY_TEMPLATE: TemplateFormInput = { name: "", description: "", category: "", body: "", active: true };

export const generateSchema = z
  .object({
    templateId: z.uuid("Escolha um modelo."),
    target: z.enum(["case", "client"]),
    caseId: uuidOrEmpty,
    clientId: uuidOrEmpty,
    title: z.string().trim().max(120, "Máximo de 120 caracteres."),
  })
  .superRefine((v, ctx) => {
    if (v.target === "case" && !v.caseId) ctx.addIssue({ code: "custom", path: ["caseId"], message: "Escolha o processo." });
    if (v.target === "client" && !v.clientId) ctx.addIssue({ code: "custom", path: ["clientId"], message: "Escolha o cliente." });
  });
export type GenerateInput = z.infer<typeof generateSchema>;

export const TEMPLATE_EXAMPLE = `# PROCURAÇÃO AD JUDICIA

Pelo presente instrumento, {{cliente.nome}}, inscrito(a) sob o CPF/CNPJ {{cliente.documento}}, residente em {{cliente.endereco}}, nomeia e constitui como seu(sua) procurador(a) o(a) advogado(a) {{advogado.nome}}, do escritório {{escritorio.nome}}, para o foro em geral, em especial para atuar no processo {{processo.numero}}.

{{data.hoje_extenso}}.`;
