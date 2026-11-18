import type { CoworkAuthorKind, CoworkResourceKind } from "@prisma/client";
import type { Tx } from "@/lib/db/client";
import { publishInTx } from "./realtime";

export type AppendInput = {
  organizationId: string;
  channelId: string;
  authorId: string | null;
  authorKind: CoworkAuthorKind;
  body: string;
  parentId?: string | null;
  mentionedIds?: string[];
  clientNonce?: string | null;
  resources?: { kind: CoworkResourceKind; resourceId: string }[];
};

/**
 * Grava uma mensagem com ordem total no canal. O incremento de `last_seq` trava a linha do canal até o COMMIT,
 * então duas mensagens simultâneas nunca recebem a mesma sequência e a ordem de leitura é sempre a de gravação.
 */
export async function appendMessageTx(tx: Tx, input: AppendInput) {
  const now = new Date();
  const channel = await tx.coworkChannel.update({
    where: { id_organizationId: { id: input.channelId, organizationId: input.organizationId } },
    data: { lastSeq: { increment: 1 }, lastMessageAt: now },
    select: { lastSeq: true },
  });
  const message = await tx.coworkMessage.create({
    data: {
      organizationId: input.organizationId,
      channelId: input.channelId,
      seq: channel.lastSeq,
      authorId: input.authorId,
      authorKind: input.authorKind,
      parentId: input.parentId ?? null,
      body: input.body,
      mentionedIds: input.mentionedIds ?? [],
      clientNonce: input.clientNonce ?? null,
      createdAt: now,
    },
  });
  if (input.resources?.length) {
    await tx.coworkResourceRef.createMany({
      data: input.resources.map((r) => ({ organizationId: input.organizationId, messageId: message.id, kind: r.kind, resourceId: r.resourceId })),
      skipDuplicates: true,
    });
  }
  if (input.parentId) {
    await tx.coworkMessage.update({ where: { id: input.parentId }, data: { replyCount: { increment: 1 }, lastReplyAt: now } });
    await publishInTx(tx, { o: input.organizationId, t: "message_updated", c: input.channelId, m: input.parentId });
  }
  // O próprio autor já leu o que escreveu.
  if (input.authorId) {
    await tx.coworkChannelMember.updateMany({
      where: { channelId: input.channelId, userId: input.authorId, lastReadSeq: { lt: message.seq } },
      data: { lastReadSeq: message.seq },
    });
  }
  await publishInTx(tx, { o: input.organizationId, t: "message", c: input.channelId, s: message.seq, m: message.id });
  return message;
}

export const directKeyOf = (a: string, b: string) => [a, b].sort().join(":");
