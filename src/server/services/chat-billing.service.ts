import { db } from "@/lib/db/client";
import { addDays, diffDays, formatYmd, todayYmd, weekday } from "@/lib/dates/ymd";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { normalizeWaId } from "@/lib/whatsapp/phone";
import { formatMoneyBR } from "@/lib/validation/money";
import { fromCents, toCents } from "@/lib/finance/money";
import { billingSchema, BILLING_KIND_LABEL, renderBilling, STOP_WORDS, type BillingKind, type BillingVars } from "@/modules/whatsapp/billing-schema";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { systemSendTemplate, systemSendText, windowAllowsText } from "./whatsapp.service";

/**
 * LegalOS Chat — cobrança de honorários pelo WhatsApp.
 * Lembretes automáticos das parcelas de HONORÁRIOS a receber (antes, no dia e em atraso), com texto escrito pelo escritório.
 * Respeita: pedido de parar (o cliente responde "PARAR"), janela de 24 h da Meta (usa modelo aprovado fora dela),
 * fins de semana, no máximo um envio por parcela e momento, e não manda para parcela já paga ou cancelada.
 * Não cria cobrança em banco/Pix: só avisa; os dados de pagamento são o texto que o escritório escrever.
 */

const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 30 * 60 * 1000;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[.!\s]+$/g, "");

// ---------------- configuração ----------------

export async function getBillingSettings(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  const s = await db.whatsappBillingSettings.findUnique({ where: { organizationId: ctx.organizationId } });
  return s
    ? { saved: true, enabled: s.enabled, offsets: s.offsets, sendHour: s.sendHour, skipWeekends: s.skipWeekends, maxOverdueDays: s.maxOverdueDays, beforeText: s.beforeText, dueText: s.dueText, overdueText: s.overdueText, paymentInfo: s.paymentInfo, templateId: s.templateId }
    : { saved: false, ...DEFAULTS };
}

export const DEFAULTS = {
  enabled: false, offsets: [-3, 0, 3], sendHour: 9, skipWeekends: true, maxOverdueDays: 60,
  beforeText: "Olá, {{nome}}! Lembramos que a parcela {{parcela}} dos honorários, no valor de {{valor}}, vence em {{vencimento}}. Qualquer dúvida, é só responder esta mensagem.",
  dueText: "Olá, {{nome}}! Hoje vence a parcela {{parcela}} dos honorários, no valor de {{valor}}. Qualquer dúvida, é só responder esta mensagem.",
  overdueText: "Olá, {{nome}}! Não identificamos o pagamento da parcela {{parcela}} dos honorários, no valor de {{valor}}, que venceu em {{vencimento}}. Se já pagou, desconsidere e nos envie o comprovante. Qualquer dúvida, é só responder esta mensagem.",
  paymentInfo: null as string | null, templateId: null as string | null,
};

export async function saveBillingSettings(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "whatsapp:manage");
  const parsed = billingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fieldErrors[String(i.path[0] ?? "form")] ??= []).push(i.message);
    throw new ValidationError("Corrija os campos destacados.", fieldErrors);
  }
  const v = parsed.data;
  const offsets = [...new Set(v.offsets)].sort((a, b) => a - b);
  if (offsets.some((o) => o > v.maxOverdueDays)) throw new ValidationError("Há um envio depois do limite de atraso.", { offsets: ["Todos os envios de atraso precisam caber no limite de dias de atraso."] });
  if (v.templateId) {
    const t = await db.whatsappTemplate.findFirst({ where: { id: v.templateId, organizationId: ctx.organizationId, status: "APPROVED" }, select: { variableCount: true } });
    if (!t) throw new ValidationError("Modelo não encontrado ou não aprovado.", { templateId: ["Escolha um modelo aprovado pela Meta."] });
    if (t.variableCount > 5) throw new ValidationError("Modelo com variáveis demais.", { templateId: ["A cobrança oferece até 5 variáveis: nome, valor, vencimento, parcela e descrição."] });
  }
  // `enabled` nunca muda aqui: ligar a cobrança automática é uma decisão à parte (interruptor com confirmação).
  const data = { offsets, sendHour: v.sendHour, skipWeekends: v.skipWeekends, maxOverdueDays: v.maxOverdueDays, beforeText: v.beforeText, dueText: v.dueText, overdueText: v.overdueText, paymentInfo: v.paymentInfo?.trim() || null, templateId: v.templateId || null, updatedById: ctx.userId };
  await db.whatsappBillingSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, enabled: false, ...data }, update: data });
  await audit({ action: "whatsapp.billing_settings", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_billing", resourceId: ctx.organizationId, metadata: { offsets }, meta: ctx.meta });
}

export async function listBillingSends(ctx: TenantContext, limit = 30) {
  assertCan(ctx, "whatsapp:manage");
  const rows = await db.whatsappBillingSend.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: limit });
  const entries = await db.financeEntry.findMany({ where: { id: { in: rows.map((r) => r.entryId) }, organizationId: ctx.organizationId }, select: { id: true, description: true, installmentNo: true, installmentTotal: true, dueDate: true } });
  const clients = await db.client.findMany({ where: { id: { in: rows.map((r) => r.clientId).filter((x): x is string => !!x) }, organizationId: ctx.organizationId }, select: { id: true, name: true } });
  const e = new Map(entries.map((x) => [x.id, x]));
  const c = new Map(clients.map((x) => [x.id, x.name]));
  return rows.map((r) => ({ id: r.id, status: r.status, kind: r.kind as BillingKind, reason: r.reason, manual: r.offsetDays == null, createdAt: r.createdAt, client: r.clientId ? (c.get(r.clientId) ?? "—") : "—", entry: e.get(r.entryId)?.description ?? "—", due: e.get(r.entryId)?.dueDate.toISOString().slice(0, 10) ?? null }));
}

export async function billingHistoryForEntry(ctx: TenantContext, entryId: string) {
  assertCan(ctx, "finance:read");
  const rows = await db.whatsappBillingSend.findMany({ where: { entryId, organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, kind: true, reason: true, offsetDays: true, createdAt: true } });
  return rows.map((r) => ({ id: r.id, status: r.status, kind: r.kind as BillingKind, reason: r.reason, manual: r.offsetDays == null, createdAt: r.createdAt }));
}

export async function listOptouts(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  return db.whatsappBillingOptout.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 100, select: { waId: true, source: true, createdAt: true } });
}

export async function removeOptout(ctx: TenantContext, waId: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappBillingOptout.deleteMany({ where: { organizationId: ctx.organizationId, waId } });
  if (r.count !== 1) throw new NotFoundError("Registro não encontrado.");
  await audit({ action: "whatsapp.billing_optin", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_billing", resourceId: ctx.organizationId, meta: ctx.meta });
}

// ---------------- envio ----------------

type EntryRow = { id: string; description: string; amount: { toString(): string }; paidAmount: { toString(): string }; dueDate: Date; installmentNo: number | null; installmentTotal: number | null; clientId: string | null };
type ClientRow = { id: string; name: string; type: string; phone: string | null };
type Settings = { beforeText: string; dueText: string; overdueText: string; paymentInfo: string | null; templateId: string | null };

const kindOf = (due: string, today: string): BillingKind => { const d = diffDays(today, due); return d < 0 ? "BEFORE" : d === 0 ? "DUE" : "OVERDUE"; };
const remainingOf = (e: EntryRow) => fromCents((toCents(e.amount.toString()) ?? 0n) - (toCents(e.paidAmount.toString()) ?? 0n));

export function varsFor(e: EntryRow, c: ClientRow): BillingVars {
  const name = c.type === "PERSON" ? (c.name.trim().split(/\s+/)[0] ?? c.name) : c.name.trim();
  return { nome: name, valor: formatMoneyBR(remainingOf(e)), vencimento: formatYmd(e.dueDate.toISOString().slice(0, 10)), parcela: e.installmentTotal && e.installmentTotal > 1 ? `${e.installmentNo}/${e.installmentTotal}` : "única", descricao: e.description };
}

export function textFor(s: Settings, kind: BillingKind, v: BillingVars): string {
  const base = renderBilling(kind === "BEFORE" ? s.beforeText : kind === "DUE" ? s.dueText : s.overdueText, v);
  return `${s.paymentInfo?.trim() ? `${base}\n\n${s.paymentInfo.trim()}` : base}\n\nPara não receber mais estes lembretes, responda PARAR.`;
}

type Outcome = { status: "SENT" | "FAILED" | "SKIPPED"; reason: string | null; conversationId: string | null };

/** Envia UM lembrete. Nunca lança para falhas "esperadas": devolve o resultado para o histórico. */
async function deliverOne(organizationId: string, e: EntryRow, c: ClientRow | null, kind: BillingKind, s: Settings): Promise<Outcome> {
  const skip = (reason: string, conversationId: string | null = null): Outcome => ({ status: "SKIPPED", reason, conversationId });
  if (!c) return skip("cliente não encontrado");
  const waId = c.phone ? normalizeWaId(c.phone) : null;
  if (!waId) return skip("cliente sem telefone válido no cadastro");
  if (await db.whatsappBillingOptout.findUnique({ where: { organizationId_waId: { organizationId, waId } }, select: { waId: true } })) return skip("o cliente pediu para não receber lembretes");
  const account = await db.whatsappAccount.findFirst({ where: { organizationId, isPrimary: true }, select: { id: true, enabled: true } });
  if (!account?.enabled) return skip("WhatsApp desligado ou não conectado");
  const found = await db.whatsappConversation.findUnique({ where: { accountId_waId: { accountId: account.id, waId } }, select: { id: true } });
  const conv = found ?? (await db.whatsappConversation.create({ data: { organizationId, accountId: account.id, waId, clientId: c.id, status: "CLOSED" }, select: { id: true } }));
  const vars = varsFor(e, c);
  try {
    const r = (await windowAllowsText(organizationId, conv.id))
      ? await systemSendText(organizationId, conv.id, textFor(s, kind, vars))
      : s.templateId
        ? await systemSendTemplate(organizationId, conv.id, s.templateId, [vars.nome, vars.valor, vars.vencimento, vars.parcela, vars.descricao])
        : null;
    if (!r) return skip("passaram 24 h desde a última mensagem do cliente e não há modelo aprovado configurado", conv.id);
    return r.status === "SENT" ? { status: "SENT", reason: null, conversationId: conv.id } : { status: "FAILED", reason: r.error ?? "o WhatsApp recusou o envio", conversationId: conv.id };
  } catch (err) {
    if (err instanceof ConflictError || err instanceof ValidationError) return skip(err.message, conv.id);
    logger.warn("whatsapp.billing_send_failed", { error: err instanceof Error ? err.message : String(err) });
    return { status: "FAILED", reason: "falha ao enviar (a conexão do WhatsApp pode estar fora do ar)", conversationId: conv.id };
  }
}

async function loadEntry(organizationId: string, entryId: string) {
  const e = await db.financeEntry.findFirst({ where: { id: entryId, organizationId } });
  if (!e) throw new NotFoundError("Lançamento não encontrado.");
  const c = e.clientId ? await db.client.findFirst({ where: { id: e.clientId, organizationId, deletedAt: null }, select: { id: true, name: true, type: true, phone: true } }) : null;
  return { e, c };
}

const settingsOf = async (organizationId: string): Promise<Settings> => {
  const s = await db.whatsappBillingSettings.findUnique({ where: { organizationId } });
  return s ?? { beforeText: DEFAULTS.beforeText, dueText: DEFAULTS.dueText, overdueText: DEFAULTS.overdueText, paymentInfo: null, templateId: null };
};

/** Pode cobrar esta parcela agora? Usado para habilitar o botão e explicar o motivo. */
export async function billingAvailability(ctx: TenantContext, entryId: string): Promise<{ ok: boolean; reason: string | null }> {
  assertCan(ctx, "finance:read");
  const { e, c } = await loadEntry(ctx.organizationId, entryId);
  if (e.kind !== "RECEIVABLE" || e.type !== "FEE") return { ok: false, reason: "Só parcelas de honorários a receber." };
  if (e.status !== "OPEN" && e.status !== "PARTIAL") return { ok: false, reason: "A parcela já está paga ou cancelada." };
  if (!c) return { ok: false, reason: "Vincule um cliente ao lançamento." };
  const waId = c.phone ? normalizeWaId(c.phone) : null;
  if (!waId) return { ok: false, reason: "O cliente não tem telefone válido no cadastro." };
  const acc = await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true }, select: { enabled: true } });
  if (!acc?.enabled) return { ok: false, reason: "O WhatsApp não está conectado/ligado." };
  if (await db.whatsappBillingOptout.findUnique({ where: { organizationId_waId: { organizationId: ctx.organizationId, waId } } })) return { ok: false, reason: "O cliente pediu para não receber lembretes." };
  const recent = await db.whatsappBillingSend.findFirst({ where: { entryId, offsetDays: null, status: "SENT", createdAt: { gt: new Date(Date.now() - 24 * 3600_000) } }, select: { id: true } });
  if (recent) return { ok: false, reason: "Já foi enviada uma cobrança manual nas últimas 24 horas." };
  return { ok: true, reason: null };
}

/** Botão "Cobrar pelo WhatsApp": envia agora, no tom certo para a situação da parcela. */
export async function sendBillingNow(ctx: TenantContext, entryId: string) {
  assertCan(ctx, "finance:write");
  assertCan(ctx, "whatsapp:write");
  const av = await billingAvailability(ctx, entryId);
  if (!av.ok) throw new ConflictError(av.reason ?? "Não é possível cobrar esta parcela agora.");
  const { e, c } = await loadEntry(ctx.organizationId, entryId);
  const kind = kindOf(e.dueDate.toISOString().slice(0, 10), todayYmd(ctx.timezone));
  const row = await db.whatsappBillingSend.create({ data: { organizationId: ctx.organizationId, entryId, clientId: e.clientId, kind, status: "SENDING", createdById: ctx.userId } });
  const out = await deliverOne(ctx.organizationId, e, c, kind, await settingsOf(ctx.organizationId));
  await db.whatsappBillingSend.update({ where: { id: row.id }, data: { status: out.status, reason: out.reason, conversationId: out.conversationId, attempts: 1 } });
  await audit({ action: "whatsapp.billing_manual", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_entry", resourceId: entryId, metadata: { status: out.status, kind }, meta: ctx.meta });
  if (out.status !== "SENT") throw new ConflictError(`Não foi enviado: ${out.reason ?? "erro desconhecido"}.`);
  return { kind };
}

// ---------------- rotina automática ----------------

type SelSettings = { organizationId: string; offsets: number[]; sendHour: number; skipWeekends: boolean; maxOverdueDays: number };

/** Quais parcelas receberiam lembrete AGORA (mesma regra da rotina e da prévia). Devolve null fora da hora/dia de envio. */
async function selectDue(s: SelSettings, timezone: string, now: Date) {
  const today = todayYmd(timezone, now);
  if (hourIn(timezone, now) < s.sendHour) return null;
  const wd = weekday(today);
  if (s.skipWeekends && (wd === 0 || wd === 6)) return null;
  const lookback = s.skipWeekends && wd === 1 ? [0, 1, 2] : [0]; // segunda recupera sábado e domingo
  const targets = new Set<string>();
  for (const o of s.offsets) for (const k of lookback) targets.add(addDays(today, -(o + k)));
  const dues = [...targets].sort();
  const entries = await db.financeEntry.findMany({
    where: { organizationId: s.organizationId, kind: "RECEIVABLE", type: "FEE", status: { in: ["OPEN", "PARTIAL"] }, canceledAt: null, clientId: { not: null }, dueDate: { gte: new Date(`${dues[0]}T00:00:00Z`), lte: new Date(`${dues[dues.length - 1]}T00:00:00Z`) } },
    orderBy: { dueDate: "asc" }, take: 500,
  });
  const clientIds = [...new Set(entries.map((e) => e.clientId!).filter(Boolean))];
  const clients = new Map((await db.client.findMany({ where: { id: { in: clientIds }, organizationId: s.organizationId, deletedAt: null }, select: { id: true, name: true, type: true, phone: true } })).map((c) => [c.id, c]));
  const picked: { e: (typeof entries)[number]; offset: number }[] = [];
  for (const e of entries) {
    const due = e.dueDate.toISOString().slice(0, 10);
    const offset = [...s.offsets].find((o) => lookback.some((k) => addDays(today, -(o + k)) === due));
    if (offset === undefined || offset > s.maxOverdueDays) continue;
    if ((toCents(e.amount.toString()) ?? 0n) - (toCents(e.paidAmount.toString()) ?? 0n) <= 0n) continue;
    picked.push({ e, offset });
  }
  return { today, picked, clients };
}

/** Prévia para quem vai ligar: o que a próxima rodada enviaria se estivesse ligada agora. Não envia nada. */
export async function billingPreview(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  const s = await db.whatsappBillingSettings.findUnique({ where: { organizationId: ctx.organizationId } });
  const cfg: SelSettings = s ?? { organizationId: ctx.organizationId, ...DEFAULTS };
  const sel = await selectDue(cfg, ctx.timezone, new Date());
  const done = sel ? await db.whatsappBillingSend.findMany({ where: { organizationId: ctx.organizationId, entryId: { in: sel.picked.map((p) => p.e.id) }, offsetDays: { not: null } }, select: { entryId: true, offsetDays: true } }) : [];
  const already = new Set(done.map((d) => `${d.entryId}:${d.offsetDays}`));
  const fresh = (sel?.picked ?? []).filter((p) => !already.has(`${p.e.id}:${p.offset}`));
  return { windowOpenNow: !!sel, wouldSend: fresh.length, clients: new Set(fresh.map((p) => p.e.clientId)).size, saved: !!s };
}

function hourIn(tz: string, now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(now)) % 24;
}

/** Chamada de hora em hora pelo agendador. Cada parcela recebe cada momento (ex.: "3 dias antes") no máximo uma vez. */
export async function runBillingReminders(now = new Date()): Promise<{ orgs: number; sent: number; skipped: number; failed: number }> {
  const res = { orgs: 0, sent: 0, skipped: 0, failed: 0 };
  const all = await db.whatsappBillingSettings.findMany({ where: { enabled: true } });
  for (const s of all) {
    try {
      const org = await db.organization.findUnique({ where: { id: s.organizationId }, select: { timezone: true } });
      if (!org) continue;
      const sel = await selectDue(s, org.timezone, now);
      if (!sel) continue;
      res.orgs++;
      const { today, picked, clients } = sel;
      for (const { e, offset } of picked) {
        // Desligaram no meio da rodada? Para na hora: nada é enviado sem a autorização valendo.
        if (!(await db.whatsappBillingSettings.findFirst({ where: { organizationId: s.organizationId, enabled: true }, select: { organizationId: true } }))) break;
        const due = e.dueDate.toISOString().slice(0, 10);
        const claimed = await claim(s.organizationId, e.id, e.clientId, offset, kindOf(due, today), now);
        if (!claimed) continue;
        const out = await deliverOne(s.organizationId, e, clients.get(e.clientId!) ?? null, kindOf(due, today), s);
        await db.whatsappBillingSend.update({ where: { id: claimed.id }, data: { status: out.status, reason: out.reason, conversationId: out.conversationId, attempts: claimed.attempts + 1 } });
        if (out.status === "SENT") res.sent++;
        else if (out.status === "FAILED") res.failed++;
        else res.skipped++;
      }
    } catch (err) {
      logger.error("whatsapp.billing_org_failed", { organizationId: s.organizationId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return res;
}

/** Reserva (parcela, momento). Devolve null se já foi tratado; permite repetir falha de envio (até 3 vezes, com intervalo). */
async function claim(organizationId: string, entryId: string, clientId: string | null, offset: number, kind: BillingKind, now: Date) {
  const created = await db.whatsappBillingSend.createMany({ data: [{ organizationId, entryId, clientId, offsetDays: offset, kind, status: "SENDING" }], skipDuplicates: true });
  const row = await db.whatsappBillingSend.findFirst({ where: { entryId, offsetDays: offset }, select: { id: true, status: true, attempts: true, updatedAt: true } });
  if (!row) return null;
  if (created.count === 1) return { id: row.id, attempts: 0 };
  if (row.status === "FAILED" && row.attempts < MAX_ATTEMPTS && now.getTime() - row.updatedAt.getTime() > RETRY_AFTER_MS) {
    const r = await db.whatsappBillingSend.updateMany({ where: { id: row.id, status: "FAILED", attempts: row.attempts }, data: { status: "SENDING" } });
    return r.count === 1 ? { id: row.id, attempts: row.attempts } : null;
  }
  return null;
}

// ---------------- resposta do cliente ----------------

/** O cliente respondeu "PARAR" a uma cobrança recente: registra, confirma e não cobra mais por aqui. Devolve true se tratou. */
export async function handleBillingReply(organizationId: string, conversationId: string, waId: string, text: string | null): Promise<boolean> {
  try {
    if (!text || !STOP_WORDS.includes(norm(text))) return false;
    const recent = await db.whatsappBillingSend.findFirst({ where: { conversationId, organizationId, status: "SENT", createdAt: { gt: new Date(Date.now() - 14 * 24 * 3600_000) } }, select: { id: true } });
    if (!recent) return false;
    await db.whatsappBillingOptout.upsert({ where: { organizationId_waId: { organizationId, waId } }, create: { organizationId, waId, source: "REPLY" }, update: {} });
    await db.whatsappMessage.create({ data: { organizationId, conversationId, direction: "NOTE", type: "text", body: "O cliente pediu para não receber mais lembretes automáticos de cobrança. Registrado.", status: "NOTE" } });
    await systemSendText(organizationId, conversationId, "Certo! Não enviaremos mais lembretes automáticos de cobrança por aqui. Se precisar de algo, é só chamar.").catch(() => undefined);
    return true;
  } catch (e) {
    logger.error("whatsapp.billing_reply_failed", { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** Houve cobrança enviada a esta conversa há pouco? (o menu de triagem não deve responder a "já paguei"). */
export async function hadRecentBilling(conversationId: string, days = 3): Promise<boolean> {
  return (await db.whatsappBillingSend.count({ where: { conversationId, status: "SENT", createdAt: { gt: new Date(Date.now() - days * 24 * 3600_000) } } })) > 0;
}

export { BILLING_KIND_LABEL };
