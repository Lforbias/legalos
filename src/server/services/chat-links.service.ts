import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError } from "@/lib/permissions/check";
import { getObjectStream } from "@/lib/storage/local-storage";
import { formatWaId } from "@/lib/whatsapp/phone";
import { EMPTY_EVENT, type EventInput } from "@/modules/agenda/schemas";
import { EMPTY_LEAD } from "@/modules/crm/schemas";
import { EMPTY_TASK } from "@/modules/tasks/schemas";
import { assertCan, can, type TenantContext } from "@/server/context";
import { createEvent } from "./agenda.service";
import { audit } from "./audit.service";
import { assertCaseVisible, caseVisibility, logCaseEvent } from "./case.service";
import { createLead } from "./crm.service";
import { createDeadline } from "./deadline.service";
import { uploadDocument } from "./document.service";
import { createTask } from "./task.service";

/**
 * LegalOS Chat ↔ resto do sistema: a conversa se liga a cliente, processo e lead, e dela nascem tarefas, compromissos, prazos, leads e documentos.
 * Cada ação respeita a permissão do módulo de destino e deixa uma nota interna na conversa (e, havendo processo, um evento na linha do tempo dele).
 */

async function loadConv(ctx: TenantContext, id: string) {
  const c = await db.whatsappConversation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, waId: true, contactName: true, clientId: true, caseId: true, leadId: true, client: { select: { id: true, name: true } } },
  });
  if (!c) throw new NotFoundError("Conversa não encontrada.");
  return c;
}

const nameOf = (c: { contactName: string | null; client: { name: string } | null; waId: string }) => c.client?.name ?? c.contactName ?? formatWaId(c.waId);

async function note(ctx: TenantContext, conversationId: string, body: string) {
  await db.whatsappMessage.create({ data: { organizationId: ctx.organizationId, conversationId, direction: "NOTE", type: "text", body: body.slice(0, 4000), status: "NOTE", authorId: ctx.userId } });
}

async function quoted(ctx: TenantContext, conversationId: string, messageId?: string | null): Promise<string> {
  if (!messageId) return "";
  const m = await db.whatsappMessage.findFirst({ where: { id: messageId, conversationId, organizationId: ctx.organizationId, direction: { not: "NOTE" } }, select: { body: true, type: true, createdAt: true, direction: true } });
  if (!m) throw new NotFoundError("Mensagem não encontrada.");
  const when = m.createdAt.toLocaleString("pt-BR", { timeZone: ctx.timezone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return `\n\nMensagem ${m.direction === "IN" ? "do cliente" : "do escritório"} (WhatsApp, ${when}): «${(m.body ?? `[${m.type}]`).replace(/\s+/g, " ").slice(0, 600)}»`;
}

const origin = (conversationId: string) => `\n\nOrigem: conversa de WhatsApp (/atendimento?c=${conversationId}).`;

// ---------------- vínculos ----------------

export type CaseOption = { id: string; number: string | null; title: string };

/** Processos para vincular: os do cliente da conversa e os que casam com a busca (número ou título), só os visíveis ao usuário. */
export async function caseOptions(ctx: TenantContext, conversationId: string, q = ""): Promise<CaseOption[]> {
  assertCan(ctx, "whatsapp:write");
  assertCan(ctx, "cases:read");
  const c = await loadConv(ctx, conversationId);
  const term = q.trim().slice(0, 80);
  const or: object[] = [];
  if (c.clientId) or.push({ parties: { some: { clientId: c.clientId } } });
  if (term) or.push({ number: { contains: term, mode: "insensitive" } }, { title: { contains: term, mode: "insensitive" } });
  if (or.length === 0) return [];
  return db.case.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx), { OR: or }] },
    orderBy: { updatedAt: "desc" },
    take: 15,
    select: { id: true, number: true, title: true },
  });
}

export async function linkCase(ctx: TenantContext, conversationId: string, caseId: string | null) {
  assertCan(ctx, "whatsapp:write");
  const c = await loadConv(ctx, conversationId);
  if (!caseId) {
    await db.whatsappConversation.update({ where: { id: conversationId }, data: { caseId: null } });
    await audit({ action: "whatsapp.link_case", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, metadata: { caseId: null }, meta: ctx.meta });
    return;
  }
  assertCan(ctx, "cases:read");
  const found = await assertCaseVisible(ctx, caseId);
  // Se a conversa ainda não tem cliente e o processo tem exatamente um cliente cadastrado como parte, liga o cliente também.
  let clientId = c.clientId;
  if (!clientId) {
    const parties = await db.caseParty.findMany({ where: { caseId, clientId: { not: null } }, select: { clientId: true }, take: 2 });
    if (parties.length === 1) clientId = parties[0]!.clientId;
  }
  await db.$transaction(async (tx) => {
    await tx.whatsappConversation.update({ where: { id: conversationId }, data: { caseId, ...(clientId && !c.clientId ? { clientId } : {}) } });
    await logCaseEvent(tx, ctx, caseId, { kind: "WHATSAPP", title: `Conversa de WhatsApp vinculada: ${nameOf(c)}` });
    await audit({ action: "whatsapp.link_case", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, metadata: { caseId }, meta: ctx.meta }, tx);
  });
  await note(ctx, conversationId, `Conversa vinculada ao processo ${found.number ?? found.title}.`);
}

// ---------------- criar a partir da conversa ----------------

export type TaskFromChat = { title: string; description?: string; dueDate?: string; priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT"; assigneeId?: string; messageId?: string | null };

export async function createTaskFromConversation(ctx: TenantContext, conversationId: string, i: TaskFromChat) {
  assertCan(ctx, "whatsapp:write");
  assertCan(ctx, "tasks:write");
  const c = await loadConv(ctx, conversationId);
  const description = `${(i.description ?? "").trim()}${await quoted(ctx, conversationId, i.messageId)}${origin(conversationId)}`.trim().slice(0, 4000);
  const t = await createTask(ctx, { ...EMPTY_TASK, title: i.title, description, dueDate: i.dueDate ?? "", priority: i.priority ?? "NORMAL", assigneeId: i.assigneeId ?? ctx.userId, clientId: c.clientId ?? "", caseId: c.caseId ?? "" });
  await note(ctx, conversationId, `Tarefa criada: “${t.title}”${t.dueDate ? ` (vence ${t.dueDate.toISOString().slice(0, 10).split("-").reverse().join("/")})` : ""}. Veja em Tarefas.`);
  return { id: t.id };
}

export type EventFromChat = Partial<Pick<EventInput, "kind" | "allDay" | "startTime" | "endTime" | "location" | "description">> & { title: string; date: string; messageId?: string | null };

export async function createEventFromConversation(ctx: TenantContext, conversationId: string, i: EventFromChat) {
  assertCan(ctx, "whatsapp:write");
  if (!can(ctx, "deadlines:write") && !can(ctx, "tasks:write")) assertCan(ctx, "deadlines:write");
  const c = await loadConv(ctx, conversationId);
  const description = `${(i.description ?? "").trim()}${await quoted(ctx, conversationId, i.messageId)}${origin(conversationId)}`.trim().slice(0, 2000);
  const e = await createEvent(ctx, { ...EMPTY_EVENT, ...i, description, location: i.location ?? "", clientId: c.clientId ?? "", caseId: c.caseId ?? "" });
  await note(ctx, conversationId, `Compromisso marcado na Agenda: “${e.title}” em ${i.date.split("-").reverse().join("/")}${i.allDay ? "" : ` às ${i.startTime ?? EMPTY_EVENT.startTime}`}.`);
  return { id: e.id };
}

/** Prazo nasce RASCUNHO e exige validação humana (regra do sistema). Precisa de processo. */
export async function createDeadlineFromConversation(ctx: TenantContext, conversationId: string, i: { title: string; dueDate: string; notes?: string; messageId?: string | null }) {
  assertCan(ctx, "whatsapp:write");
  assertCan(ctx, "deadlines:write");
  const c = await loadConv(ctx, conversationId);
  if (!c.caseId) throw new ConflictError("Vincule a conversa a um processo antes de criar o prazo.");
  const notes = `${(i.notes ?? "").trim()}${await quoted(ctx, conversationId, i.messageId)}${origin(conversationId)}`.trim().slice(0, 2000);
  const d = await createDeadline(ctx, { caseId: c.caseId, title: i.title, kind: "", startDate: "", days: "", countType: "", dueDate: i.dueDate, internalDueDate: "", responsibleId: ctx.userId, notes, calculationNote: "" });
  await note(ctx, conversationId, `Prazo cadastrado (aguardando validação): “${d.title}”, data fatal ${i.dueDate.split("-").reverse().join("/")}. Valide em Prazos.`);
  return { id: d.id };
}

/** Quem ainda não é cliente vira lead no CRM, já com a origem WhatsApp, e a conversa fica ligada a ele. */
export async function createLeadFromConversation(ctx: TenantContext, conversationId: string, i: { interest?: string; name?: string } = {}) {
  assertCan(ctx, "whatsapp:write");
  assertCan(ctx, "crm:write");
  const c = await loadConv(ctx, conversationId);
  if (c.clientId) throw new ConflictError("Esta pessoa já é cliente.");
  if (c.leadId) throw new ConflictError("Esta conversa já está ligada a um lead.");
  const name = (i.name ?? c.contactName ?? "").trim() || `Contato ${formatWaId(c.waId)}`;
  const phone = c.waId.startsWith("lid:") ? "" : c.waId;
  const lead = await createLead(ctx, { ...EMPTY_LEAD, name: name.slice(0, 160).padEnd(2, " "), phone, source: "WhatsApp", interest: (i.interest ?? "").slice(0, 120), notes: `Veio pelo WhatsApp (conversa /atendimento?c=${conversationId}).` });
  await db.whatsappConversation.update({ where: { id: conversationId }, data: { leadId: lead.id } });
  await audit({ action: "whatsapp.create_lead", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, metadata: { leadId: lead.id }, meta: ctx.meta });
  await note(ctx, conversationId, `Lead criado no CRM: ${lead.name}. Acompanhe em CRM comercial.`);
  return { id: lead.id };
}

/** Guarda o arquivo recebido na conversa nos documentos do processo (ou do cliente). */
export async function attachMessageToDocuments(ctx: TenantContext, messageId: string, target: "case" | "client") {
  assertCan(ctx, "whatsapp:write");
  assertCan(ctx, "documents:write");
  const m = await db.whatsappMessage.findFirst({
    where: { id: messageId, organizationId: ctx.organizationId, mediaKey: { not: null } },
    select: { id: true, conversationId: true, mediaKey: true, mediaName: true, mediaMime: true, type: true, createdAt: true },
  });
  if (!m?.mediaKey) throw new NotFoundError("Arquivo não encontrado.");
  const c = await loadConv(ctx, m.conversationId);
  const owner = target === "case" ? { caseId: c.caseId } : { clientId: c.clientId };
  if (!owner.caseId && !owner.clientId) throw new ConflictError(target === "case" ? "Vincule a conversa a um processo primeiro." : "Vincule a conversa a um cliente primeiro.");
  const chunks: Uint8Array[] = [];
  const reader = (await getObjectStream(m.mediaKey)).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const ext = (m.mediaMime ?? "").split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") ?? "";
  const name = m.mediaName ?? `whatsapp-${m.createdAt.toISOString().slice(0, 10)}${ext ? `.${ext}` : ""}`;
  const when = m.createdAt.toLocaleString("pt-BR", { timeZone: ctx.timezone });
  const doc = await uploadDocument(ctx, owner, { name, buffer: Buffer.concat(chunks) }, { description: `Recebido por WhatsApp em ${when}.` });
  await note(ctx, m.conversationId, `Arquivo “${doc.name}” guardado em Documentos (${target === "case" ? "processo" : "cliente"}).`);
  return { id: doc.id };
}

// ---------------- o outro lado: conversas na ficha ----------------

const rowSelect = { id: true, waId: true, contactName: true, status: true, lastMessageAt: true, lastPreview: true, unreadCount: true, assignedTo: { select: { name: true } } } as const;

export async function conversationsOfClient(ctx: TenantContext, clientId: string) {
  if (!can(ctx, "whatsapp:read")) return [];
  return db.whatsappConversation.findMany({ where: { organizationId: ctx.organizationId, clientId }, orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } }, take: 10, select: rowSelect });
}

export async function conversationsOfCase(ctx: TenantContext, caseId: string) {
  if (!can(ctx, "whatsapp:read")) return [];
  await assertCaseVisible(ctx, caseId);
  return db.whatsappConversation.findMany({ where: { organizationId: ctx.organizationId, caseId }, orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } }, take: 10, select: rowSelect });
}

export async function conversationsOfLead(ctx: TenantContext, leadId: string) {
  if (!can(ctx, "whatsapp:read")) return [];
  return db.whatsappConversation.findMany({ where: { organizationId: ctx.organizationId, leadId }, orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } }, take: 10, select: rowSelect });
}
