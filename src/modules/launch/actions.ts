"use server";

import { interestSchema } from "@/lib/launch";
import { limiters } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { getRequestMeta } from "@/server/session";
import { registerInterest } from "@/server/services/launch-interest.service";

export type InterestState = { status: "idle" | "ok" | "error"; message?: string; fields?: Record<string, string> };

/** Formulário público da landing de lançamento. Sem login; protegido por limite por IP e campo invisível para robôs. */
export async function registerInterestAction(_prev: InterestState, form: FormData): Promise<InterestState> {
  const parsed = interestSchema.safeParse({
    name: form.get("name") ?? "",
    office: form.get("office") ?? "",
    email: form.get("email") ?? "",
    whatsapp: form.get("whatsapp") ?? "",
    consent: form.get("consent") === "on",
    website: form.get("website") ?? "",
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fields[key] ??= issue.message;
    }
    return { status: "error", message: "Confira os campos destacados.", fields };
  }
  // Robôs preenchem o campo invisível: respondemos como sucesso e não gravamos nada.
  if (parsed.data.website) return { status: "ok" };
  const meta = await getRequestMeta();
  if (!limiters.launchInterest.check(meta.ipAddress ?? "sem-ip")) {
    return { status: "error", message: "Muitos cadastros a partir desta rede. Tente de novo em alguns minutos ou fale conosco pelo WhatsApp." };
  }
  try {
    await registerInterest(parsed.data, meta);
    return { status: "ok" };
  } catch (err) {
    logger.error("launch interest failed", { error: err instanceof Error ? err.message : String(err) });
    return { status: "error", message: "Não foi possível registrar agora. Tente de novo em instantes." };
  }
}
