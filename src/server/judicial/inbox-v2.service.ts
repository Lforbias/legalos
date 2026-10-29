import { db } from "@/lib/db/client";
import { NotFoundError } from "@/lib/permissions/check";
import { describeNoticeEvent, type TimelineItem } from "@/lib/judicial/notice-state";
import { assertCan, type TenantContext } from "@/server/context";
import { caseVisibility } from "@/server/services/case.service";
import { visibility } from "@/server/services/notice.service";
import { recordNoticeEvent } from "./notice-events";
import { userNames } from "@/server/services/members";

const visibleNotice = (ctx: TenantContext, id: string) => ({ AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] });

/**
 * Registra que alguém do escritório ABRIU a comunicação no LegalOS.
 *
 * Isto é só um fato interno: NUNCA toca nos campos de ciência oficial (`officialAckAt`/`officialAckState`) e não chama
 * nenhuma fonte externa. Ciência no tribunal só existe quando a própria fonte a confirma.
 * A marca de "primeira vez vista" é gravada por SQL direto para não mexer em `updatedAt` (abrir não é editar:
 * não pode invalidar uma seleção em lote que outra pessoa esteja fazendo).
 */
export async function recordNoticeViewed(ctx: TenantContext, noticeId: string): Promise<{ firstView: boolean; recorded: boolean }> {
  assertCan(ctx, "inbox:read");
  const n = await db.courtNotice.findFirst({ where: visibleNotice(ctx, noticeId), select: { id: true } });
  if (!n) throw new NotFoundError("Intimação não encontrada.");
  const first = await db.$executeRaw`UPDATE court_notices SET first_viewed_at = now(), first_viewed_by_id = ${ctx.userId}::uuid WHERE id = ${noticeId}::uuid AND organization_id = ${ctx.organizationId}::uuid AND first_viewed_at IS NULL`;
  const already = await db.noticeEvent.findFirst({ where: { noticeId, organizationId: ctx.organizationId, kind: "VIEWED", actorId: ctx.userId }, select: { id: true } });
  if (!already) await recordNoticeEvent(db, ctx, noticeId, "VIEWED", { firstOverall: first === 1 });
  return { firstView: first === 1, recorded: !already };
}

export type TimelineEntry = TimelineItem & { id: string; at: Date; kind: string };

/** Histórico da comunicação, do mais antigo ao mais novo, com nomes no lugar de identificadores. */
export async function getNoticeTimeline(ctx: TenantContext, noticeId: string, take = 200): Promise<TimelineEntry[]> {
  assertCan(ctx, "inbox:read");
  const n = await db.courtNotice.findFirst({ where: visibleNotice(ctx, noticeId), select: { id: true } });
  if (!n) throw new NotFoundError("Intimação não encontrada.");
  const events = await db.noticeEvent.findMany({ where: { noticeId, organizationId: ctx.organizationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take });
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const userIds = new Set<string>();
  const teamIds = new Set<string>();
  const caseIds = new Set<string>();
  for (const e of events) {
    const d = (e.data ?? {}) as Record<string, unknown>;
    if (e.actorId) userIds.add(e.actorId);
    if (str(d.to)) userIds.add(str(d.to)!);
    if (str(d.teamId)) teamIds.add(str(d.teamId)!);
    if (str(d.caseId)) caseIds.add(str(d.caseId)!);
  }
  const [users, teams, cases] = await Promise.all([
    // Só nomes de quem é do escritório (ex-membros viram "alguém do escritório"): o histórico nunca expõe dados de outra organização.
    userNames(ctx, [...userIds]),
    teamIds.size ? db.workTeam.findMany({ where: { id: { in: [...teamIds] }, organizationId: ctx.organizationId }, select: { id: true, name: true } }) : [],
    // O título de um processo sigiloso nunca aparece para quem não pode vê-lo.
    caseIds.size ? db.case.findMany({ where: { AND: [{ id: { in: [...caseIds] }, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true, title: true } }) : [],
  ]);
  const nameOf = (id: string | null) => (id ? (users.get(id) ?? null) : null);
  return events.map((e) => {
    const d = (e.data ?? {}) as Record<string, unknown>;
    const caseId = str(d.caseId);
    const caseTitle = caseId ? (cases.find((c) => c.id === caseId)?.title ?? null) : null;
    const item = describeNoticeEvent(e.kind, d, { actor: nameOf(e.actorId), to: nameOf(str(d.to)), team: str(d.teamId) ? (teams.find((t) => t.id === str(d.teamId))?.name ?? null) : null, caseTitle });
    return { ...item, id: e.id, at: e.createdAt, kind: e.kind };
  });
}

/** Profissionais (OAB) monitorados, para filtrar a caixa. Qualquer pessoa com acesso à caixa pode filtrar; só nome e OAB. */
export async function listProfessionalOptions(ctx: TenantContext) {
  assertCan(ctx, "inbox:read");
  return db.professionalIdentity.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, oabNumber: true, oabUf: true } });
}

/** Em aberto e ainda não vistas por ninguém no LegalOS (respeita o sigilo dos processos). */
export async function countUnviewed(ctx: TenantContext): Promise<number> {
  assertCan(ctx, "inbox:read");
  return db.courtNotice.count({ where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, status: { in: ["NEW", "DISTRIBUTED"] }, firstViewedAt: null }, visibility(ctx)] } });
}
