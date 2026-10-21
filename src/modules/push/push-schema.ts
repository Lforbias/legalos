import { z } from "zod";

/** Só aceitamos endereços de serviços de push conhecidos (o servidor faz a chamada; evita pedir ao servidor que acesse endereços internos). */
const PUSH_HOST_SUFFIXES = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
export function isAllowedPushEndpoint(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    return PUSH_HOST_SUFFIXES.some((s) => u.hostname === s || u.hostname.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

export const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine(isAllowedPushEndpoint, "Serviço de aviso não reconhecido."),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export const prefsSchema = z.object({
  deadlines: z.boolean(),
  tasks: z.boolean(),
  announcements: z.boolean().default(true),
  leadDays: z.number().int().min(0, "Escolha de 0 a 3 dias.").max(3, "Escolha de 0 a 3 dias."),
});
export type PrefsInput = z.infer<typeof prefsSchema>;

export const orgPushSchema = z.object({ enabled: z.boolean() });
