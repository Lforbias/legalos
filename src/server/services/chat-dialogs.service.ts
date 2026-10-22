import { z } from "zod";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { addDays, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { isOutsideHours } from "@/lib/whatsapp/hours";
import { normalizeWaId } from "@/lib/whatsapp/phone";
import { chatActionSchema } from "@/modules/whatsapp/automation-schema";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { runActionsOnConversation } from "./chat-automation.service";
import { notify } from "./notification.service";
import { systemSendTemplate, systemSendText, windowAllowsText } from "./whatsapp.service";

/**
 * 4.0-F5/F9 — robô 2.0: diálogos prontos e intenções com pontuação.
 * REGRAS: tudo nasce DESLIGADO; cada diálogo tem a sua chave; nada é enviado a quem pediu para sair (opt-out);
 * fora da janela de 24 h só vai modelo aprovado, e sem modelo o envio é registrado como "ignorado" (nunca forçado).
 * Cada disparo é único por chave (dialog + chave) — rodar a rotina duas vezes não repete mensagem.
 * Intenções: pontuação por palavras (sem IA), sempre as mesmas ações da automação (nada novo para aprender).
 */

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const DIALOG_KINDS = ["TIMER", "BIRTHDAY", "HEARING", "HOURS"] as const;
export type DialogKind = (typeof DIALOG_KINDS)[number];
export const DIALOG_LABEL: Record<DialogKind, string> = {
  TIMER: "Reenviar se o cliente não responder",
  BIRTHDAY: "Parabéns no aniversário",
  HEARING: "Aviso de audiência ou perícia",
  HOURS: "Responder sobre o horário de atendimento",
};
export const DIALOG_HELP: Record<DialogKind, string> = {
  TIMER: "Depois de X minutos sem resposta do cliente, envia um lembrete (uma vez por mensagem sua). Só em conversa aberta.",
  BIRTHDAY: "No dia do aniversário cadastrado, na hora escolhida. Variáveis: {nome}.",
  HEARING: "X dias antes de uma audiência/perícia da Agenda ligada ao cliente. Variáveis: {nome} {titulo} {data} {hora} {local}.",
  HOURS: "Quando o cliente pergunta pelo horário, responde se estamos abertos ou fechados. Variáveis: {nome}.",
};

const cfgSchema = {
  TIMER: z.object({ minutes: z.number().int().min(5).max(10080) }),
  BIRTHDAY: z.object({ sendHour: z.number().int().min(0).max(23) }),
  HEARING: z.object({ daysBefore: z.number().int().min(0).max(30), sendHour: z.number().int().min(0).max(23) }),
  HOURS: z.object({ keywords: z.string().trim().min(2).max(300), closedText: z.string().trim().min(3).max(1000) }),
} as const;

export const dialogSchema = z.object({
  kind: z.enum(DIALOG_KINDS),
  name: z.string().trim().min(3, "Nome: mínimo 3 caracteres.").max(80),
  text: z.string().trim().min(3, "Escreva a mensagem.").max(1000, "Mensagem: no máximo 1000 caracteres."),
  templateId: z.string().uuid().nullable().optional(),
  config: z.record(z.string(), z.unknown()),
  active: z.boolean().optional(),
});

export async function listDialogs(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:read");
  return db.whatsappDialog.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ kind: "asc" }, { createdAt: "asc" }], take: 100 });
}

export async function saveDialog(ctx: TenantContext, id: string | null, raw: unknown) {
  assertCan(ctx, "whatsapp:manage");
  const p = dialogSchema.safeParse(raw);
  if (!p.success) throw new ValidationError("Confira os campos.", p.error.flatten().fieldErrors as Record<string, string[]>);
  const d = p.data;
  const cfg = cfgSchema[d.kind].safeParse(d.config);
  if (!cfg.success) throw new ValidationError("Confira os números do diálogo.", { config: cfg.error.issues.map((i) => i.message) });
  if (d.templateId && !(await db.whatsappTemplate.findFirst({ where: { id: d.templateId, organizationId: ctx.organizationId }, select: { id: true } }))) throw new ValidationError("Modelo não encontrado.", { templateId: ["Modelo não encontrado."] });
  const data = { kind: d.kind, name: d.name, text: d.text, templateId: d.templateId ?? null, config: cfg.data as object };
  let row;
  if (id) {
    const cur = await db.whatsappDialog.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!cur) throw new NotFoundError("Diálogo não encontrado.");
    row = await db.whatsappDialog.update({ where: { id }, data });
  } else {
    if ((await db.whatsappDialog.count({ where: { organizationId: ctx.organizationId } })) >= 30) throw new ConflictError("Limite de 30 diálogos.");
    row = await db.whatsappDialog.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId, active: false } });
  }
  await audit({ action: "whatsapp.dialog_save", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_dialog", resourceId: row.id, meta: ctx.meta });
  return row;
}

export async function setDialogActive(ctx: TenantContext, id: string, active: boolean) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappDialog.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { active } });
  if (r.count !== 1) throw new NotFoundError("Diálogo não encontrado.");
  await audit({ action: active ? "whatsapp.dialog_on" : "whatsapp.dialog_off", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_dialog", resourceId: id, meta: ctx.meta });
}

export async function deleteDialog(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappDialog.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Diálogo não encontrado.");
  await db.whatsappDialogRun.deleteMany({ where: { dialogId: id } });
  await audit({ action: "whatsapp.dialog_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_dialog", resourceId: id, meta: ctx.meta });
}

export async function listDialogRuns(ctx: TenantContext, limit = 40) {
  assertCan(ctx, "whatsapp:read");
  return db.whatsappDialogRun.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: limit });
}

// ======================= envio =======================

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

type Dialog = { id: string; organizationId: string; text: string; templateId: string | null };

/** Reserva (diálogo, chave). false = já tratado antes. */
async function claim(d: Dialog, key: string, conversationId: string | null): Promise<boolean> {
  const r = await db.whatsappDialogRun.createMany({ data: [{ dialogId: d.id, organizationId: d.organizationId, conversationId, key, status: "SENDING" }], skipDuplicates: true });
  return r.count === 1;
}
const finish = (d: Dialog, key: string, status: "SENT" | "SKIPPED" | "FAILED", message: string | null, conversationId?: string) =>
  db.whatsappDialogRun.updateMany({ where: { dialogId: d.id, key }, data: { status, message, ...(conversationId ? { conversationId } : {}) } });

/** Envia a uma conversa existente. Texto se a janela permite; senão modelo (se houver); senão "ignorado". */
async function deliver(d: Dialog, conversationId: string, vars: Record<string, string>): Promise<{ status: "SENT" | "SKIPPED" | "FAILED"; message: string | null }> {
  try {
    const text = fill(d.text, vars);
    const r = (await windowAllowsText(d.organizationId, conversationId))
      ? await systemSendText(d.organizationId, conversationId, text)
      : d.templateId
        ? await systemSendTemplate(d.organizationId, conversationId, d.templateId, [vars.nome ?? "-", vars.titulo ?? vars.data ?? "-", vars.data ?? "-", vars.hora ?? "-", vars.local ?? "-"])
        : null;
    if (!r) return { status: "SKIPPED", message: "passaram 24 h da última mensagem do cliente e não há modelo aprovado no diálogo" };
    return r.status === "SENT" ? { status: "SENT", message: null } : { status: "FAILED", message: r.error ?? "o WhatsApp recusou o envio" };
  } catch (e) {
    if (e instanceof ConflictError || e instanceof ValidationError) return { status: "SKIPPED", message: e.message };
    logger.warn("whatsapp.dialog_send_failed", { error: e instanceof Error ? e.message : String(e) });
    return { status: "FAILED", message: "falha ao enviar (conexão do WhatsApp fora do ar?)" };
  }
}

/** Conversa do cliente no número principal (cria fechada se não houver). null = sem telefone, opt-out ou WhatsApp desligado. */
async function conversationForClient(organizationId: string, c: { id: string; phone: string | null }): Promise<{ id: string } | { skip: string }> {
  const waId = c.phone ? normalizeWaId(c.phone) : null;
  if (!waId) return { skip: "cliente sem telefone válido" };
  if (await db.whatsappBillingOptout.findUnique({ where: { organizationId_waId: { organizationId, waId } }, select: { waId: true } })) return { skip: "o cliente pediu para não receber mensagens automáticas" };
  const account = await db.whatsappAccount.findFirst({ where: { organizationId, isPrimary: true }, select: { id: true, enabled: true } });
  if (!account?.enabled) return { skip: "WhatsApp desligado ou não conectado" };
  const found = await db.whatsappConversation.findUnique({ where: { accountId_waId: { accountId: account.id, waId } }, select: { id: true } });
  return found ?? (await db.whatsappConversation.create({ data: { organizationId, accountId: account.id, waId, clientId: c.id, status: "CLOSED" }, select: { id: true } }));
}

const hourIn = (tz: string, now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(now)) % 24;

async function sendToClientDialog(d: Dialog, key: string, client: { id: string; phone: string | null }, vars: Record<string, string>, tally: Tally) {
  if (!(await claim(d, key, null))) return;
  const conv = await conversationForClient(d.organizationId, client);
  if ("skip" in conv) { await finish(d, key, "SKIPPED", conv.skip); tally.skipped++; return; }
  const out = await deliver(d, conv.id, vars);
  await finish(d, key, out.status, out.message, conv.id);
  tally[out.status === "SENT" ? "sent" : out.status === "SKIPPED" ? "skipped" : "failed"]++;
}

type Tally = { sent: number; skipped: number; failed: number };

/** Rotina (a cada minuto): reenvio por tempo, aniversário e aviso de audiência. */
export async function runDialogs(now = new Date()): Promise<Tally> {
  const tally: Tally = { sent: 0, skipped: 0, failed: 0 };
  const dialogs = await db.whatsappDialog.findMany({ where: { active: true, kind: { in: ["TIMER", "BIRTHDAY", "HEARING"] } }, take: 200 });
  const tzCache = new Map<string, string>();
  const tzOf = async (orgId: string) => {
    if (!tzCache.has(orgId)) tzCache.set(orgId, (await db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } }))?.timezone ?? "America/Sao_Paulo");
    return tzCache.get(orgId)!;
  };
  for (const d of dialogs) {
    try {
      const tz = await tzOf(d.organizationId);
      const today = todayYmd(tz, now);
      if (d.kind === "TIMER") await runTimer(d, now, tally);
      else if (d.kind === "BIRTHDAY") {
        const cfg = cfgSchema.BIRTHDAY.safeParse(d.config);
        if (!cfg.success || hourIn(tz, now) < cfg.data.sendHour) continue;
        const [, mm, dd] = today.split("-");
        const clients = await db.client.findMany({ where: { organizationId: d.organizationId, deletedAt: null, birthDate: { not: null }, phone: { not: null } }, select: { id: true, name: true, phone: true, birthDate: true }, take: 2000 });
        for (const c of clients) {
          if (c.birthDate!.toISOString().slice(5, 10) !== `${mm}-${dd}`) continue;
          await sendToClientDialog(d, `b:${c.id}:${today}`, c, { nome: c.name.split(" ")[0] ?? c.name }, tally);
        }
      } else if (d.kind === "HEARING") {
        const cfg = cfgSchema.HEARING.safeParse(d.config);
        if (!cfg.success || hourIn(tz, now) < cfg.data.sendHour) continue;
        const target = addDays(today, cfg.data.daysBefore);
        const from = new Date(ymdToDate(target).getTime() - 24 * 3600_000), to = new Date(ymdToDate(target).getTime() + 48 * 3600_000);
        const events = await db.agendaEvent.findMany({ where: { organizationId: d.organizationId, kind: "HEARING", deletedAt: null, clientId: { not: null }, startsAt: { gte: from, lte: to } }, select: { id: true, title: true, startsAt: true, location: true, client: { select: { id: true, name: true, phone: true, deletedAt: true } } }, take: 500 });
        for (const e of events) {
          if (!e.client || e.client.deletedAt) continue;
          const day = todayYmd(tz, e.startsAt);
          if (day !== target) continue;
          const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(e.startsAt);
          const data = day.split("-").reverse().join("/");
          await sendToClientDialog(d, `h:${e.id}:${cfg.data.daysBefore}`, e.client, { nome: e.client.name.split(" ")[0] ?? e.client.name, titulo: e.title, data, hora, local: e.location ?? "-" }, tally);
        }
      }
    } catch (e) {
      logger.error("whatsapp.dialog_failed", { dialogId: d.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return tally;
}

async function runTimer(d: { id: string; organizationId: string; text: string; templateId: string | null; config: unknown }, now: Date, tally: Tally) {
  const cfg = cfgSchema.TIMER.safeParse(d.config);
  if (!cfg.success) return;
  const limit = new Date(now.getTime() - cfg.data.minutes * 60_000);
  const oldest = new Date(now.getTime() - 3 * 86_400_000);
  const convs = await db.whatsappConversation.findMany({ where: { organizationId: d.organizationId, status: "OPEN", lastMessageAt: { lte: limit, gte: oldest } }, select: { id: true, contactName: true, waId: true, client: { select: { name: true } } }, take: 300 });
  for (const c of convs) {
    const last = await db.whatsappMessage.findFirst({ where: { conversationId: c.id, direction: { in: ["IN", "OUT"] } }, orderBy: { createdAt: "desc" }, select: { id: true, direction: true, automatic: true, createdAt: true } });
    // só se a última fala foi NOSSA (de uma pessoa) e o cliente não respondeu
    if (!last || last.direction !== "OUT" || last.automatic || last.createdAt > limit) continue;
    const key = `t:${c.id}:${last.id}`;
    if (!(await claim(d, key, c.id))) continue;
    const name = (c.client?.name ?? c.contactName ?? "").split(" ")[0] || "tudo bem";
    const out = await deliver(d, c.id, { nome: name });
    await finish(d, key, out.status, out.message);
    tally[out.status === "SENT" ? "sent" : out.status === "SKIPPED" ? "skipped" : "failed"]++;
  }
}

// ======================= recepção de mensagem =======================

type InboundAccount = { organizationId: string; openFrom: string; openUntil: string; openDays: number[] };

/** Chamado a cada mensagem do cliente: horário de atendimento, delegar ao responsável e intenções. Nunca lança. */
export async function runInboundDialogs(account: InboundAccount, conversationId: string, m: { text: string | null; messageKey: string; now: Date }): Promise<void> {
  try {
    const orgId = account.organizationId;
    const s = await db.whatsappExtrasSettings.findUnique({ where: { organizationId: orgId }, select: { delegateEnabled: true, intentsEnabled: true } });
    if (s?.delegateEnabled) await delegateToResponsible(orgId, conversationId).catch((e) => logger.warn("whatsapp.delegate_failed", { error: String(e) }));
    if (!m.text) return;
    const text = norm(m.text);
    const hours = await db.whatsappDialog.findMany({ where: { organizationId: orgId, kind: "HOURS", active: true }, take: 5 });
    for (const d of hours) {
      const cfg = cfgSchema.HOURS.safeParse(d.config);
      if (!cfg.success || !cfg.data.keywords.split(/[,;\n]/).map((k) => norm(k).trim()).filter(Boolean).some((k) => text.includes(k))) continue;
      const key = `o:${conversationId}:${m.messageKey}`;
      if (!(await claim(d, key, conversationId))) continue;
      const tz = (await db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } }))?.timezone ?? "America/Sao_Paulo";
      const closed = isOutsideHours(m.now, tz, account.openFrom, account.openUntil, account.openDays);
      const conv = await db.whatsappConversation.findUnique({ where: { id: conversationId }, select: { contactName: true, client: { select: { name: true } } } });
      const nome = (conv?.client?.name ?? conv?.contactName ?? "").split(" ")[0] || "tudo bem";
      const out = await deliver({ ...d, text: closed ? cfg.data.closedText : d.text }, conversationId, { nome });
      await finish(d, key, out.status, out.message);
      break;
    }
    if (s?.intentsEnabled) await runIntents(orgId, conversationId, m.text, m.messageKey);
  } catch (e) {
    logger.error("whatsapp.dialog_inbound_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Entrega a conversa ao responsável do processo ativo do cliente (se ainda sem responsável). */
export async function delegateToResponsible(organizationId: string, conversationId: string): Promise<string | null> {
  const c = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId }, select: { id: true, clientId: true, caseId: true, assignedToId: true } });
  if (!c || c.assignedToId) return null;
  let caseId = c.caseId;
  if (!caseId && c.clientId) {
    const p = await db.caseParty.findFirst({ where: { organizationId, clientId: c.clientId, case: { status: "ACTIVE", deletedAt: null } }, orderBy: { createdAt: "desc" }, select: { caseId: true } });
    caseId = p?.caseId ?? null;
  }
  if (!caseId) return null;
  const member = await db.caseMember.findFirst({ where: { organizationId, caseId, role: "RESPONSIBLE", user: { disabledAt: null } }, select: { userId: true } });
  if (!member) return null;
  const ok = await db.membership.findFirst({ where: { organizationId, userId: member.userId, status: "ACTIVE" }, select: { id: true } });
  if (!ok) return null;
  const r = await db.whatsappConversation.updateMany({ where: { id: c.id, assignedToId: null }, data: { assignedToId: member.userId, assignedAt: new Date() } });
  if (r.count !== 1) return null;
  await db.whatsappMessage.create({ data: { organizationId, conversationId, direction: "NOTE", type: "text", body: "Conversa entregue ao advogado responsável pelo processo do cliente.", status: "NOTE" } }).catch(() => undefined);
  await notify({ organizationId, userId: member.userId, kind: "chat.delegated", title: "Conversa de um cliente seu", body: "Chegou mensagem de cliente de um processo seu.", link: `/atendimento?c=${conversationId}`, dedupeKey: `chat.delegated:${conversationId}:${new Date().toISOString().slice(0, 13)}` }).catch(() => 0);
  return member.userId;
}

// ======================= intenções =======================

export const intentSchema = z.object({
  name: z.string().trim().min(3, "Nome: mínimo 3 caracteres.").max(80),
  terms: z.array(z.object({ term: z.string().trim().min(2).max(60), weight: z.number().int().min(1).max(10) })).min(1, "Informe pelo menos uma palavra.").max(30),
  threshold: z.number().int().min(1).max(100),
  actions: z.array(chatActionSchema).min(1, "Escolha pelo menos uma ação.").max(5),
  active: z.boolean().optional(),
});

export async function listIntents(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:read");
  return db.whatsappIntent.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "asc" }, take: 50 });
}

export async function saveIntent(ctx: TenantContext, id: string | null, raw: unknown) {
  assertCan(ctx, "whatsapp:manage");
  const p = intentSchema.safeParse(raw);
  if (!p.success) throw new ValidationError("Confira os campos.", p.error.flatten().fieldErrors as Record<string, string[]>);
  const d = p.data;
  const data = { name: d.name, terms: d.terms as object, threshold: d.threshold, actions: d.actions as object };
  let row;
  if (id) {
    if (!(await db.whatsappIntent.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } }))) throw new NotFoundError("Intenção não encontrada.");
    row = await db.whatsappIntent.update({ where: { id }, data });
  } else {
    if ((await db.whatsappIntent.count({ where: { organizationId: ctx.organizationId } })) >= 30) throw new ConflictError("Limite de 30 intenções.");
    row = await db.whatsappIntent.create({ data: { ...data, organizationId: ctx.organizationId, active: false } });
  }
  await audit({ action: "whatsapp.intent_save", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_intent", resourceId: row.id, meta: ctx.meta });
  return row;
}

export async function setIntentActive(ctx: TenantContext, id: string, active: boolean) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappIntent.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { active } });
  if (r.count !== 1) throw new NotFoundError("Intenção não encontrada.");
}

export async function deleteIntent(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappIntent.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Intenção não encontrada.");
}

/** Pontuação: soma o peso de cada palavra presente (uma vez por palavra). */
export function scoreIntent(text: string, terms: { term: string; weight: number }[]): number {
  const t = norm(text);
  return terms.reduce((s, x) => s + (t.includes(norm(x.term)) ? x.weight : 0), 0);
}

/** Prévia para quem configura: qual intenção ganharia com este texto (não executa nada). */
export async function testIntents(ctx: TenantContext, text: string) {
  assertCan(ctx, "whatsapp:read");
  const all = await db.whatsappIntent.findMany({ where: { organizationId: ctx.organizationId }, take: 50 });
  return all.map((i) => ({ id: i.id, name: i.name, score: scoreIntent(text, z.array(z.object({ term: z.string(), weight: z.number() })).catch([]).parse(i.terms)), threshold: i.threshold, active: i.active })).sort((a, b) => b.score - a.score);
}

async function runIntents(organizationId: string, conversationId: string, text: string, messageKey: string) {
  const all = await db.whatsappIntent.findMany({ where: { organizationId, active: true }, take: 50 });
  let best: { i: (typeof all)[number]; score: number } | null = null;
  for (const i of all) {
    const score = scoreIntent(text, z.array(z.object({ term: z.string(), weight: z.number() })).catch([]).parse(i.terms));
    if (score >= i.threshold && (!best || score > best.score)) best = { i, score };
  }
  if (!best) return;
  // uma intenção por conversa a cada 30 min (evita repetir resposta se o cliente insiste)
  const marker = `intent:${best.i.id}`;
  const recent = await db.whatsappMessage.findFirst({ where: { conversationId, direction: "NOTE", body: { startsWith: `Intenção “${best.i.name}”` }, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } }, select: { id: true } });
  if (recent) return;
  const actions = chatActionSchema.array().catch([]).parse(best.i.actions);
  const { done, failed } = await runActionsOnConversation(organizationId, conversationId, best.i.name, marker, { trigger: "KEYWORD", eventKey: messageKey, text }, actions);
  await db.whatsappMessage.create({ data: { organizationId, conversationId, direction: "NOTE", type: "text", body: `Intenção “${best.i.name}” reconhecida (${best.score} pontos): ${[...done, ...failed].join("; ").slice(0, 700) || "nada a fazer"}.`, status: "NOTE" } }).catch(() => undefined);
}
