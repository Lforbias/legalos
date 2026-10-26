import { z } from "zod";
export const categories = [
  "Previdenciário",
  "Trabalhista",
  "Consumidor",
  "Civil",
  "Tributário",
  "Rotina do escritório",
] as const;
export const originSchema = z.enum(["blog", "ferramenta", "comunidade"]);
export const TERMS_VERSION = "2026-10-26-v1";
export const TERMS_TEXT =
  "Li e aceito os Termos de uso e a Política de privacidade do LegalOS.";
export const MARKETING_TEXT =
  "Quero receber novidades e ofertas do LegalOS por e-mail. Posso sair a qualquer momento.";
export function sensitiveData(text: string): string | null {
  if (
    /\b\d{7}[-.\s]?\d{2}[.\s]?\d{4}[.\s]?\d[.\s]?\d{2}[.\s]?\d{4}\b/.test(text)
  )
    return "número de processo";
  if (/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/.test(text)) return "CPF";
  if (
    /\b[A-Z\d]{2}[.\s]?[A-Z\d]{3}[.\s]?[A-Z\d]{3}[/\s]?[A-Z\d]{4}[-\s]?\d{2}\b/i.test(
      text,
    )
  )
    return "CNPJ";
  return null;
}
export function safePublicText(text: string) {
  const found = sensitiveData(text);
  if (found)
    throw new Error(
      `Encontramos ${found} no texto. Remova antes de publicar para proteger o sigilo do cliente.`,
    );
  if ((text.match(/https?:\/\//gi) ?? []).length > 1)
    throw new Error("Use no máximo um link por publicação.");
}
export function officialUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname.endsWith(".jus.br") || u.hostname.endsWith(".gov.br"))
    );
  } catch {
    return false;
  }
}
export const publicUrl = (path = "") =>
  `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
export const escapeXml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export const dateSchema = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Data inválida",
  );
export const toolSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("prazos"),
    startDate: dateSchema,
    days: z.coerce.number().int().min(1).max(365),
    countType: z.enum(["BUSINESS", "CALENDAR"]),
  }),
  z.object({
    tool: z.literal("rescisao"),
    admissao: dateSchema,
    demissao: dateSchema,
    salario: z.string().regex(/^\d{1,8}([.,]\d{1,2})?$/),
    tipo: z.enum([
      "SEM_JUSTA_CAUSA",
      "JUSTA_CAUSA",
      "PEDIDO_DEMISSAO",
      "ACORDO",
    ]),
    feriasVencidas: z.coerce.number().int().min(0).max(30),
  }),
]);
export const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  origin: originSchema,
  terms: z.literal(true),
  marketing: z.boolean(),
});
export const questionSchema = z.object({
  title: z.string().trim().min(12).max(200),
  body: z.string().trim().min(20).max(6000),
  category: z.enum(categories),
  tribunal: z.string().trim().max(60).default(""),
});
export const replySchema = z
  .object({
    id: z.uuid(),
    body: z.string().trim().min(10).max(6000),
    source_url: z.union([z.literal(""), z.url().max(1000)]).default(""),
  })
  .refine((i) => !i.source_url || /^https?:\/\//.test(i.source_url));
export const postSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(140),
  title: z.string().trim().min(10).max(220),
  category: z.enum(categories),
  summary: z.string().trim().min(20).max(700),
  practical: z.string().trim().min(20).max(15000),
  applies: z.string().trim().min(10).max(6000),
  source_url: z
    .string()
    .refine(
      officialUrl,
      "Informe uma fonte oficial HTTPS (.gov.br ou .jus.br).",
    ),
  source_name: z.string().trim().min(2).max(200),
  source_date: dateSchema,
  accessed_at: dateSchema,
  tool: z.enum(["prazos", "rescisao"]),
});
