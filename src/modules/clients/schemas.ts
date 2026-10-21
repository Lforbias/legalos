import { z } from "zod";
import { isUf } from "@/lib/validation/br-states";
import { normalizeDocument, onlyDigits } from "@/lib/validation/br-documents";

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const CLIENT_TYPES = ["PERSON", "COMPANY"] as const;
export const CLIENT_STATUSES = ["PROSPECT", "ACTIVE", "INACTIVE"] as const;

/** Schema único usado no formulário (cliente) e revalidado na Server Action (servidor). Campos vazios = "". */
export const clientSchema = z
  .object({
    type: z.enum(CLIENT_TYPES),
    status: z.enum(CLIENT_STATUSES),
    name: z.string().trim().min(2, "Informe o nome.").max(160),
    tradeName: text(160),
    document: text(24),
    email: text(254).refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido."),
    phone: text(30).refine((v) => v === "" || [10, 11, 12, 13].includes(onlyDigits(v).length), "Telefone inválido (use DDD + número)."),
    birthDate: text(10).refine((v) => v === "" || isDate(v), "Data inválida."),
    tags: text(300),
    notes: text(4000),
    addressZip: text(9).refine((v) => v === "" || onlyDigits(v).length === 8, "CEP inválido."),
    addressStreet: text(160),
    addressNumber: text(20),
    addressComplement: text(80),
    addressDistrict: text(80),
    addressCity: text(80),
    addressState: text(2).refine((v) => v === "" || isUf(v.toUpperCase()), "UF inválida."),
  })
  .superRefine((v, ctx) => {
    if (v.document !== "" && normalizeDocument(v.type, v.document) === null) {
      ctx.addIssue({ code: "custom", path: ["document"], message: v.type === "PERSON" ? "CPF inválido." : "CNPJ inválido." });
    }
    if (v.type === "COMPANY" && v.birthDate !== "") {
      ctx.addIssue({ code: "custom", path: ["birthDate"], message: "Data de nascimento se aplica apenas a pessoa física." });
    }
    if (v.birthDate !== "" && isDate(v.birthDate) && Date.parse(`${v.birthDate}T00:00:00Z`) > Date.now()) {
      ctx.addIssue({ code: "custom", path: ["birthDate"], message: "A data não pode ser futura." });
    }
  });
export type ClientInput = z.infer<typeof clientSchema>;

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  role: text(80),
  email: text(254).refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido."),
  phone: text(30).refine((v) => v === "" || [10, 11, 12, 13].includes(onlyDigits(v).length), "Telefone inválido (use DDD + número)."),
  isPrimary: z.boolean(),
  notes: text(500),
});
export type ContactInput = z.infer<typeof contactSchema>;

/** Converte a entrada textual de etiquetas ("a, b ; c") em lista única, ordenada por entrada, máx. 10 itens de 30 caracteres. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,;\n]/)) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 30);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out.slice(0, 10);
}

const emptyToNull = (v: string) => (v.trim() === "" ? null : v.trim());

/** Normaliza a entrada validada para o formato persistido (documento sem máscara, e-mail minúsculo, vazios → null). */
export function toClientData(input: ClientInput) {
  return {
    type: input.type,
    status: input.status,
    name: input.name.trim(),
    tradeName: emptyToNull(input.tradeName),
    document: input.document ? normalizeDocument(input.type, input.document) : null,
    email: input.email ? input.email.toLowerCase() : null,
    phone: input.phone ? onlyDigits(input.phone) : null,
    birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null,
    tags: parseTags(input.tags),
    notes: emptyToNull(input.notes),
    addressZip: input.addressZip ? onlyDigits(input.addressZip) : null,
    addressStreet: emptyToNull(input.addressStreet),
    addressNumber: emptyToNull(input.addressNumber),
    addressComplement: emptyToNull(input.addressComplement),
    addressDistrict: emptyToNull(input.addressDistrict),
    addressCity: emptyToNull(input.addressCity),
    addressState: input.addressState ? input.addressState.toUpperCase() : null,
  };
}

export const CLIENT_STATUS_LABEL: Record<(typeof CLIENT_STATUSES)[number], string> = {
  PROSPECT: "Prospecto",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
};
export const CLIENT_TYPE_LABEL: Record<(typeof CLIENT_TYPES)[number], string> = { PERSON: "Pessoa física", COMPANY: "Pessoa jurídica" };
