import type { Prisma } from "@prisma/client";
import { hadRecentBilling } from "./chat-billing.service";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ValidationError } from "@/lib/permissions/check";
import { botOptionSchema, botSchema, BOT_HANDOFF_KEY, menuText, type BotOption } from "@/modules/whatsapp/bot-schema";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { runActionsOnConversation, validateRefs } from "./chat-automation.service";
import { cleanValue } from "./chat-meta.service";
import { autoAssign } from "./chat-queue.service";
import { getTransport } from "./whatsapp-transport";

/**
 * LegalOS Chat — menu de triagem (chatbot) e pré-atendimento.
 * Conversa nova (ou reaberta) recebe o menu; o cliente responde com o número. A opção pode etiquetar, mandar para fila,
 * atribuir, criar tarefa, avisar alguém, responder e FAZER PERGUNTAS (as respostas vão para campos personalizados e
 * para uma nota interna). "0" (ou "atendente") chama uma pessoa. Quando uma pessoa responde, o robô se cala sozinho.
 * Não usa IA: é um menu fixo, escrito pelo escritório.
 */

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DAILY_CAP = 40;
const MAX_INVALID = 3;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ---------------- gestão ----------------

export async function getBot(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  const b = await db.whatsappBot.findUnique({ where: { organizationId: ctx.organizationId } });
  if (!b) return null;
  return { enabled: b.enabled, greeting: b.greeting, invalidText: b.invalidText, handoffText: b.handoffText, options: botOptionSchema.array().catch([]).parse(b.options) };
}

export async function saveBot(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "whatsapp:manage");
  const parsed = botSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fieldErrors[String(i.path[0] ?? "form")] ??= []).push(i.message);
    throw new ValidationError("Corrija os campos destacados.", fieldErrors);
  }
  const v = parsed.data;
  const labels = new Set(v.options.map((o) => o.label.toLowerCase()));
  if (labels.size !== v.options.length) throw new ValidationError("Há opções com o mesmo texto.", { options: ["Cada opção precisa de um texto diferente."] });
  for (const o of v.options) {
    await validateRefs(ctx, "NEW_CONVERSATION", o.actions);
    for (const q of o.questions) {
      if (q.fieldId && !(await db.whatsappField.findFirst({ where: { id: q.fieldId, organizationId: ctx.organizationId, active: true }, select: { id: true } }))) throw new ValidationError("Campo não encontrado.", { options: ["Escolha um campo ativo do escritório."] });
    }
  }
  const data = { enabled: v.enabled, greeting: v.greeting, invalidText: v.invalidText, handoffText: v.handoffText, options: v.options as unknown as Prisma.InputJsonValue, updatedById: ctx.userId };
  await db.whatsappBot.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  await audit({ action: "whatsapp.bot_save", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_bot", resourceId: ctx.organizationId, metadata: { enabled: v.enabled, options: v.options.length }, meta: ctx.meta });
}

// ---------------- execução ----------------

type Ses = { state: string; optionKey: string | null; questionIndex: number; invalidCount: number; answers: unknown; step: number; startedAt: Date; updatedAt: Date };
type Answer = { q: string; a: string };

async function say(organizationId: string, conversationId: string, waId: string, text: string): Promise<boolean> {
  const sent = await db.whatsappMessage.count({ where: { conversationId, organizationId, direction: "OUT", automatic: true, createdAt: { gt: new Date(Date.now() - SESSION_TTL_MS) } } });
  if (sent >= DAILY_CAP) return false; // proteção contra repetição
  const acc = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId }, select: { accountId: true } });
  const t = await getTransport(organizationId, acc?.accountId);
  const id = await t.sendText(waId, text);
  await db.whatsappMessage.create({ data: { organizationId, conversationId, direction: "OUT", type: "text", body: text, status: "SENT", waMessageId: id, automatic: true } });
  return true;
}
const note = (organizationId: string, conversationId: string, body: string) => db.whatsappMessage.create({ data: { organizationId, conversationId, direction: "NOTE", type: "text", body: body.slice(0, 4000), status: "NOTE" } }).catch(() => undefined);

export async function runBot(organizationId: string, conversationId: string, m: { created: boolean; reopened: boolean; text: string | null; now: Date }): Promise<void> {
  try {
    const bot = await db.whatsappBot.findUnique({ where: { organizationId } });
    if (!bot?.enabled) return;
    const options = botOptionSchema.array().catch([]).parse(bot.options);
    if (options.length === 0) return;
    const conv = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId }, select: { id: true, waId: true } });
    if (!conv) return;
    let ses: Ses | null = await db.whatsappBotSession.findUnique({ where: { conversationId } });
    const humanSince = async (since: Date) => (await db.whatsappMessage.count({ where: { conversationId, organizationId, direction: "OUT", automatic: false, createdAt: { gt: since } } })) > 0;
    if (ses && ses.state !== "DONE" && !m.reopened && (m.now.getTime() - ses.updatedAt.getTime() > SESSION_TTL_MS || (await humanSince(ses.startedAt)))) {
      await db.whatsappBotSession.update({ where: { conversationId }, data: { state: "DONE" } });
      ses = { ...ses, state: "DONE" };
    }
    if (!ses || ses.state === "DONE" || m.reopened) {
      if (!(m.created || m.reopened)) return; // só começa em conversa nova ou reaberta
      if (await hadRecentBilling(conversationId)) return; // resposta a uma cobrança: vai direto para uma pessoa
      const data = { organizationId, state: "MENU", optionKey: null, questionIndex: 0, invalidCount: 0, answers: [] as Prisma.InputJsonValue, startedAt: m.now };
      await db.whatsappBotSession.upsert({ where: { conversationId }, create: { conversationId, ...data }, update: { ...data, step: { increment: 1 } } });
      await say(organizationId, conversationId, conv.waId, menuText(bot.greeting, options));
      return;
    }
    // Reserva a vez: duas mensagens simultâneas não geram duas respostas.
    const claim = await db.whatsappBotSession.updateMany({ where: { conversationId, step: ses.step }, data: { step: { increment: 1 } } });
    if (claim.count !== 1) return;
    const text = (m.text ?? "").trim();
    const ctx = { organizationId, conversationId, waId: conv.waId, bot, options, ses, text };
    if (ses.state === "MENU") await onMenu(ctx);
    else await onQuestion(ctx);
  } catch (e) {
    logger.error("whatsapp.bot_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

type Ctx = { organizationId: string; conversationId: string; waId: string; bot: { greeting: string; invalidText: string; handoffText: string }; options: BotOption[]; ses: Ses; text: string };

async function finish(c: Ctx, summary: string, answers: Answer[]) {
  const { organizationId, conversationId } = c;
  await db.whatsappBotSession.update({ where: { conversationId }, data: { state: "DONE", answers: answers as unknown as Prisma.InputJsonValue } });
  await note(organizationId, conversationId, `Triagem concluída: ${summary}.${answers.length ? `\nPré-atendimento:\n${answers.map((a) => `• ${a.q} ${a.a}`).join("\n")}` : ""}`);
  await autoAssign(organizationId, conversationId).catch(() => null);
  await say(organizationId, conversationId, c.waId, c.bot.handoffText).catch((e) => logger.warn("whatsapp.bot_say_failed", { error: e instanceof Error ? e.message : String(e) }));
}

async function onMenu(c: Ctx) {
  const n = norm(c.text);
  if (n === BOT_HANDOFF_KEY || /^0[\s.)-]/.test(n) || n === "atendente" || n === "falar com atendente" || n === "falar com um atendente") {
    return finish(c, "o cliente pediu um atendente", []);
  }
  let idx = -1;
  const num = /^(\d{1,2})(?:[\s.)-]|$)/.exec(n);
  if (num) idx = Number(num[1]) - 1;
  else idx = c.options.findIndex((o) => norm(o.label) === n);
  const opt = idx >= 0 ? c.options[idx] : undefined;
  if (!opt) {
    const invalid = c.ses.invalidCount + 1;
    if (invalid >= MAX_INVALID) return finish(c, "o cliente não escolheu uma opção (passou para um atendente)", []);
    await db.whatsappBotSession.update({ where: { conversationId: c.conversationId }, data: { invalidCount: invalid } });
    await say(c.organizationId, c.conversationId, c.waId, `${c.bot.invalidText}\n\n${menuText("Opções:", c.options)}`);
    return;
  }
  const { done, failed } = await runActionsOnConversation(c.organizationId, c.conversationId, `Menu: ${opt.label}`, c.organizationId, { trigger: "NEW_CONVERSATION", eventKey: `bot:${idx}:${Date.now()}`, text: c.text }, opt.actions);
  if (done.length || failed.length) await note(c.organizationId, c.conversationId, `Menu “${opt.label}”: ${[...done, ...failed].join("; ")}.`);
  if (opt.reply) await say(c.organizationId, c.conversationId, c.waId, opt.reply);
  if (opt.questions.length === 0) return finish(c, `opção “${opt.label}”`, []);
  await db.whatsappBotSession.update({ where: { conversationId: c.conversationId }, data: { state: "QUESTION", optionKey: String(idx), questionIndex: 0, invalidCount: 0, answers: [] } });
  await say(c.organizationId, c.conversationId, c.waId, opt.questions[0]!.text);
}

async function onQuestion(c: Ctx) {
  const idx = Number(c.ses.optionKey ?? "-1");
  const opt = c.options[idx];
  const q = opt?.questions[c.ses.questionIndex];
  if (!opt || !q) return finish(c, "pré-atendimento encerrado", []);
  const answers = (Array.isArray(c.ses.answers) ? c.ses.answers : []) as Answer[];
  if (!c.text) {
    await say(c.organizationId, c.conversationId, c.waId, "Por favor, responda com texto.");
    return;
  }
  if (c.text.length > 600) {
    await say(c.organizationId, c.conversationId, c.waId, "Resposta muito longa. Pode resumir em poucas linhas?");
    return;
  }
  let value = c.text;
  if (q.fieldId) {
    const f = await db.whatsappField.findFirst({ where: { id: q.fieldId, organizationId: c.organizationId, active: true }, select: { id: true, name: true, kind: true, options: true } });
    if (f) {
      try {
        value = cleanValue(f, c.text);
        await db.whatsappFieldValue.upsert({ where: { conversationId_fieldId: { conversationId: c.conversationId, fieldId: f.id } }, create: { conversationId: c.conversationId, fieldId: f.id, organizationId: c.organizationId, value }, update: { value } });
      } catch (e) {
        const invalid = c.ses.invalidCount + 1;
        if (invalid < MAX_INVALID) {
          await db.whatsappBotSession.update({ where: { conversationId: c.conversationId }, data: { invalidCount: invalid } });
          await say(c.organizationId, c.conversationId, c.waId, `${e instanceof ValidationError ? e.message.replace(/^[^:]+:\s*/, "") : "Resposta inválida."}\n${q.text}`);
          return;
        }
        // 3 tentativas: guarda só na nota (texto livre) e segue
      }
    }
  }
  const next = [...answers, { q: q.text, a: value }];
  const ni = c.ses.questionIndex + 1;
  if (ni < opt.questions.length) {
    await db.whatsappBotSession.update({ where: { conversationId: c.conversationId }, data: { questionIndex: ni, invalidCount: 0, answers: next as unknown as Prisma.InputJsonValue } });
    await say(c.organizationId, c.conversationId, c.waId, opt.questions[ni]!.text);
    return;
  }
  await finish(c, `opção “${opt.label}”`, next);
}
