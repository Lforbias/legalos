import { db } from "@/lib/db/client";
import { NotFoundError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { caseVisibility } from "./case.service";

/** A intimação de origem precisa existir NESTE escritório e estar visível a quem cria a tarefa/prazo. */
export async function assertNoticeUsable(ctx: TenantContext, noticeId: string) {
  assertCan(ctx, "inbox:read");
  const n = await db.courtNotice.findFirst({
    where: { id: noticeId, organizationId: ctx.organizationId, deletedAt: null, OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }] },
    select: { id: true },
  });
  if (!n) throw new NotFoundError("Intimação não encontrada.");
}
