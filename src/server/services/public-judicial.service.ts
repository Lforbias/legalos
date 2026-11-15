import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { assertCan, type TenantContext } from "@/server/context";
import { assertCaseVisible, caseVisibility, logCaseEvent } from "./case.service";
import { audit } from "./audit.service";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";

const PUBLIC_DJEN_NOTICE = {
  source: "IMPORTED",
  sourceSystem: "djen",
  originKind: "DJEN_PUBLICATION",
} as const;

/** Publicações do DJEN, sem abrir permissões nem rotas da antiga caixa do BOX. */
export async function listPublicDjenNotices(ctx: TenantContext, take = 100) {
  assertCan(ctx, "cases:read");
  const where: Prisma.CourtNoticeWhereInput = {
    organizationId: ctx.organizationId,
    deletedAt: null,
    ...PUBLIC_DJEN_NOTICE,
    OR: [
      { caseId: null },
      { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } },
    ],
  };
  const [total, items] = await Promise.all([
    db.courtNotice.count({ where }),
    db.courtNotice.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { receivedAt: "desc" }, { id: "asc" }],
      take: Math.max(1, Math.min(take, 200)),
      select: {
        id: true,
        title: true,
        content: true,
        kind: true,
        status: true,
        court: true,
        caseNumber: true,
        publishedAt: true,
        receivedAt: true,
        case: { select: { id: true, title: true, number: true } },
      },
    }),
  ]);
  return { total, items: items.map((item) => ({ ...item, content: item.content.slice(0, 8000), contentTruncated: item.content.length > 8000 })) };
}

/** Recorte público dentro de um processo; sigilo e vínculo são verificados antes da consulta. */
export async function listPublicDjenNoticesForCase(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const rows = await db.courtNotice.findMany({
    where: {
      organizationId: ctx.organizationId,
      caseId,
      deletedAt: null,
      ...PUBLIC_DJEN_NOTICE,
    },
    orderBy: [{ publishedAt: "desc" }, { receivedAt: "desc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      content: true,
      kind: true,
      court: true,
      caseNumber: true,
      publishedAt: true,
      receivedAt: true,
    },
  });
  return rows.map((row) => ({ ...row, content: row.content.slice(0, 8000), contentTruncated: row.content.length > 8000 }));
}

/** Revisão manual para publicações públicas cujo número não encontrou processo automaticamente. */
export async function linkPublicDjenNoticeToCase(ctx: TenantContext, noticeId: string, caseId: string) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const notice = await db.courtNotice.findFirst({
    where: { id: noticeId, organizationId: ctx.organizationId, deletedAt: null, ...PUBLIC_DJEN_NOTICE },
    select: { id: true, title: true, caseId: true },
  });
  if (!notice) throw new NotFoundError("Publicação não encontrada.");
  if (notice.caseId && notice.caseId !== caseId) throw new ValidationError("Esta publicação já está vinculada a outro processo.");
  if (notice.caseId === caseId) return;
  await db.$transaction(async (tx) => {
    const updated = await tx.courtNotice.updateMany({
      where: { id: noticeId, organizationId: ctx.organizationId, caseId: null, deletedAt: null, ...PUBLIC_DJEN_NOTICE },
      data: { caseId },
    });
    if (updated.count !== 1) throw new ValidationError("A publicação foi alterada. Atualize a página e tente novamente.");
    await logCaseEvent(tx, ctx, caseId, { kind: "NOTICE_LINKED", title: `Publicação do DJEN vinculada: ${notice.title}`, description: "Vínculo revisado manualmente pela equipe." });
    await audit({ action: "public_djen.link_case", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: noticeId, metadata: { caseId }, meta: ctx.meta }, tx);
  });
}

/** Encerramento manual da publicação pública dentro da Central Judicial. */
export async function markPublicDjenNoticeProcessed(ctx: TenantContext, noticeId: string) {
  assertCan(ctx, "cases:write");
  const notice = await db.courtNotice.findFirst({ where: { id: noticeId, organizationId: ctx.organizationId, deletedAt: null, ...PUBLIC_DJEN_NOTICE }, select: { id: true, title: true, status: true, caseId: true } });
  if (!notice) throw new NotFoundError("Publicação não encontrada.");
  if (notice.status === "PROCESSED" || notice.status === "DISCARDED") throw new ConflictError("Esta publicação já foi encerrada.");
  await db.$transaction(async (tx) => {
    const updated = await tx.courtNotice.updateMany({ where: { id: noticeId, organizationId: ctx.organizationId, status: notice.status, deletedAt: null, ...PUBLIC_DJEN_NOTICE }, data: { status: "PROCESSED", processedAt: new Date(), processedById: ctx.userId } });
    if (updated.count !== 1) throw new ConflictError("A publicação foi alterada. Atualize a página e tente novamente.");
    if (notice.caseId) await logCaseEvent(tx, ctx, notice.caseId, { kind: "NOTICE_PROCESSED", title: `Publicação do DJEN tratada: ${notice.title}` });
    await audit({ action: "public_djen.process", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: noticeId, meta: ctx.meta }, tx);
  });
}
