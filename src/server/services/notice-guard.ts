import { db } from "@/lib/db/client";
import { ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { assertCan, type TenantContext } from "@/server/context";
import { caseVisibility } from "./case.service";

/** A intimação de origem precisa existir NESTE escritório e estar visível a quem cria a tarefa/prazo. */
export async function assertNoticeUsable(ctx: TenantContext, noticeId: string, surface: "legacy" | "v3" = "legacy", caseId?: string) {
  if (surface === "v3") {
    if (!boxV3PreviewEnabled() || !ctx.permissions.has("inbox:read")) throw new ForbiddenError();
  } else assertCan(ctx, "inbox:read");
  const n = await db.courtNotice.findFirst({
    where: { id: noticeId, organizationId: ctx.organizationId, deletedAt: null, ...(caseId ? { caseId } : {}), OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }] },
    select: { id: true },
  });
  if (!n) throw new NotFoundError("Intimação não encontrada.");
}
