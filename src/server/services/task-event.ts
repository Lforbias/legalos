import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import type { TenantContext } from "@/server/context";

type Tx = Prisma.TransactionClient | typeof db;

/** Linha do histórico da tarefa ("quem fez o quê e quando"). Sem texto livre do usuário além de nomes/valores curtos. */
export async function recordTaskEvent(tx: Tx, ctx: TenantContext, taskId: string, kind: string, detail: string) {
  await tx.taskEvent.create({ data: { organizationId: ctx.organizationId, taskId, userId: ctx.userId, kind, detail: detail.slice(0, 300) } });
}
