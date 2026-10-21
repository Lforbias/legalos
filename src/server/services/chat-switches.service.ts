import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/**
 * Interruptores do LegalOS Chat: um lugar só para ligar e desligar tudo o que o sistema faz sozinho.
 * Nada que envia mensagem a cliente liga por conta própria: a cobrança nasce desligada e só liga por decisão explícita (com auditoria).
 */

export const SWITCH_KEYS = ["billing", "bot", "away", "autoAssign", "automations"] as const;
export type SwitchKey = (typeof SWITCH_KEYS)[number];

export type SwitchesView = {
  billing: { enabled: boolean };
  bot: { configured: boolean; enabled: boolean };
  away: { configured: boolean; enabled: boolean };
  autoAssign: { enabled: boolean };
  automations: { total: number; active: number };
};

export async function getSwitches(ctx: TenantContext): Promise<SwitchesView> {
  assertCan(ctx, "whatsapp:manage");
  const org = ctx.organizationId;
  const [billing, bot, acc, total, active] = await Promise.all([
    db.whatsappBillingSettings.findUnique({ where: { organizationId: org }, select: { enabled: true } }),
    db.whatsappBot.findUnique({ where: { organizationId: org }, select: { enabled: true, options: true } }),
    db.whatsappAccount.findUnique({ where: { organizationId: org }, select: { awayEnabled: true, awayMessage: true, autoAssignEnabled: true } }),
    db.whatsappAutomation.count({ where: { organizationId: org } }),
    db.whatsappAutomation.count({ where: { organizationId: org, active: true } }),
  ]);
  return {
    billing: { enabled: billing?.enabled ?? false },
    bot: { configured: !!bot && Array.isArray(bot.options) && bot.options.length > 0, enabled: bot?.enabled ?? false },
    away: { configured: !!acc?.awayMessage, enabled: acc?.awayEnabled ?? false },
    autoAssign: { enabled: acc?.autoAssignEnabled ?? true },
    automations: { total, active },
  };
}

export async function setSwitch(ctx: TenantContext, key: SwitchKey, on: boolean) {
  assertCan(ctx, "whatsapp:manage");
  const org = ctx.organizationId;
  if (key === "billing") {
    if (on) await db.whatsappBillingSettings.upsert({ where: { organizationId: org }, create: { organizationId: org, enabled: true, updatedById: ctx.userId, ...BILLING_DEFAULTS }, update: { enabled: true, updatedById: ctx.userId } });
    else await db.whatsappBillingSettings.updateMany({ where: { organizationId: org }, data: { enabled: false, updatedById: ctx.userId } });
  } else if (key === "bot") {
    const bot = await db.whatsappBot.findUnique({ where: { organizationId: org }, select: { options: true } });
    if (!bot) { if (on) throw new ConflictError("Monte o menu de triagem antes de ligar."); }
    else {
      if (on && !(Array.isArray(bot.options) && bot.options.length > 0)) throw new ConflictError("O menu de triagem não tem opções.");
      await db.whatsappBot.update({ where: { organizationId: org }, data: { enabled: on } });
    }
  } else if (key === "away") {
    const acc = await db.whatsappAccount.findUnique({ where: { organizationId: org }, select: { awayMessage: true } });
    if (!acc) throw new NotFoundError("O WhatsApp não está conectado.");
    if (on && !acc.awayMessage) throw new ConflictError("Escreva a mensagem de ausência antes de ligar.");
    await db.whatsappAccount.update({ where: { organizationId: org }, data: { awayEnabled: on } });
  } else if (key === "autoAssign") {
    const r = await db.whatsappAccount.updateMany({ where: { organizationId: org }, data: { autoAssignEnabled: on } });
    if (r.count !== 1) throw new NotFoundError("O WhatsApp não está conectado.");
  } else {
    await db.whatsappAutomation.updateMany({ where: { organizationId: org }, data: { active: on } });
  }
  await audit({ action: on ? "whatsapp.switch_on" : "whatsapp.switch_off", organizationId: org, userId: ctx.userId, resourceType: "whatsapp_switch", resourceId: key, metadata: { key, on }, meta: ctx.meta });
}

/** Botão de emergência: desliga de uma vez tudo o que envia mensagem sozinho (cobrança, menu de triagem, ausência e automações). */
export async function stopAllMessaging(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  for (const k of ["billing", "bot", "away", "automations"] as const) {
    try { await setSwitch(ctx, k, false); } catch (e) { if (!(e instanceof NotFoundError)) throw e; }
  }
}

const BILLING_DEFAULTS = {
  offsets: [-3, 0, 3], sendHour: 9, skipWeekends: true, maxOverdueDays: 60,
  beforeText: "Olá, {{nome}}! Lembramos que a parcela {{parcela}} dos honorários, no valor de {{valor}}, vence em {{vencimento}}. Qualquer dúvida, é só responder esta mensagem.",
  dueText: "Olá, {{nome}}! Hoje vence a parcela {{parcela}} dos honorários, no valor de {{valor}}. Qualquer dúvida, é só responder esta mensagem.",
  overdueText: "Olá, {{nome}}! Não identificamos o pagamento da parcela {{parcela}} dos honorários, no valor de {{valor}}, que venceu em {{vencimento}}. Se já pagou, desconsidere e nos envie o comprovante. Qualquer dúvida, é só responder esta mensagem.",
};
