import { db, type Tx } from "@/lib/db/client";
import { storedEvent, type NoticeAction } from "@/lib/judicial/notice-state";
import type { TenantContext } from "@/server/context";
import { notifyBoxChange } from "./live";

/**
 * Grava um evento no histórico da comunicação, dentro da transação de quem mudou o estado.
 * Nunca guarde senhas, tokens nem o teor da comunicação em `data`.
 */
export async function recordNoticeEvent(tx: Tx | typeof db, ctx: Pick<TenantContext, "organizationId" | "userId">, noticeId: string, action: NoticeAction, data: Record<string, unknown> = {}): Promise<void> {
  const stored = storedEvent(action);
  await tx.noticeEvent.create({ data: { organizationId: ctx.organizationId, noticeId, kind: stored.kind, actorId: ctx.userId, data: { ...data, ...(stored.action ? { action: stored.action } : {}) } as never } });
  // O aviso sai já; se a transação ainda não confirmou, a conferência periódica do canal pega o evento em seguida.
  notifyBoxChange(ctx.organizationId);
}
