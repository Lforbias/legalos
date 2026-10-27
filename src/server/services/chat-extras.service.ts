import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { notify } from "./notification.service";
import { listFields } from "./chat-meta.service";
import { sendMessage, systemSendText } from "./whatsapp.service";
import { logger } from "@/lib/logging/logger";

/**
 * 2.0-F9 — extras do Chat. REGRA: nada é enviado sem uma pessoa ter mandado.
 * - Follow-up: só lembra a equipe (aviso interno), não envia mensagem.
 * - Mensagem agendada: uma pessoa escreve e escolhe o horário; só sai com a chave "Mensagens agendadas" ligada.
 * - NPS: uma pessoa aperta "Enviar pesquisa" numa conversa; só funciona com a chave "Pesquisa de satisfação" ligada.
 * - Formulários: lista de campos para preencher durante o atendimento (nada vai ao cliente).
 */

const DEFAULT_QUESTION = "De 0 a 10, o quanto você recomendaria o nosso atendimento a um amigo? Responda apenas com o número.";

// ======================= chaves =======================

const BOOL_KEYS = ["scheduledEnabled", "npsEnabled", "aiSummaryEnabled", "archiveEnabled", "npsAutoOnClose", "campaignsEnabled", "delegateEnabled", "intentsEnabled", "transcribeEnabled"] as const;
export type ExtrasBoolKey = (typeof BOOL_KEYS)[number];

export async function getExtrasSettings(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:read");
  const s = await db.whatsappExtrasSettings.findUnique({ where: { organizationId: ctx.organizationId } });
  return {
    scheduledEnabled: s?.scheduledEnabled ?? false,
    npsEnabled: s?.npsEnabled ?? false,
    aiSummaryEnabled: s?.aiSummaryEnabled ?? false,
    archiveEnabled: s?.archiveEnabled ?? false,
    archiveDays: s?.archiveDays ?? 7,
    npsAutoOnClose: s?.npsAutoOnClose ?? false,
    campaignsEnabled: s?.campaignsEnabled ?? false,
    delegateEnabled: s?.delegateEnabled ?? false,
    intentsEnabled: s?.intentsEnabled ?? false,
    transcribeEnabled: s?.transcribeEnabled ?? false,
    npsQuestion: s?.npsQuestion ?? DEFAULT_QUESTION,
  };
}

export async function setExtrasSettings(ctx: TenantContext, v: Partial<Record<ExtrasBoolKey, boolean>> & { npsQuestion?: string; archiveDays?: number }) {
  assertCan(ctx, "whatsapp:manage");
  const data: Record<string, boolean | number | string> = {};
  for (const k of BOOL_KEYS) if (typeof v[k] === "boolean") data[k] = v[k]!;
  if (v.archiveDays !== undefined) {
    if (!Number.isInteger(v.archiveDays) || v.archiveDays < 1 || v.archiveDays > 365) throw new ValidationError("Informe de 1 a 365 dias.", { archiveDays: ["Informe de 1 a 365 dias."] });
    data.archiveDays = v.archiveDays;
  }
  if (v.npsQuestion !== undefined) {
    const q = v.npsQuestion.replace(/\r\n/g, "\n").trim();
    if (q.length < 10 || q.length > 500) throw new ValidationError("A pergunta deve ter de 10 a 500 caracteres.", { npsQuestion: ["A pergunta deve ter de 10 a 500 caracteres."] });
    data.npsQuestion = q;
  }
  await db.whatsappExtrasSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  await audit({ action: "whatsapp.extras_settings", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_extras", metadata: data, meta: ctx.meta });
}

async function conv(ctx: TenantContext, id: string) {
  const c = await db.whatsappConversation.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, waId: true, accountId: true } });
  if (!c) throw new NotFoundError("Conversa não encontrada.");
  return c;
}

// ======================= follow-ups =======================

export async function addFollowUp(ctx: TenantContext, conversationId: string, input: { dueAt: Date; note: string; assigneeId?: string | null }) {
  assertCan(ctx, "whatsapp:write");
  await conv(ctx, conversationId);
  const note = input.note.trim();
  if (note.length < 2 || note.length > 500) throw new ValidationError("Escreva o lembrete (até 500 caracteres).", { note: ["Escreva o lembrete (até 500 caracteres)."] });
  if (!(input.dueAt instanceof Date) || Number.isNaN(input.dueAt.getTime()) || input.dueAt.getTime() < Date.now() - 60_000) throw new ValidationError("Escolha uma data e hora futuras.", { dueAt: ["Escolha uma data e hora futuras."] });
  if (input.dueAt.getTime() > Date.now() + 366 * 86_400_000) throw new ValidationError("O prazo máximo é de um ano.", { dueAt: ["O prazo máximo é de um ano."] });
  const assigneeId = input.assigneeId || ctx.userId;
  const m = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: assigneeId, status: "ACTIVE", user: { disabledAt: null } }, select: { id: true } });
  if (!m) throw new ValidationError("Responsável indisponível.", { assigneeId: ["Escolha um membro ativo."] });
  const open = await db.whatsappFollowUp.count({ where: { conversationId, doneAt: null } });
  if (open >= 20) throw new ConflictError("Esta conversa já tem lembretes demais em aberto.");
  const f = await db.whatsappFollowUp.create({ data: { organizationId: ctx.organizationId, conversationId, assigneeId, dueAt: input.dueAt, note, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "whatsapp.followup_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, meta: ctx.meta });
  return f;
}

export async function completeFollowUp(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:write");
  const r = await db.whatsappFollowUp.updateMany({ where: { id, organizationId: ctx.organizationId, doneAt: null }, data: { doneAt: new Date() } });
  if (r.count !== 1) throw new NotFoundError("Lembrete não encontrado ou já concluído.");
}

export async function listFollowUps(ctx: TenantContext, opts: { conversationId?: string; mine?: boolean } = {}) {
  assertCan(ctx, "whatsapp:read");
  return db.whatsappFollowUp.findMany({
    where: { organizationId: ctx.organizationId, doneAt: null, ...(opts.conversationId ? { conversationId: opts.conversationId } : {}), ...(opts.mine ? { assigneeId: ctx.userId } : {}) },
    orderBy: { dueAt: "asc" },
    take: 100,
    select: { id: true, conversationId: true, dueAt: true, note: true, assigneeId: true, conversation: { select: { contactName: true, waId: true, client: { select: { name: true } } } } },
  });
}

/** Rotina agendada: avisa (uma vez) o responsável de cada follow-up vencido. Não envia nada ao cliente. */
export async function runFollowUpReminders(now = new Date()) {
  const due = await db.whatsappFollowUp.findMany({ where: { doneAt: null, notifiedAt: null, dueAt: { lte: now } }, take: 200, select: { id: true, organizationId: true, assigneeId: true, note: true, conversationId: true, conversation: { select: { contactName: true, client: { select: { name: true } } } } } });
  let notified = 0;
  for (const f of due) {
    const claimed = await db.whatsappFollowUp.updateMany({ where: { id: f.id, notifiedAt: null }, data: { notifiedAt: now } });
    if (claimed.count !== 1 || !f.assigneeId) continue;
    const who = f.conversation.client?.name ?? f.conversation.contactName ?? "um contato";
    notified += await notify({ organizationId: f.organizationId, userId: f.assigneeId, kind: "chat.followup", title: "Retorno combinado no WhatsApp", body: `${who}: ${f.note}`.slice(0, 300), link: `/atendimento?c=${f.conversationId}`, dedupeKey: `chat.followup:${f.id}` }).catch(() => 0);
  }
  return { due: due.length, notified };
}

// ======================= mensagens agendadas =======================

export async function scheduleMessage(ctx: TenantContext, conversationId: string, input: { text: string; sendAt: Date }) {
  assertCan(ctx, "whatsapp:write");
  const s = await getExtrasSettings(ctx);
  if (!s.scheduledEnabled) throw new ConflictError("As mensagens agendadas estão desligadas. Peça a quem administra o Chat para ligar a chave.");
  await conv(ctx, conversationId);
  const body = input.text.replace(/\r\n/g, "\n").trim();
  if (!body) throw new ValidationError("Escreva a mensagem.", { text: ["Escreva a mensagem."] });
  if (body.length > 4096) throw new ValidationError("Mensagem longa demais.", { text: ["Máximo de 4096 caracteres."] });
  const t = input.sendAt?.getTime?.();
  if (!t || Number.isNaN(t) || t < Date.now() + 60_000) throw new ValidationError("Escolha um horário a partir de 1 minuto no futuro.", { sendAt: ["Escolha um horário a partir de 1 minuto no futuro."] });
  if (t > Date.now() + 30 * 86_400_000) throw new ValidationError("O limite é de 30 dias.", { sendAt: ["O limite é de 30 dias."] });
  const pending = await db.whatsappScheduledMessage.count({ where: { conversationId, status: "PENDING" } });
  if (pending >= 10) throw new ConflictError("Já há 10 mensagens agendadas para esta conversa.");
  const m = await db.whatsappScheduledMessage.create({ data: { organizationId: ctx.organizationId, conversationId, body, sendAt: input.sendAt, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "whatsapp.scheduled_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, metadata: { sendAt: input.sendAt.toISOString() }, meta: ctx.meta });
  return m;
}

export async function cancelScheduled(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:write");
  const r = await db.whatsappScheduledMessage.updateMany({ where: { id, organizationId: ctx.organizationId, status: "PENDING" }, data: { status: "CANCELED", processedAt: new Date() } });
  if (r.count !== 1) throw new NotFoundError("Mensagem agendada não encontrada ou já processada.");
}

export async function listScheduled(ctx: TenantContext, conversationId?: string) {
  assertCan(ctx, "whatsapp:read");
  return db.whatsappScheduledMessage.findMany({
    where: { organizationId: ctx.organizationId, ...(conversationId ? { conversationId } : { status: "PENDING" }) },
    orderBy: { sendAt: conversationId ? "desc" : "asc" },
    take: 100,
    select: { id: true, conversationId: true, body: true, sendAt: true, status: true, error: true, createdById: true },
  });
}

/** Rotina agendada (a cada minuto): envia o que está no horário. Chave desligada = cancela com motivo (não envia). */
export async function runScheduledMessages(now = new Date()) {
  const out = { picked: 0, sent: 0, failed: 0, canceled: 0 };
  const due = await db.whatsappScheduledMessage.findMany({ where: { status: "PENDING", sendAt: { lte: now } }, orderBy: { sendAt: "asc" }, take: 100 });
  for (const m of due) {
    const claimed = await db.whatsappScheduledMessage.updateMany({ where: { id: m.id, status: "PENDING" }, data: { status: "SENDING" } });
    if (claimed.count !== 1) continue;
    out.picked++;
    const failedBefore = out.failed;
    const finish = (status: "SENT" | "FAILED" | "CANCELED", error: string | null) => db.whatsappScheduledMessage.update({ where: { id: m.id }, data: { status, error, processedAt: new Date() } });
    try {
      const s = await db.whatsappExtrasSettings.findUnique({ where: { organizationId: m.organizationId }, select: { scheduledEnabled: true } });
      if (!s?.scheduledEnabled) { await finish("CANCELED", "A chave de mensagens agendadas estava desligada no horário do envio."); out.canceled++; continue; }
      const r = await systemSendText(m.organizationId, m.conversationId, m.body);
      if (r.status === "SENT") {
        if (m.createdById) await db.whatsappMessage.update({ where: { id: r.id }, data: { authorId: m.createdById, automatic: false } }).catch(() => undefined);
        await finish("SENT", null);
        out.sent++;
      } else {
        await finish("FAILED", r.error ?? "O WhatsApp recusou o envio.");
        out.failed++;
      }
    } catch (e) {
      await finish("FAILED", (e instanceof Error ? e.message : "Falha ao enviar.").slice(0, 300)).catch(() => undefined);
      out.failed++;
      logger.warn("chat.scheduled_failed", { id: m.id, error: e instanceof Error ? e.message : String(e) });
    }
    if (m.createdById && out.failed > failedBefore) {
      await notify({ organizationId: m.organizationId, userId: m.createdById, kind: "chat.scheduled_failed", title: "Mensagem agendada não enviada", body: "Abra a conversa para ver o motivo.", link: `/atendimento?c=${m.conversationId}`, dedupeKey: `chat.scheduled_failed:${m.id}` }).catch(() => 0);
    }
  }
  return out;
}

// ======================= NPS =======================

export async function askSurvey(ctx: TenantContext, conversationId: string) {
  assertCan(ctx, "whatsapp:write");
  const s = await getExtrasSettings(ctx);
  if (!s.npsEnabled) throw new ConflictError("A pesquisa de satisfação está desligada. Peça a quem administra o Chat para ligar a chave.");
  await conv(ctx, conversationId);
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  await db.whatsappSurvey.updateMany({ where: { conversationId, status: "ASKED", askedAt: { lt: cutoff } }, data: { status: "EXPIRED" } });
  if (await db.whatsappSurvey.findFirst({ where: { conversationId, status: "ASKED" }, select: { id: true } })) throw new ConflictError("Já existe uma pesquisa aguardando resposta nesta conversa.");
  const sent = await sendMessage(ctx, conversationId, s.npsQuestion);
  if (sent.status !== "SENT") throw new ConflictError(sent.error ?? "O WhatsApp recusou o envio da pesquisa.");
  const row = await db.whatsappSurvey.create({ data: { organizationId: ctx.organizationId, conversationId, askedById: ctx.userId }, select: { id: true } });
  await audit({ action: "whatsapp.survey_ask", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, meta: ctx.meta });
  return row;
}

/** NPS automático ao encerrar: só com "Pesquisa de satisfação" E "Enviar ao encerrar" ligadas, e se a janela permitir texto. Uma pesquisa por conversa aberta. */
export async function autoSurveyOnClose(organizationId: string, conversationId: string, userId: string | null) {
  const s = await db.whatsappExtrasSettings.findUnique({ where: { organizationId }, select: { npsEnabled: true, npsAutoOnClose: true, npsQuestion: true } });
  if (!s?.npsEnabled || !s.npsAutoOnClose) return false;
  if (await db.whatsappSurvey.findFirst({ where: { conversationId, status: "ASKED", askedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, select: { id: true } })) return false;
  const r = await systemSendText(organizationId, conversationId, s.npsQuestion).catch(() => null);
  if (!r || r.status !== "SENT") return false;
  await db.whatsappSurvey.create({ data: { organizationId, conversationId, askedById: userId } });
  await audit({ action: "whatsapp.survey_auto", organizationId, userId, resourceType: "whatsapp_conversation", resourceId: conversationId });
  return true;
}

/** Chamada pelo recebimento: se há pesquisa aberta e o cliente respondeu só um número de 0 a 10, registra a nota. */
export async function recordSurveyAnswer(organizationId: string, conversationId: string, text: string | null, now = new Date()): Promise<boolean> {
  const m = /^\s*(10|[0-9])\s*[.!]?\s*$/.exec(text ?? "");
  if (!m) return false;
  const open = await db.whatsappSurvey.findFirst({ where: { organizationId, conversationId, status: "ASKED", askedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, select: { id: true } });
  if (!open) return false;
  const r = await db.whatsappSurvey.updateMany({ where: { id: open.id, status: "ASKED" }, data: { status: "ANSWERED", score: Number(m[1]), answeredAt: now } });
  return r.count === 1;
}

export async function npsReport(ctx: TenantContext, range: { from: Date; to: Date }) {
  assertCan(ctx, "whatsapp:manage");
  const rows = await db.whatsappSurvey.findMany({ where: { organizationId: ctx.organizationId, askedAt: { gte: range.from, lt: range.to } }, select: { status: true, score: true } });
  const answered = rows.filter((r) => r.status === "ANSWERED" && r.score !== null);
  const promoters = answered.filter((r) => r.score! >= 9).length;
  const passives = answered.filter((r) => r.score! >= 7 && r.score! <= 8).length;
  const detractors = answered.filter((r) => r.score! <= 6).length;
  const nps = answered.length ? Math.round(((promoters - detractors) / answered.length) * 100) : null;
  return { asked: rows.length, answered: answered.length, promoters, passives, detractors, nps, responseRate: rows.length ? Math.round((answered.length / rows.length) * 100) : null };
}

// ======================= formulários de atendimento =======================

export type FormInput = { name: string; fields: { fieldId: string; required: boolean }[] };

export async function listForms(ctx: TenantContext, onlyActive = false) {
  assertCan(ctx, "whatsapp:read");
  const rows = await db.whatsappForm.findMany({ where: { organizationId: ctx.organizationId, ...(onlyActive ? { active: true } : {}) }, orderBy: { name: "asc" }, include: { fields: { orderBy: { position: "asc" }, include: { field: { select: { name: true, kind: true } } } } } });
  return rows.map((f) => ({ id: f.id, name: f.name, active: f.active, fields: f.fields.map((x) => ({ fieldId: x.fieldId, name: x.field.name, kind: x.field.kind, required: x.required })) }));
}

export async function saveForm(ctx: TenantContext, id: string | null, input: FormInput & { active?: boolean }) {
  assertCan(ctx, "whatsapp:manage");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) throw new ValidationError("Informe um nome de 2 a 60 caracteres.", { name: ["Informe um nome de 2 a 60 caracteres."] });
  const ids = [...new Set(input.fields.map((f) => f.fieldId))];
  if (ids.length === 0) throw new ValidationError("Escolha ao menos um campo.", { fields: ["Escolha ao menos um campo."] });
  if (ids.length > 30) throw new ValidationError("No máximo 30 campos por formulário.", { fields: ["No máximo 30 campos por formulário."] });
  const valid = await db.whatsappField.count({ where: { organizationId: ctx.organizationId, id: { in: ids } } });
  if (valid !== ids.length) throw new ValidationError("Campo inválido.", { fields: ["Use apenas campos do escritório."] });
  const seen = new Set<string>();
  const rows = input.fields.filter((f) => (seen.has(f.fieldId) ? false : (seen.add(f.fieldId), true))).map((f, i) => ({ fieldId: f.fieldId, required: !!f.required, position: i }));
  const saved = await db.$transaction(async (tx) => {
    let formId = id;
    if (id) {
      const r = await tx.whatsappForm.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { name, ...(input.active === undefined ? {} : { active: input.active }) } });
      if (r.count !== 1) throw new NotFoundError("Formulário não encontrado.");
      await tx.whatsappFormField.deleteMany({ where: { formId: id } });
    } else {
      formId = (await tx.whatsappForm.create({ data: { organizationId: ctx.organizationId, name, createdById: ctx.userId }, select: { id: true } })).id;
    }
    await tx.whatsappFormField.createMany({ data: rows.map((r) => ({ ...r, formId: formId! })) });
    return formId!;
  });
  await audit({ action: id ? "whatsapp.form_update" : "whatsapp.form_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_form", resourceId: saved, meta: ctx.meta });
  return { id: saved };
}

export async function deleteForm(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappForm.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Formulário não encontrado.");
}

/** Situação do formulário numa conversa: o que já foi preenchido e o que falta (obrigatórios). */
export async function formStatus(ctx: TenantContext, conversationId: string, formId: string) {
  assertCan(ctx, "whatsapp:read");
  await conv(ctx, conversationId);
  const form = await db.whatsappForm.findFirst({ where: { id: formId, organizationId: ctx.organizationId }, include: { fields: { orderBy: { position: "asc" }, include: { field: { select: { id: true, name: true, kind: true, options: true, active: true } } } } } });
  if (!form) throw new NotFoundError("Formulário não encontrado.");
  const values = await db.whatsappFieldValue.findMany({ where: { conversationId, organizationId: ctx.organizationId }, select: { fieldId: true, value: true } });
  const map = new Map(values.map((v) => [v.fieldId, v.value]));
  const fields = form.fields.map((f) => ({ fieldId: f.fieldId, name: f.field.name, kind: f.field.kind, options: f.field.options, active: f.field.active, required: f.required, value: map.get(f.fieldId) ?? null, filled: map.has(f.fieldId) }));
  const required = fields.filter((f) => f.required);
  const missing = required.filter((f) => !f.filled).map((f) => f.name);
  return { id: form.id, name: form.name, fields, filled: fields.filter((f) => f.filled).length, total: fields.length, missingRequired: missing, complete: missing.length === 0 };
}

export { listFields };

/** Rotina do agendador (a cada minuto): mensagens agendadas, lembretes, arquivamento, diálogos do robô, campanhas e resumo por e-mail. Cada parte é isolada: uma falha não derruba as outras. */
export async function runChatExtras() {
  const out: Record<string, number> = {};
  const part = async (prefix: string, fn: () => Promise<unknown>) => {
    try {
      const r = await fn();
      if (r && typeof r === "object") for (const [k, v] of Object.entries(r)) { if (typeof v === "number") out[`${prefix}${k}`] = v; }
    } catch (e) {
      out[`${prefix}erro`] = 1;
      logger.error("chat.extras_part_failed", { part: prefix, error: e instanceof Error ? e.message : String(e) });
    }
  };
  const { runAutoArchive } = await import("./chat-tools.service");
  const { runDialogs } = await import("./chat-dialogs.service");
  const { runCampaigns } = await import("./chat-campaigns.service");
  const { runReportSchedules } = await import("./chat-report.service");
  const { runEmailInboxes } = await import("./chat-email.service");
  await part("email_", runEmailInboxes);
  await part("", runScheduledMessages);
  await part("", runFollowUpReminders);
  await part("arquivo_", () => runAutoArchive(new Date()));
  await part("dialogos_", () => runDialogs());
  await part("campanhas_", () => runCampaigns());
  await part("resumo_", () => runReportSchedules());
  return out;
}
