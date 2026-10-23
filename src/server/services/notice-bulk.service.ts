import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { bulkNoticeSchema } from "@/modules/inbox/list-schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { logCaseEvent } from "./case.service";
import { normalizeTags } from "./inbox-flow.service";
import { notify } from "./notification.service";
import { visibility } from "./notice.service";

/** Lote atômico e limitado: seleção explícita, sigilo, versões e notificações na mesma transação. */
export async function bulkUpdateNotices(ctx: TenantContext, raw: unknown, transaction?: Tx) {
  assertCan(ctx, "inbox:read");
  assertCan(ctx, "inbox:write");
  const parsed = bulkNoticeSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Lote inválido.");
  const input = parsed.data;
  const ids = input.selection.map(n => n.id).sort();
  const versions = new Map(input.selection.map(n => [n.id, n.updatedAt]));
  if (input.action === "SNOOZE") {
    const today = todayYmd(ctx.timezone);
    if (input.until <= today || input.until > addDays(today, 365)) throw new ValidationError("Escolha uma data futura, em até 1 ano.");
  }
  try {
    const apply = async (tx: Tx) => {
      const rows = await tx.courtNotice.findMany({
        where: { AND: [{ id: { in: ids }, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] },
        select: { id: true, title: true, status: true, tags: true, caseId: true, updatedAt: true }, orderBy: { id: "asc" },
      });
      if (rows.length !== ids.length) throw new NotFoundError("Uma intimação não está mais disponível. Recarregue a lista; nada foi alterado.");
      for (const n of rows) {
        if (n.updatedAt.toISOString() !== versions.get(n.id)) throw new ConflictError("Uma intimação mudou desde a seleção. Recarregue a lista; nada foi alterado.");
        if (input.action !== "ADD_TAGS" && n.status !== "NEW" && n.status !== "DISTRIBUTED") throw new ConflictError("O lote contém intimação encerrada. Selecione apenas intimações em aberto; nada foi alterado.");
      }

      let recipients: string[] = [];
      if (input.action === "ASSIGN_USER" || input.action === "ASSIGN_TEAM") {
        if (input.action === "ASSIGN_USER") recipients = [input.userId];
        else {
          const team = await tx.workTeam.findFirst({ where: { id: input.teamId, organizationId: ctx.organizationId }, select: { members: { select: { userId: true } } } });
          if (!team) throw new ValidationError("Equipe inválida.");
          recipients = team.members.map(m => m.userId);
          if (!recipients.length) throw new ValidationError("Escolha uma equipe com membros ativos.");
        }
        const members = await tx.membership.findMany({ where: { organizationId: ctx.organizationId, userId: { in: recipients }, status: "ACTIVE", user: { disabledAt: null }, role: { permissions: { has: "inbox:read" } } }, select: { userId: true, role: { select: { permissions: true } } } });
        if (members.length !== recipients.length) throw new ValidationError("Há destinatários inativos ou sem acesso à caixa.");
        for (const member of members) {
          const targetCtx = { ...ctx, userId: member.userId, permissions: new Set(member.role.permissions) };
          const visible = await tx.courtNotice.count({ where: { AND: [{ id: { in: ids }, organizationId: ctx.organizationId, deletedAt: null }, visibility(targetCtx)] } });
          if (visible !== ids.length) throw new ValidationError("Um destinatário não tem acesso a todos os processos do lote. Confira o sigilo; nada foi alterado.");
        }
      }

      for (const n of rows) {
        const data: Prisma.CourtNoticeUpdateManyMutationInput = { updatedAt: new Date(Math.max(Date.now(), n.updatedAt.getTime() + 1)) };
        if (input.action === "ASSIGN_USER") Object.assign(data, { status: "DISTRIBUTED", assigneeId: input.userId, teamId: null, assignedById: ctx.userId });
        if (input.action === "ASSIGN_TEAM") Object.assign(data, { status: "DISTRIBUTED", assigneeId: null, teamId: input.teamId, assignedById: ctx.userId });
        if (input.action === "ADD_TAGS") data.tags = normalizeTags([...n.tags, ...input.tags]);
        if (input.action === "SNOOZE") data.snoozedUntil = ymdToDate(input.until);
        if (input.action === "PROCESS") Object.assign(data, { status: "PROCESSED", processedAt: new Date(), processedById: ctx.userId, snoozedUntil: null });
        const result = await tx.courtNotice.updateMany({ where: { AND: [{ id: n.id, organizationId: ctx.organizationId, deletedAt: null, updatedAt: n.updatedAt }, visibility(ctx)] }, data });
        if (result.count !== 1) throw new ConflictError("Uma intimação foi alterada por outra pessoa. Recarregue a lista; nada foi alterado.");
        if (input.action === "PROCESS" && n.caseId) await logCaseEvent(tx, ctx, n.caseId, { kind: "NOTICE_PROCESSED", title: `Intimação tratada: ${n.title}` });
        await audit({ action: `notice.bulk.${input.action.toLowerCase()}`, organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: n.id, metadata: { batchSize: ids.length, ...(input.action === "ASSIGN_USER" ? { to: input.userId } : input.action === "ASSIGN_TEAM" ? { teamId: input.teamId } : input.action === "SNOOZE" ? { until: input.until } : {}) }, meta: ctx.meta }, tx);
        if (recipients.length) await notify(recipients.filter(userId => userId !== ctx.userId).map(userId => ({ organizationId: ctx.organizationId, userId, kind: "notice.assigned", title: `Intimação distribuída para você: ${n.title}`, link: `/caixa-de-entrada/${n.id}`, dedupeKey: `notice-bulk:${n.id}:${n.updatedAt.toISOString()}:${userId}` })), tx);
      }
      return { count: rows.length };
    };
    return transaction ? await apply(transaction) : await db.$transaction(apply, { isolationLevel: "Serializable", timeout: 30_000 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw new ConflictError("O lote mudou durante a operação. Recarregue a lista; nada foi alterado.");
    throw error;
  }
}
