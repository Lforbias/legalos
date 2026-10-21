import crypto from "node:crypto";

/**
 * Política de cadastro de NOVAS contas/escritórios (variável REGISTRATION_MODE):
 *  - "open"   (padrão, desenvolvimento): qualquer visitante cria conta;
 *  - "code"   : só com o código de acesso (REGISTRATION_CODE, mín. 12 caracteres) que a administração repassa;
 *  - "closed" : ninguém cria conta sozinho; só quem tem CONVITE válido para o seu e-mail.
 * Convite válido sempre vale, em qualquer modo (é assim que a equipe entra).
 */
export type RegistrationMode = "open" | "code" | "closed";

export function registrationMode(env: Record<string, string | undefined> = process.env): RegistrationMode {
  const v = env.REGISTRATION_MODE?.trim().toLowerCase();
  if (v === "closed" || v === "code") {
    if (v === "code" && (env.REGISTRATION_CODE?.trim().length ?? 0) < 12) return "closed"; // sem código forte configurado, fecha (falha segura)
    return v;
  }
  return "open";
}

export type RegistrationDecision = { allowed: true } | { allowed: false; reason: string };

export function decideRegistration(input: { mode: RegistrationMode; hasValidInvite: boolean; accessCode?: string | null; expectedCode?: string | null }): RegistrationDecision {
  if (input.hasValidInvite || input.mode === "open") return { allowed: true };
  if (input.mode === "code") {
    const given = Buffer.from(input.accessCode?.trim() ?? "");
    const want = Buffer.from(input.expectedCode?.trim() ?? "");
    if (given.length > 0 && given.length === want.length && crypto.timingSafeEqual(given, want)) return { allowed: true };
    return { allowed: false, reason: "Código de acesso inválido. Peça o código à administração do LegalOS." };
  }
  return { allowed: false, reason: "O cadastro de novos escritórios está fechado. Peça um convite à administração." };
}
