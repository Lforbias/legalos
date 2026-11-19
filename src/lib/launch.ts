import { z } from "zod";

/** Data do lançamento público do LegalOS (meia-noite de Brasília). */
export const LAUNCH_AT = new Date("2027-01-05T00:00:00-03:00");
export const LAUNCH_LABEL = "05.01.2027";

/** Marca usada no LegalOS Comercial para quem se cadastrou pela landing de lançamento. */
export const INTEREST_TAG = "lista-de-interesse";

export const INTEREST_CONSENT_VERSION = "2026-11-19-v1";
export const INTEREST_CONSENT_TEXT =
  "Autorizo o LegalOS a usar estes dados para falar comigo sobre o lançamento. Posso pedir a exclusão a qualquer momento.";

export function launchCountdown(now: Date = new Date(), at: Date = LAUNCH_AT) {
  const total = Math.max(0, Math.floor((at.getTime() - now.getTime()) / 1000));
  return {
    done: total === 0,
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const interestSchema = z.object({
  name: z.string().trim().min(2, "Informe o seu nome.").max(120, "Nome muito longo."),
  office: optional(160),
  email: z.string().trim().toLowerCase().max(200).pipe(z.email("Informe um e-mail válido.")),
  whatsapp: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : ""))
    .refine((d) => d === "" || (d.length >= 10 && d.length <= 13), "WhatsApp com DDD, só números.")
    .transform((d) => (d ? d : null)),
  consent: z.literal(true, { error: "É preciso autorizar o contato para registrar o interesse." }),
  /** Campo invisível para robôs; pessoas deixam vazio. */
  website: z.string().max(200).optional(),
});

export type InterestInput = z.infer<typeof interestSchema>;
