import { createHash, randomUUID } from "node:crypto";
import type { CoworkMessage, CoworkResourceKind, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { limiters } from "@/lib/security/rate-limit";
import { deleteObject, putObject } from "@/lib/storage/local-storage";
import { can, type TenantContext } from "@/server/context";
import { appendMessageTx } from "@/server/cowork/core";
import { publishInTx } from "@/server/cowork/realtime";
import { ATTACHMENTS_PER_MESSAGE, ATTACHMENTS_TOTAL_MAX_BYTES, EDIT_WINDOW_MS, MESSAGE_MAX_LENGTH, MESSAGE_PAGE_SIZE, RESOURCE_KINDS, type ResourceKind } from "@/modules/cowork/constants";
import { audit } from "./audit.service";
import { assertCoworkAccess, displayNames } from "./cowork-access.service";
import { assertCoworkCaseVisible } from "./cowork-access.service";
import { isChannelManager, loadChannelForMember } from "./cowork-channel.service";
import { assertCanShare, resolveCards, type ResourceCard } from "./cowork-resource.service";
import { classifyFile } from "./document.service";
import { isUniqueViolation } from "./db-errors";
import { notify, type NotifyInput } from "./notification.service";
import { assertStorageAvailable } from "./plan.service";

export const sendMessageSchema = z.object({
  body: z.string().max(MESSAGE_MAX_LENGTH, `Mensagem muito longa (máx. ${MESSAGE_MAX_LENGTH} caracteres).`).default(""),
  clientNonce: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Identificador de envio inválido."),
  parentId: z.uuid().nullable().optional(),
  mentionedIds: z.array(z.uuid()).max(50).optional().default([]),
  resources: z.array(z.object({ kind: z.enum(RESOURCE_KINDS), resourceId: z.uuid() })).max(10).optional().default([]),
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export type CoworkMessageDTO = {
  id: string;
  seq: number;
  channelId: string;
  parentId: string | null;
  author: { id: string | null; name: string; kind: "HUMAN" | "SYSTEM" | "AGENT" };
  body: string;
  deleted: boolean;
  editedAt: string | null;
  createdAt: string;
  mentionedIds: string[];
  replyCount: number;
  lastReplyAt: string | null;
  attachments: { id: string; name: string; mimeType: string; sizeBytes: number }[];
  cards: ResourceCard[];
  work: { purpose: string; card: ResourceCard }[];
  canEdit: boolean;
  canDelete: boolean;
};

type Row = CoworkMessage & {
  attachments: { id: string; name: string; mimeType: string; sizeBytes: number; deletedAt: Date | null }[];
  resources: { kind: CoworkResourceKind; resourceId: string }[];
  workItems: { purpose: string; taskId: string | null; agendaEventId: string | null }[];
};

const INCLUDE = {
  attachments: { select: { id: true, name: true, mimeType: true, sizeBytes: true, deletedAt: true }, orderBy: { createdAt: "asc" as const } },
  resources: { select: { kind: true, resourceId: true }, orderBy: { createdAt: "asc" as const } },
  workItems: { select: { purpose: true, taskId: true, agendaEventId: true }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.CoworkMessageInclude;

async function one(ctx: TenantContext, row: Row, manager: boolean): Promise<CoworkMessageDTO> {
  const [dto] = await toDTOs(ctx, [row], manager);
  if (!dto) throw new NotFoundError("Mensagem não encontrada.");
  return dto;
}

async function toDTOs(ctx: TenantContext, rows: Row[], manager: boolean): Promise<CoworkMessageDTO[]> {
  const names = await displayNames(ctx.organizationId, rows.map((r) => r.authorId));
  const refs = rows.flatMap((r) => (r.deletedAt ? [] : r.resources.map((x) => ({ kind: x.kind as ResourceKind, resourceId: x.resourceId }))));
  const workRefs = rows.flatMap((r) => r.workItems.flatMap((w): { kind: ResourceKind; resourceId: string }[] => (w.taskId ? [{ kind: "TASK", resourceId: w.taskId }] : w.agendaEventId ? [{ kind: "EVENT", resourceId: w.agendaEventId }] : [])));
  const cards = await resolveCards(ctx, [...refs, ...workRefs]);
  const cardOf = new Map(cards.map((c) => [`${c.kind}:${c.id}`, c]));
  const now = Date.now();
  return rows.map((r) => {
    const deleted = Boolean(r.deletedAt);
    const own = r.authorId === ctx.userId && r.authorKind === "HUMAN";
    return {
      id: r.id,
      seq: r.seq,
      channelId: r.channelId,
      parentId: r.parentId,
      author: { id: r.authorId, name: r.authorKind === "SYSTEM" ? "LegalOS" : r.authorId ? (names.get(r.authorId) ?? "Pessoa removida") : "Pessoa removida", kind: r.authorKind },
      body: deleted ? "" : r.body,
      deleted,
      editedAt: r.editedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      mentionedIds: deleted ? [] : r.mentionedIds,
      replyCount: r.replyCount,
      lastReplyAt: r.lastReplyAt?.toISOString() ?? null,
      attachments: deleted ? [] : r.attachments.filter((a) => !a.deletedAt).map((a) => ({ id: a.id, name: a.name, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
      cards: deleted ? [] : r.resources.map((x) => cardOf.get(`${x.kind}:${x.resourceId}`)!).filter(Boolean),
      work: r.workItems.flatMap((w) => {
        const card = w.taskId ? cardOf.get(`TASK:${w.taskId}`) : w.agendaEventId ? cardOf.get(`EVENT:${w.agendaEventId}`) : undefined;
        return card ? [{ purpose: w.purpose, card }] : [];
      }),
      canEdit: !deleted && own && can(ctx, "cowork:write") && now - r.createdAt.getTime() < EDIT_WINDOW_MS,
      canDelete: !deleted && r.authorKind === "HUMAN" && (own || manager),
    };
  });
}

/** Histórico paginado. Sem `after`: páginas da linha principal (sem respostas de thread), mais recentes primeiro.
 *  Com `after`: tudo o que entrou depois da sequência (recuperação após reconexão), incluindo respostas. */
export async function listMessages(ctx: TenantContext, channelId: string, opts: { before?: number; after?: number; limit?: number } = {}) {
  const ch = await loadChannelForMember(ctx, channelId);
  const limit = Math.min(Math.max(opts.limit ?? MESSAGE_PAGE_SIZE, 1), 200);
  const manager = isChannelManager(ctx, ch, ch.member);
  if (opts.after !== undefined) {
    const rows = await db.coworkMessage.findMany({ where: { channelId, organizationId: ctx.organizationId, seq: { gt: opts.after } }, orderBy: { seq: "asc" }, take: limit + 1, include: INCLUDE });
    const hasMore = rows.length > limit;
    return { messages: await toDTOs(ctx, rows.slice(0, limit), manager), hasMore, lastSeq: ch.lastSeq, lastReadSeq: ch.member.lastReadSeq };
  }
  const rows = await db.coworkMessage.findMany({
    where: { channelId, organizationId: ctx.organizationId, parentId: null, ...(opts.before !== undefined ? { seq: { lt: opts.before } } : {}) },
    orderBy: { seq: "desc" },
    take: limit + 1,
    include: INCLUDE,
  });
  const hasMore = rows.length > limit;
  return { messages: (await toDTOs(ctx, rows.slice(0, limit), manager)).reverse(), hasMore, lastSeq: ch.lastSeq, lastReadSeq: ch.member.lastReadSeq };
}

async function loadMessage(ctx: TenantContext, messageId: string) {
  await assertCoworkAccess(ctx);
  if (!z.uuid().safeParse(messageId).success) throw new NotFoundError("Mensagem não encontrada.");
  const m = await db.coworkMessage.findFirst({ where: { id: messageId, organizationId: ctx.organizationId }, include: INCLUDE });
  if (!m) throw new NotFoundError("Mensagem não encontrada.");
  const ch = await loadChannelForMember(ctx, m.channelId).catch(() => {
    throw new NotFoundError("Mensagem não encontrada.");
  });
  return { m, ch };
}

export async function getMessage(ctx: TenantContext, messageId: string): Promise<CoworkMessageDTO> {
  const { m, ch } = await loadMessage(ctx, messageId);
  return one(ctx, m, isChannelManager(ctx, ch, ch.member));
}

export async function listThread(ctx: TenantContext, rootId: string) {
  const { m, ch } = await loadMessage(ctx, rootId);
  if (m.parentId) throw new ValidationError("Abra a thread pela mensagem principal.");
  const replies = await db.coworkMessage.findMany({ where: { parentId: rootId, organizationId: ctx.organizationId }, orderBy: { seq: "asc" }, take: 500, include: INCLUDE });
  const manager = isChannelManager(ctx, ch, ch.member);
  const [root, ...rest] = await toDTOs(ctx, [m, ...replies], manager);
  if (!root) throw new NotFoundError("Mensagem não encontrada.");
  return { root, replies: rest };
}

type Upload = { name: string; buffer: Buffer };

/**
 * Envia mensagem. Proteção contra envio duplicado: o navegador gera `clientNonce` e reenvios (rede instável,
 * clique duplo, reconexão) devolvem a MESMA mensagem em vez de criar outra.
 */
export async function sendMessage(ctx: TenantContext, channelId: string, raw: SendMessageInput | Record<string, unknown>, files: Upload[] = []): Promise<CoworkMessageDTO> {
  const input = sendMessageSchema.parse(raw);
  const ch = await loadChannelForMember(ctx, channelId, { write: true });
  const existing = await db.coworkMessage.findFirst({ where: { channelId, authorId: ctx.userId, clientNonce: input.clientNonce }, include: INCLUDE });
  if (existing) return one(ctx, existing, isChannelManager(ctx, ch, ch.member));

  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!body && !files.length && !input.resources.length) throw new ValidationError("Escreva uma mensagem, anexe um arquivo ou compartilhe um item.");
  if (!limiters.coworkMessage.check(`${ctx.organizationId}:${ctx.userId}`)) throw new ValidationError("Muitas mensagens em pouco tempo. Aguarde alguns segundos.");
  if (files.length > ATTACHMENTS_PER_MESSAGE) throw new ValidationError(`Envie no máximo ${ATTACHMENTS_PER_MESSAGE} arquivos por mensagem.`);
  if (files.reduce((n, f) => n + f.buffer.length, 0) > ATTACHMENTS_TOTAL_MAX_BYTES) throw new ValidationError("Os anexos de uma mensagem podem somar no máximo 9 MB.");
  if (files.length && !can(ctx, "cowork:share")) throw new ForbiddenError("Você não tem permissão para compartilhar arquivos no Cowork.");
  const resources = input.resources as { kind: ResourceKind; resourceId: string }[];
  await assertCanShare(ctx, resources);

  if (input.parentId) {
    const parent = await db.coworkMessage.findFirst({ where: { id: input.parentId, channelId, organizationId: ctx.organizationId, parentId: null }, select: { id: true, deletedAt: true } });
    if (!parent) throw new NotFoundError("Mensagem original não encontrada.");
  }
  // Menções válidas: só quem participa da conversa (menção nunca abre acesso a quem não participa).
  const members = await db.coworkChannelMember.findMany({ where: { channelId }, select: { userId: true, mutedAt: true, lastReadSeq: true } });
  const memberIds = new Set(members.map((m) => m.userId));
  const mentionedIds = [...new Set(input.mentionedIds)].filter((id) => memberIds.has(id) && id !== ctx.userId);

  const prepared = files.map((f) => {
    const c = classifyFile(f.name, f.buffer);
    return { ...c, buffer: f.buffer, key: `${ctx.organizationId}/${randomUUID()}`, sha256: createHash("sha256").update(f.buffer).digest("hex") };
  });
  if (prepared.length) await assertStorageAvailable(ctx.organizationId, prepared.reduce((n, f) => n + f.buffer.length, 0));
  const stored: string[] = [];
  let committed = false;
  try {
    for (const f of prepared) {
      await putObject(f.key, f.buffer);
      stored.push(f.key);
    }
    const message = await db.$transaction(async (tx) => {
      const msg = await appendMessageTx(tx, { organizationId: ctx.organizationId, channelId, authorId: ctx.userId, authorKind: "HUMAN", body, parentId: input.parentId ?? null, mentionedIds, clientNonce: input.clientNonce, resources });
      if (prepared.length) {
        await tx.coworkAttachment.createMany({
          data: prepared.map((f) => ({ organizationId: ctx.organizationId, channelId, messageId: msg.id, name: f.name, mimeType: f.mime, sizeBytes: f.buffer.length, sha256: f.sha256, storageKey: f.key, uploadedById: ctx.userId })),
        });
        await audit({ action: "cowork.attachment.upload", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_message", resourceId: msg.id, metadata: { files: prepared.length, bytes: prepared.reduce((n, f) => n + f.buffer.length, 0) }, meta: ctx.meta }, tx);
      }
      if (resources.length) await audit({ action: "cowork.resource.share", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_message", resourceId: msg.id, metadata: { kinds: resources.map((r) => r.kind) }, meta: ctx.meta }, tx);
      return msg;
    });
    committed = true;
    await notifyRecipients(ctx, ch, message, mentionedIds, members).catch(() => 0);
    const row = await db.coworkMessage.findUniqueOrThrow({ where: { id: message.id }, include: INCLUDE });
    return one(ctx, row, isChannelManager(ctx, ch, ch.member));
  } catch (err) {
    if (!committed) for (const k of stored) await deleteObject(k);
    if (isUniqueViolation(err)) {
      const again = await db.coworkMessage.findFirst({ where: { channelId, authorId: ctx.userId, clientNonce: input.clientNonce }, include: INCLUDE });
      if (again) return one(ctx, again, isChannelManager(ctx, ch, ch.member));
    }
    throw err;
  }
}

/** Avisos: menções, conversas diretas e respostas em thread. O aviso não carrega o texto da mensagem. */
async function notifyRecipients(
  ctx: TenantContext,
  ch: Awaited<ReturnType<typeof loadChannelForMember>>,
  msg: CoworkMessage,
  mentionedIds: string[],
  members: { userId: string; mutedAt: Date | null; lastReadSeq: number }[],
) {
  const names = await displayNames(ctx.organizationId, [ctx.userId]);
  const who = names.get(ctx.userId) ?? "Alguém";
  const where = ch.kind === "DIRECT" ? "em uma conversa direta" : ch.kind === "GROUP" ? `no grupo ${ch.name}` : `em #${ch.name}`;
  const link = `/cowork?c=${ch.id}&m=${msg.id}`;
  const items: NotifyInput[] = mentionedIds.map((uid) => ({ organizationId: ctx.organizationId, userId: uid, kind: "cowork.mention", title: `${who} mencionou você ${where}`, link, dedupeKey: `cowork-mention:${msg.id}:${uid}` }));
  if (ch.kind === "DIRECT" || ch.kind === "GROUP") {
    for (const m of members) {
      if (m.userId === ctx.userId || m.mutedAt || mentionedIds.includes(m.userId)) continue;
      // Um aviso por sequência de mensagens não lidas (não um por mensagem).
      items.push({ organizationId: ctx.organizationId, userId: m.userId, kind: "cowork.direct", title: `Nova mensagem de ${who} ${where}`, link, dedupeKey: `cowork-unread:${ch.id}:${m.userId}:${m.lastReadSeq}` });
    }
  }
  if (msg.parentId) {
    const root = await db.coworkMessage.findUnique({ where: { id: msg.parentId }, select: { authorId: true, authorKind: true } });
    if (root?.authorId && root.authorKind === "HUMAN" && root.authorId !== ctx.userId && !mentionedIds.includes(root.authorId) && members.some((m) => m.userId === root.authorId)) {
      items.push({ organizationId: ctx.organizationId, userId: root.authorId, kind: "cowork.thread", title: `${who} respondeu à sua mensagem ${where}`, link: `${link}&t=${msg.parentId}`, dedupeKey: `cowork-thread:${msg.parentId}:${root.authorId}:${new Date().toISOString().slice(0, 13)}` });
    }
  }
  return notify(items);
}

export async function editMessage(ctx: TenantContext, messageId: string, body: string) {
  const { m, ch } = await loadMessage(ctx, messageId);
  await loadChannelForMember(ctx, ch.id, { write: true });
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) throw new ValidationError("A mensagem não pode ficar vazia. Exclua-a, se preferir.");
  if (text.length > MESSAGE_MAX_LENGTH) throw new ValidationError("Mensagem muito longa.");
  if (m.authorId !== ctx.userId || m.authorKind !== "HUMAN") throw new ForbiddenError("Só quem escreveu pode editar a mensagem.");
  if (m.deletedAt) throw new ValidationError("Mensagem excluída.");
  if (Date.now() - m.createdAt.getTime() > EDIT_WINDOW_MS) throw new ValidationError("O prazo para editar esta mensagem terminou (24 horas).");
  await db.$transaction(async (tx) => {
    await tx.coworkMessage.update({ where: { id: messageId }, data: { body: text, editedAt: new Date() } });
    await audit({ action: "cowork.message.edit", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_message", resourceId: messageId, metadata: { channelId: ch.id }, meta: ctx.meta }, tx);
    await publishInTx(tx, { o: ctx.organizationId, t: "message_updated", c: ch.id, m: messageId });
  });
}

/** Exclusão: o autor, ou quem administra a conversa. O texto e os anexos deixam de ser servidos; fica o registro auditado. */
export async function deleteMessage(ctx: TenantContext, messageId: string) {
  const { m, ch } = await loadMessage(ctx, messageId);
  const own = m.authorId === ctx.userId && m.authorKind === "HUMAN";
  if (!own && !(m.authorKind === "HUMAN" && isChannelManager(ctx, ch, ch.member))) throw new ForbiddenError("Você não pode excluir esta mensagem.");
  if (m.deletedAt) return;
  const keys = await db.$transaction(async (tx) => {
    await tx.coworkMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), deletedById: ctx.userId, body: "", mentionedIds: [] } });
    const atts = await tx.coworkAttachment.findMany({ where: { messageId, deletedAt: null }, select: { storageKey: true } });
    await tx.coworkAttachment.updateMany({ where: { messageId }, data: { deletedAt: new Date() } });
    await tx.coworkResourceRef.deleteMany({ where: { messageId } });
    await audit({ action: "cowork.message.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_message", resourceId: messageId, metadata: { channelId: ch.id, byModerator: !own, attachments: atts.length }, meta: ctx.meta }, tx);
    await publishInTx(tx, { o: ctx.organizationId, t: "message_updated", c: ch.id, m: messageId });
    return atts.map((a) => a.storageKey);
  });
  for (const k of keys) await deleteObject(k);
}

/** Busca nas conversas de que a pessoa participa (nunca em conversas alheias, nem para administradores). */
export async function searchMessages(ctx: TenantContext, q: string) {
  await assertCoworkAccess(ctx);
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return [];
  const rows = await db.coworkMessage.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, authorKind: { not: "SYSTEM" }, body: { contains: term, mode: "insensitive" }, channel: { members: { some: { userId: ctx.userId } } } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, channelId: true, parentId: true, body: true, createdAt: true, authorId: true, channel: { select: { name: true, kind: true, caseId: true, members: { select: { userId: true } } } } },
  });
  const okCase = new Map<string, boolean>();
  const out = [];
  const names = await displayNames(ctx.organizationId, [...rows.map((r) => r.authorId), ...rows.flatMap((r) => (r.channel.kind === "DIRECT" ? r.channel.members.map((m) => m.userId) : []))]);
  for (const r of rows) {
    if (r.channel.caseId) {
      if (!okCase.has(r.channel.caseId)) okCase.set(r.channel.caseId, await assertCoworkCaseVisible(ctx, r.channel.caseId).then(() => true, () => false));
      if (!okCase.get(r.channel.caseId)) continue;
    }
    const peer = r.channel.kind === "DIRECT" ? r.channel.members.find((m) => m.userId !== ctx.userId)?.userId : null;
    out.push({
      id: r.id,
      channelId: r.channelId,
      parentId: r.parentId,
      channelName: r.channel.kind === "DIRECT" ? (peer ? (names.get(peer) ?? "Conversa direta") : "Conversa direta") : r.channel.name,
      channelKind: r.channel.kind,
      authorName: r.authorId ? (names.get(r.authorId) ?? "Pessoa removida") : "LegalOS",
      excerpt: excerpt(r.body, term),
      createdAt: r.createdAt.toISOString(),
    });
  }
  return out;
}

function excerpt(body: string, term: string) {
  const i = body.toLowerCase().indexOf(term.toLowerCase());
  const start = Math.max(0, i - 60);
  return `${start > 0 ? "…" : ""}${body.slice(start, start + 180)}${start + 180 < body.length ? "…" : ""}`;
}

/** Download de anexo: confere escritório, participação na conversa e sigilo do processo da sala. */
export async function getAttachmentForDownload(ctx: TenantContext, attachmentId: string) {
  await assertCoworkAccess(ctx);
  if (!z.uuid().safeParse(attachmentId).success) throw new NotFoundError("Arquivo não encontrado.");
  const a = await db.coworkAttachment.findFirst({ where: { id: attachmentId, organizationId: ctx.organizationId, deletedAt: null } });
  if (!a) throw new NotFoundError("Arquivo não encontrado.");
  await loadChannelForMember(ctx, a.channelId).catch(() => {
    throw new NotFoundError("Arquivo não encontrado.");
  });
  await audit({ action: "cowork.attachment.download", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_attachment", resourceId: a.id, meta: ctx.meta });
  return a;
}
