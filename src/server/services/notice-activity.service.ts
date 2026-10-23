import { db } from "@/lib/db/client";
import { noticeActivityWindow, summarizeNoticeActivity } from "@/lib/notices/activity";
import type { TenantContext } from "@/server/context";
import { visibility } from "./notice.service";

export async function getNoticeActivity(ctx: TenantContext, days: number, now = new Date()) {
  const { since, until } = noticeActivityWindow(days, ctx.timezone, now);
  const rows = await db.courtNotice.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, createdAt: { gte: since, lte: until } }, visibility(ctx)] },
    select: { createdAt: true, source: true, externalKey: true },
  });
  return summarizeNoticeActivity(rows, days, ctx.timezone, now);
}
