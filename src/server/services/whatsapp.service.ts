import { humanReplyLifecycle, setServiceStatus } from "./chat-lifecycle.service";
import { interactivePayload,interactiveSchema } from "@/lib/whatsapp/interactive";
import { sendInteractive } from "@/lib/whatsapp/client";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { assertChatContactAllowed } from "./chat-contact-control.service";
import { emitChatEvent } from "./chat-workbench.service";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { deleteObject, putObject } from "@/lib/storage/local-storage";
import { markAsRead, sendTemplate as apiSendTemplate, WhatsappApiError, type OutKind } from "@/lib/whatsapp/client";
import { isWindowOpen, MAX_TEXT, windowClosesAt } from "@/lib/whatsapp/constants";
import { normalizeWaId } from "@/lib/whatsapp/phone";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { isUniqueViolation } from "./db-errors";
import { loadAuth } from "./whatsapp-auth";
import { getTransport } from "./whatsapp-transport";
import { assertStorageAvailable } from "./plan.service";
import { sanitizeFileName } from "./document.service";

export type ConversationFilter = "mine" | "unassigned" | "open" | "closed";

const listSelect = {
  id: true, serviceStatus:true, waId: true, contactName: true, status: true, lastMessageAt: true, lastInboundAt: true, lastPreview: true, unreadCount: true, accountId: true, account: { select: { label: true, isPrimary: true } },
  client: { select: { id: true, name: true } }, case: { select: { id: true, number: true, title: true } }, lead: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } }, queue: { select: { id: true, name: true } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } }, orderBy: { label: { name: "asc" } } },
} satisfies Prisma.WhatsappConversationSelect;

export async function listConversations(ctx: TenantContext, filter: ConversationFilter = "open", search?: string, queueId?: string, labelId?: string, accountId?: string,serviceStatus?:string) {
  assertCan(ctx, "whatsapp:read");
  const where: Prisma.WhatsappConversationWhereInput = { organizationId: ctx.organizationId };
  if(serviceStatus)where.serviceStatus=serviceStatus;
  if (filter === "closed") where.status = "CLOSED";
  else where.status = "OPEN";
  if (filter === "mine") where.assignedToId = ctx.userId;
  if (filter === "unassigned") where.assignedToId = null;
  if (queueId) where.queueId = queueId;
  if (accountId) where.accountId = accountId;
  if (labelId) where.labels = { some: { labelId } };
  const q = search?.trim().slice(0, 80);
  if (q) {
    const digits = q.replace(/\D/g, "");
    where.OR = [{ contactName: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }, ...(digits.length >= 4 ? [{ waId: { contains: digits } }] : []), { fieldValues: { some: { value: { contains: q, mode: "insensitive" } } } }];
  }
  return db.whatsappConversation.findMany({ where, orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }], take: 200, select: listSelect });
}

export async function unreadTotal(ctx: TenantContext): Promise<number> {
  assertCan(ctx, "whatsapp:read");
  const r = await db.whatsappConversation.aggregate({ where: { organizationId: ctx.organizationId, status: "OPEN" }, _sum: { unreadCount: true } });
  return r._sum.unreadCount ?? 0;
}

async function loadConversation(ctx: TenantContext, id: string) {
  const c = await db.whatsappConversation.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { ...listSelect, accountId: true } });
  if (!c) throw new NotFoundError("Conversa não encontrada.");
  return c;
}

/** Abre a conversa: devolve as últimas 300 mensagens e zera o contador de não lidas (e avisa a Meta, em melhor esforço). */
export async function openConversation(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:read");
  const c = await loadConversation(ctx, id);
  const qr = (await providerOf(ctx.organizationId, c.accountId)) === "QR";
  const messages = await db.whatsappMessage.findMany({
    where: { conversationId: id, organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, direction: true, type: true, body: true, mediaMime: true, mediaName: true, mediaKey: true, status: true, error: true, automatic: true, createdAt: true, author: { select: { name: true } } },
  });
  messages.reverse();
  if (c.unreadCount > 0) {
    await db.whatsappConversation.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { unreadCount: 0 } });
    void markLastInboundRead(ctx.organizationId, id);
  }
  return {
    conversation: { ...c, unreadCount: 0, windowOpen: qr || isWindowOpen(c.lastInboundAt), windowClosesAt: qr ? null : windowClosesAt(c.lastInboundAt) },
    messages: messages.map(({ mediaKey, ...m }) => ({ ...m, hasMedia: !!mediaKey })),
  };
}

async function markLastInboundRead(organizationId: string, conversationId: string) {
  try {
    const last = await db.whatsappMessage.findFirst({ where: { conversationId, organizationId, direction: "IN", waMessageId: { not: null } }, orderBy: { createdAt: "desc" }, select: { waMessageId: true } });
    if (!last?.waMessageId || last.waMessageId.startsWith("qr:")) return;
    const { auth, cfg } = await loadAuth(organizationId);
    await markAsRead(cfg, auth, last.waMessageId);
  } catch {
    /* melhor esforço: não atrapalha a leitura */
  }
}

const preview = (body: string | null, type: string) => (body ? body.replace(/\s+/g, " ").slice(0, 120) : `[${type}]`);

async function touch(conversationId: string, text: string | null, type: string, at: Date) {
  await db.whatsappConversation.update({ where: { id: conversationId }, data: { lastMessageAt: at, lastPreview: preview(text, type) } });
}

function cleanText(raw: string): string {
  const body = raw.replace(/\r\n/g, "\n").trim();
  if (!body) throw new ValidationError("Escreva a mensagem.", { body: ["Escreva a mensagem."] });
  if (body.length > MAX_TEXT) throw new ValidationError("Mensagem longa demais.", { body: [`Máximo de ${MAX_TEXT} caracteres.`] });
  return body;
}

/** Na API oficial vale a janela de 24 horas; na conexão por QR-Code não existe esse limite. */
function assertWindow(provider: "META" | "QR", lastInboundAt: Date | null) {
  if (provider === "QR") return;
  if (!isWindowOpen(lastInboundAt)) throw new ConflictError("Passaram mais de 24 horas desde a última mensagem do cliente. Pelas regras do WhatsApp, agora só é possível enviar um modelo aprovado.");
}

async function providerOf(organizationId: string, accountId?: string): Promise<"META" | "QR"> {
  const a = await db.whatsappAccount.findFirst({ where: accountId ? { id: accountId, organizationId } : { organizationId, isPrimary: true }, select: { provider: true } });
  if (!a) throw new ConflictError("O WhatsApp ainda não foi conectado neste escritório.");
  return a.provider === "QR" ? "QR" : "META";
}

/** Grava a mensagem enviada. Na conexão por QR o WhatsApp devolve um "eco" que pode chegar antes; nesse caso completa a linha já criada. */
async function saveOut(data: Prisma.WhatsappMessageUncheckedCreateInput) {
  let m;
  try {
    m = await db.whatsappMessage.create({ data });
  } catch (e) {
    if (!isUniqueViolation(e) || !data.waMessageId) throw e;
    const ex = await db.whatsappMessage.findFirst({ where: { waMessageId: data.waMessageId, organizationId: data.organizationId }, select: { id: true } });
    if (!ex) throw e;
    m = await db.whatsappMessage.update({ where: { id: ex.id }, data: { authorId: data.authorId, body: data.body, mediaKey: data.mediaKey, mediaMime: data.mediaMime, mediaName: data.mediaName, mediaSize: data.mediaSize, status: data.status, error: data.error } });
  }
  await emitChatEvent(data.organizationId,"chat.message.sent",{conversationId:data.conversationId,messageId:m.id,status:m.status}).catch(()=>0);
  return m;
}

type Delivery = { waMessageId: string | null; status: "SENT" | "FAILED"; error: string | null };

async function deliver(run: () => Promise<string>): Promise<Delivery> {
  try {
    return { waMessageId: await run(), status: "SENT", error: null };
  } catch (e) {
    if (e instanceof WhatsappApiError) return { waMessageId: null, status: "FAILED", error: e.message };
    throw e;
  }
}

/** Mensagem de texto. A mensagem fica salva mesmo se a Meta recusar (status FALHOU, com o motivo), para o atendente ver e reenviar. */
export async function sendMessage(ctx: TenantContext, conversationId: string, text: string) {
  assertCan(ctx, "whatsapp:write");
  const body = cleanText(text);
  const c = await loadConversation(ctx, conversationId);
  await assertChatContactAllowed(ctx.organizationId,c.accountId,c.waId);
  assertWindow(await providerOf(ctx.organizationId, c.accountId), c.lastInboundAt);
  const tr = await getTransport(ctx.organizationId, c.accountId);
  const d = await deliver(() => tr.sendText(c.waId, body));
  const m = await saveOut({ organizationId: ctx.organizationId, conversationId, direction: "OUT", type: "text", body, status: d.status, error: d.error, waMessageId: d.waMessageId, authorId: ctx.userId });
  await touch(conversationId, body, "text", m.createdAt);
  if(d.status==="SENT")await humanReplyLifecycle(ctx.organizationId,conversationId);
  return { id: m.id, status: d.status, error: d.error };
}

/** Uses the official interactive format on Meta and an explicit numbered fallback on QR. */
export async function systemSendInteractive(organizationId:string,conversationId:string,raw:unknown,authorId?:string) {
  const d=interactiveSchema.parse(raw);
  const c=await db.whatsappConversation.findFirst({where:{id:conversationId,organizationId}});
  if(!c)throw new NotFoundError("Conversa não encontrada.");
  await assertChatContactAllowed(organizationId,c.accountId,c.waId);
  if(await providerOf(organizationId,c.accountId)==="QR") {
    const body=`${d.body}\n\n${d.options.map(o=>`${o.id.replace("legalos:triage:","")} - ${o.title}`).join("\n")}`;
    const r=await systemSendText(organizationId,conversationId,body);
    if(authorId) {
      await db.whatsappMessage.update({where:{id:r.id},data:{authorId,automatic:false}});
      if(r.status==="SENT")await humanReplyLifecycle(organizationId,conversationId);
    }
    return r;
  }
  assertWindow("META",c.lastInboundAt);
  const {auth,cfg}=await loadAuth(organizationId,c.accountId);
  const result=await deliver(()=>sendInteractive(cfg,auth,c.waId,interactivePayload(d)));
  const body=`${d.body}\n${d.options.map(o=>o.title).join(" · ")}`;
  const m=await saveOut({organizationId,conversationId,direction:"OUT",type:"interactive",body,status:result.status,error:result.error,waMessageId:result.waMessageId,automatic:!authorId,authorId});
  await touch(conversationId,body,"interactive",m.createdAt);
  if(authorId&&result.status==="SENT")await humanReplyLifecycle(organizationId,conversationId);
  return {id:m.id,status:result.status,error:result.error};
}

const FILE_RULES: { test: (mime: string) => boolean; kind: OutKind; max: number }[] = [
  { test: (m) => m === "image/jpeg" || m === "image/png", kind: "image", max: 5 * 1024 * 1024 },
  { test: (m) => m === "video/mp4" || m === "video/3gpp", kind: "video", max: 16 * 1024 * 1024 },
  { test: (m) => ["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"].includes(m), kind: "audio", max: 16 * 1024 * 1024 },
];
const DOC_MIMES: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain" };
const IMG_MIMES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", mp3: "audio/mpeg", ogg: "audio/ogg", aac: "audio/aac", amr: "audio/amr" };

function sniffOk(mime: string, b: Buffer): boolean {
  if (mime === "application/pdf") return b.subarray(0, 5).toString("latin1") === "%PDF-";
  if (mime === "image/png") return b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8;
  return true;
}

/** Envia um arquivo. O tipo é decidido pela EXTENSÃO e conferido pelo conteúdo; só formatos aceitos pelo WhatsApp. */
export async function sendFile(ctx: TenantContext, conversationId: string, file: { name: string; buffer: Buffer }, caption?: string | null) {
  assertCan(ctx, "whatsapp:write");
  const c = await loadConversation(ctx, conversationId);
  await assertChatContactAllowed(ctx.organizationId,c.accountId,c.waId);
  assertWindow(await providerOf(ctx.organizationId, c.accountId), c.lastInboundAt);
  const name = sanitizeFileName(file.name);
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const mime = IMG_MIMES[ext] ?? DOC_MIMES[ext];
  if (!mime) throw new ValidationError("Tipo de arquivo não aceito pelo WhatsApp.", { file: ["Aceitos: PDF, Word, Excel, PowerPoint, TXT, JPG, PNG, MP4, MP3, OGG, AAC, AMR."] });
  if (file.buffer.length === 0) throw new ValidationError("O arquivo está vazio.", { file: ["O arquivo está vazio."] });
  if (!sniffOk(mime, file.buffer)) throw new ValidationError("O conteúdo do arquivo não corresponde à extensão.", { file: ["O conteúdo não corresponde ao formato."] });
  const rule = FILE_RULES.find((r) => r.test(mime));
  const kind: OutKind = rule?.kind ?? "document";
  const max = rule?.max ?? 16 * 1024 * 1024;
  if (file.buffer.length > max) throw new ValidationError("Arquivo grande demais para este tipo no WhatsApp.", { file: [`Limite de ${Math.round(max / 1024 / 1024)} MB para este tipo.`] });
  const cap = caption?.trim() ? cleanText(caption) : null;
  await assertStorageAvailable(ctx.organizationId, file.buffer.length);
  const tr = await getTransport(ctx.organizationId, c.accountId);
  const key = `${ctx.organizationId}/${randomUUID()}`;
  await putObject(key, file.buffer);
  try {
    const d = await deliver(() => tr.sendFile(c.waId, { kind, buffer: file.buffer, mime, name, caption: cap }));
    const m = await saveOut({ organizationId: ctx.organizationId, conversationId, direction: "OUT", type: kind, body: cap, mediaKey: key, mediaMime: mime, mediaName: name, mediaSize: file.buffer.length, status: d.status, error: d.error, waMessageId: d.waMessageId, authorId: ctx.userId });
    await touch(conversationId, cap, name, m.createdAt);
  if(d.status==="SENT")await humanReplyLifecycle(ctx.organizationId,conversationId);
    return { id: m.id, status: d.status, error: d.error };
  } catch (e) {
    await deleteObject(key);
    throw e;
  }
}

function fillTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "");
}

/** Modelo aprovado: único jeito de falar com o cliente fora da janela de 24 horas. */
export async function sendTemplateMessage(ctx: TenantContext, conversationId: string, templateId: string, rawParams: string[]) {
  assertCan(ctx, "whatsapp:write");
  const c = await loadConversation(ctx, conversationId);
  await assertChatContactAllowed(ctx.organizationId,c.accountId,c.waId);
  if ((await providerOf(ctx.organizationId, c.accountId)) === "QR") throw new ConflictError("Modelos de mensagem existem só na conexão oficial da Meta. Na conexão por QR-Code, escreva a mensagem normalmente.");
  const t = await db.whatsappTemplate.findFirst({ where: { id: templateId, organizationId: ctx.organizationId } });
  if (!t) throw new NotFoundError("Modelo não encontrado.");
  if (t.status !== "APPROVED") throw new ConflictError("Este modelo não está aprovado pela Meta.");
  const params = rawParams.map((p) => p.replace(/\s+/g, " ").trim());
  if (params.length !== t.variableCount || params.some((p) => !p || p.length > 500)) throw new ValidationError("Preencha todas as variáveis do modelo.", { params: [`Este modelo usa ${t.variableCount} variável(is), de até 500 caracteres cada.`] });
  const { auth, cfg } = await loadAuth(ctx.organizationId, c.accountId);
  const d = await deliver(() => apiSendTemplate(cfg, auth, c.waId, { name: t.name, language: t.language, params }));
  const text = fillTemplate(t.body, params);
  const m = await db.whatsappMessage.create({ data: { organizationId: ctx.organizationId, conversationId, direction: "OUT", type: "template", body: text, status: d.status, error: d.error, waMessageId: d.waMessageId, authorId: ctx.userId } });
  await touch(conversationId, text, "template", m.createdAt);
  if(d.status==="SENT")await humanReplyLifecycle(ctx.organizationId,conversationId);
  return { id: m.id, status: d.status, error: d.error };
}

export async function addNote(ctx: TenantContext, conversationId: string, text: string) {
  assertCan(ctx, "whatsapp:write");
  const body = cleanText(text);
  await loadConversation(ctx, conversationId);
  const m = await db.whatsappMessage.create({ data: { organizationId: ctx.organizationId, conversationId, direction: "NOTE", type: "text", body, status: "NOTE", authorId: ctx.userId } });
  const { notifyMentions } = await import("./chat-tools.service"); // menção a colega (@nome): só avisa dentro do sistema
  await notifyMentions(ctx, conversationId, body);
  return { id: m.id };
}

export async function assignConversation(ctx: TenantContext, conversationId: string, userId: string | null) {
  assertCan(ctx, "whatsapp:write");
  await loadConversation(ctx, conversationId);
  if (userId) {
    const m = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId, status: "ACTIVE", user: { disabledAt: null } }, select: { role: { select: { permissions: true } } } });
    if (!m || !m.role.permissions.includes("whatsapp:read")) throw new ValidationError("Essa pessoa não tem acesso ao atendimento por WhatsApp.", { userId: ["Escolha alguém com acesso ao WhatsApp."] });
  }
  await db.whatsappConversation.update({ where: { id: conversationId }, data: { assignedToId: userId, assignedAt: userId ? new Date() : null } });
  await audit({ action: "whatsapp.assign", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, metadata: { assignedTo: userId }, meta: ctx.meta });
}

export async function setConversationStatus(ctx: TenantContext, conversationId: string, status: "OPEN" | "CLOSED") {
  assertCan(ctx, "whatsapp:write");
  await loadConversation(ctx, conversationId);
  await setServiceStatus(ctx,conversationId,status);
}

export async function linkClient(ctx: TenantContext, conversationId: string, clientId: string | null) {
  assertCan(ctx, "whatsapp:write");
  await loadConversation(ctx, conversationId);
  if (clientId) {
    assertCan(ctx, "clients:read");
    const cl = await db.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
    if (!cl) throw new NotFoundError("Cliente não encontrado.");
  }
  await db.whatsappConversation.update({ where: { id: conversationId }, data: { clientId } });
  await audit({ action: "whatsapp.link_client", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, metadata: { clientId }, meta: ctx.meta });
}

/** Clientes cujo telefone contém os dígitos informados — para vincular manualmente. */
export async function searchClientsForLink(ctx: TenantContext, q: string) {
  assertCan(ctx, "whatsapp:write");
  assertCan(ctx, "clients:read");
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  return db.client.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null, OR: [{ name: { contains: term, mode: "insensitive" } }, { document: { contains: term.replace(/\D/g, "") || "\u0000" } }] }, orderBy: { name: "asc" }, take: 8, select: { id: true, name: true } });
}

/** Inicia uma conversa para falar com um cliente que ainda não escreveu: só é possível por modelo aprovado. */
export async function startConversation(ctx: TenantContext, input: { phone: string; clientId?: string | null; accountId?: string | null }) {
  assertCan(ctx, "whatsapp:write");
  const waId = normalizeWaId(input.phone);
  if (!waId) throw new ValidationError("Telefone inválido.", { phone: ["Informe DDD e número (ex.: 71 99999-8888)."] });
  const { account } = await loadAuth(ctx.organizationId, input.accountId ?? undefined);
  let clientId: string | null = null;
  if (input.clientId) {
    const cl = await db.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true } });
    if (!cl) throw new NotFoundError("Cliente não encontrado.");
    clientId = cl.id;
  }
  const c = await db.whatsappConversation.upsert({
    where: { accountId_waId: { accountId: account.id, waId } },
    create: { organizationId: ctx.organizationId, accountId: account.id, waId, clientId, assignedToId: ctx.userId, status: "OPEN" },
    update: { status: "OPEN", ...(clientId ? { clientId } : {}) },
    select: { id: true },
  });
  return c;
}

/** Arquivo de uma mensagem, para a rota autenticada de download. */
export async function getMessageMedia(ctx: TenantContext, messageId: string) {
  assertCan(ctx, "whatsapp:read");
  const m = await db.whatsappMessage.findFirst({ where: { id: messageId, organizationId: ctx.organizationId, mediaKey: { not: null } }, select: { mediaKey: true, mediaMime: true, mediaName: true, mediaSize: true } });
  if (!m?.mediaKey) throw new NotFoundError("Arquivo não encontrado.");
  return { key: m.mediaKey, mime: m.mediaMime ?? "application/octet-stream", name: m.mediaName ?? "arquivo", size: m.mediaSize };
}

export async function teamForAssignment(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:read");
  const rows = await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", user: { disabledAt: null }, role: { permissions: { has: "whatsapp:read" } } }, select: { user: { select: { id: true, name: true } } }, take: 200 });
  return rows.map((r) => r.user).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// ---------------- envio feito pelo sistema (sem usuário), ex.: cobrança ----------------

/** Janela de 24 h aberta? Na conexão por QR-Code não existe janela. */
export async function windowAllowsText(organizationId: string, conversationId: string): Promise<boolean> {
  const c = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId }, select: { lastInboundAt: true, accountId: true } });
  if (!c) throw new NotFoundError("Conversa não encontrada.");
  return (await providerOf(organizationId, c.accountId)) === "QR" || isWindowOpen(c.lastInboundAt);
}

async function afterSystemSend(conversationId: string, text: string, type: string, at: Date) {
  // Não reabre nem muda de responsável: conversa encerrada continua encerrada até o cliente responder.
  await db.whatsappConversation.update({ where: { id: conversationId }, data: { lastMessageAt: at, lastPreview: preview(text, type) } });
}

/** Texto enviado pelo sistema (marcado como automático). Respeita a janela de 24 h da Meta. */
export async function systemSendText(organizationId: string, conversationId: string, text: string) {
  const c = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId }, select: { waId: true, lastInboundAt: true, accountId: true } });
  if (!c) throw new NotFoundError("Conversa não encontrada.");
  assertWindow(await providerOf(organizationId, c.accountId), c.lastInboundAt);
  await assertChatContactAllowed(organizationId,c.accountId,c.waId);
  const body = text.trim().slice(0, MAX_TEXT);
  const tr = await getTransport(organizationId, c.accountId);
  const d = await deliver(() => tr.sendText(c.waId, body));
  const m = await saveOut({ organizationId, conversationId, direction: "OUT", type: "text", body, status: d.status, error: d.error, waMessageId: d.waMessageId, automatic: true });
  await afterSystemSend(conversationId, body, "text", m.createdAt);
  return { id: m.id, status: d.status, error: d.error };
}

/** Modelo aprovado enviado pelo sistema (único jeito de iniciar conversa fora da janela, na API oficial). */
export async function systemSendTemplate(organizationId: string, conversationId: string, templateId: string, rawParams: string[]) {
  const c = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId }, select: { waId: true, accountId: true } });
  if (!c) throw new NotFoundError("Conversa não encontrada.");
  await assertChatContactAllowed(organizationId,c.accountId,c.waId);
  if ((await providerOf(organizationId, c.accountId)) === "QR") throw new ConflictError("Modelos existem só na conexão oficial da Meta.");
  const t = await db.whatsappTemplate.findFirst({ where: { id: templateId, organizationId } });
  if (!t || t.status !== "APPROVED") throw new ConflictError("Modelo inexistente ou não aprovado pela Meta.");
  const params = rawParams.slice(0, t.variableCount).map((p) => p.replace(/\s+/g, " ").trim().slice(0, 500) || "-");
  if (params.length !== t.variableCount) throw new ValidationError("O modelo usa mais variáveis do que o sistema oferece.", { template: [`Este modelo usa ${t.variableCount} variável(is); a cobrança oferece até 5.`] });
  const { auth, cfg } = await loadAuth(organizationId, c.accountId);
  const d = await deliver(() => apiSendTemplate(cfg, auth, c.waId, { name: t.name, language: t.language, params }));
  const text = fillTemplate(t.body, params);
  const m = await saveOut({ organizationId, conversationId, direction: "OUT", type: "template", body: text, status: d.status, error: d.error, waMessageId: d.waMessageId, automatic: true });
  await afterSystemSend(conversationId, text, "template", m.createdAt);
  return { id: m.id, status: d.status, error: d.error };
}
