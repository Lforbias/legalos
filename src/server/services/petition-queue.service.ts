import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { getPetitioningAdapter } from "@/lib/petitioning/adapter";
import { onlyDigits } from "@/lib/validation/br-documents";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { caseVisibility } from "./case.service";
import { notify } from "./notification.service";
import { recoverStuckSubmissions, submitPetition } from "./petition.service";
import { resolveTenantContext } from "./tenant.service";

/**
 * 3.0-F5 — fila de protocolos e agendamento.
 * Segurança: o agendamento só existe com o interruptor do escritório LIGADO (padrão: desligado), é feito por quem pode aprovar,
 * em protocolo REAL exige digitar o número do processo (a mesma confirmação do envio manual) e, na hora de rodar, envia a
 * versão EXATA que foi aprovada. Se qualquer coisa mudar (documento, aprovação, permissão), o agendamento é cancelado e a pessoa é avisada.
 */
export const MIN_LEAD_MS = 60_000;
export const MAX_AHEAD_DAYS = 30;
const MAX_PER_RUN = 20;

export async function getScheduleSwitch(ctx: TenantContext) {
  assertCan(ctx, "petitions:read");
  const o = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { petitionScheduleEnabled: true } });
  return Boolean(o?.petitionScheduleEnabled);
}

export async function setScheduleSwitch(ctx: TenantContext, on: boolean) {
  assertCan(ctx, "organization:manage");
  await db.organization.update({ where: { id: ctx.organizationId }, data: { petitionScheduleEnabled: on } });
  if (!on) {
    // desligar cancela o que estava agendado (nada protocola "por inércia")
    await db.petitionFiling.updateMany({ where: { organizationId: ctx.organizationId, scheduledFor: { not: null }, status: "APPROVED" }, data: { scheduledFor: null, scheduleNote: "Agendamento cancelado: o agendamento de protocolos foi desligado no escritório." } });
  }
  await audit({ action: on ? "petition.schedule_on" : "petition.schedule_off", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, meta: ctx.meta });
}

export async function schedulePetition(ctx: TenantContext, id: string, input: { at: Date; confirmCase?: string }, now = new Date()) {
  assertCan(ctx, "petitions:approve");
  if (!(await getScheduleSwitch(ctx))) throw new ConflictError("O agendamento de protocolos está desligado neste escritório. Um administrador pode ligá-lo na fila de protocolos.");
  const p = await db.petitionFiling.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null, case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } },
    include: { case: { select: { number: true } }, document: { select: { currentVersion: true, deletedAt: true } } },
  });
  if (!p) throw new NotFoundError("Petição não encontrada.");
  if (p.status !== "APPROVED") throw new ConflictError("Só petições aprovadas podem ser agendadas.");
  if (p.document.deletedAt || p.document.currentVersion !== p.documentVersion) throw new ConflictError("O documento mudou depois da aprovação. Devolva a petição ao rascunho e reenvie para revisão.");
  if (Number.isNaN(input.at.getTime()) || input.at.getTime() < now.getTime() + MIN_LEAD_MS) throw new ValidationError("Escolha um horário daqui a pelo menos 1 minuto.", { at: ["Horário inválido ou já passou."] });
  if (input.at.getTime() > now.getTime() + MAX_AHEAD_DAYS * 86_400_000) throw new ValidationError(`O agendamento pode ser feito para até ${MAX_AHEAD_DAYS} dias à frente.`, { at: ["Data muito distante."] });
  const adapter = getPetitioningAdapter();
  if (!adapter.isDemo) {
    const want = onlyDigits(p.case.number ?? "");
    if (!want || onlyDigits(input.confirmCase ?? "") !== want) throw new ValidationError("Para agendar um protocolo no tribunal, digite o número do processo para confirmar.", { confirmCase: ["Número do processo não confere."] });
  }
  await db.petitionFiling.update({ where: { id }, data: { scheduledFor: input.at, scheduledById: ctx.userId, scheduleNote: null } });
  await audit({ action: "petition.schedule", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, metadata: { at: input.at.toISOString(), demo: adapter.isDemo }, meta: ctx.meta });
}

export async function unschedulePetition(ctx: TenantContext, id: string) {
  assertCan(ctx, "petitions:write");
  const res = await db.petitionFiling.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null, status: "APPROVED", scheduledFor: { not: null } }, data: { scheduledFor: null, scheduleNote: "Agendamento cancelado por uma pessoa." } });
  if (res.count === 0) throw new ConflictError("Esta petição não está agendada (ou já foi enviada).");
  await audit({ action: "petition.unschedule", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, meta: ctx.meta });
}

const QUEUE_STATUSES = ["APPROVED", "SUBMITTING", "SUBMITTED", "FAILED", "AWAITING_CONFIRMATION", "FILED_CONFIRMED", "UNKNOWN"] as const;

export async function listQueue(ctx: TenantContext, f: { view?: "fila" | "agendadas" | "protocoladas" | "falhas" | "conferir" } = {}) {
  assertCan(ctx, "petitions:read");
  const view = f.view ?? "fila";
  const status = view === "protocoladas" ? ["SUBMITTED", "FILED_CONFIRMED"] : view === "falhas" ? ["FAILED"] : view === "conferir" ? ["UNKNOWN", "AWAITING_CONFIRMATION"] : view === "agendadas" ? ["APPROVED"] : ["APPROVED", "SUBMITTING"];
  const rows = await db.petitionFiling.findMany({
    where: {
      organizationId: ctx.organizationId, deletedAt: null, status: { in: status as (typeof QUEUE_STATUSES)[number][] },
      ...(view === "agendadas" ? { scheduledFor: { not: null } } : {}),
      case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } },
    },
    orderBy: view === "agendadas" ? { scheduledFor: "asc" } : { updatedAt: "desc" },
    take: 200,
    select: { id: true, title: true, status: true, isDemo: true, filingEnvironment: true, protocol: true, error: true, scheduledFor: true, scheduleNote: true, submittedAt: true, updatedAt: true, receipt: true, case: { select: { id: true, title: true, number: true, court: true } } },
  });
  const counts = await db.petitionFiling.groupBy({ by: ["status"], where: { organizationId: ctx.organizationId, deletedAt: null, status: { in: [...QUEUE_STATUSES] } }, _count: true });
  const scheduled = await db.petitionFiling.count({ where: { organizationId: ctx.organizationId, deletedAt: null, status: "APPROVED", scheduledFor: { not: null } } });
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  return { items: rows.map(({ receipt, ...r }) => ({ ...r, hasReceipt: Boolean(receipt) })), counts: { queued: c("APPROVED"), scheduled, submitted: c("SUBMITTED") + c("FILED_CONFIRMED"), failed: c("FAILED"), toCheck: c("UNKNOWN") + c("AWAITING_CONFIRMATION") } };
}

export async function getReceipt(ctx: TenantContext, id: string) {
  assertCan(ctx, "petitions:read");
  const p = await db.petitionFiling.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null, status: { in: ["SUBMITTED", "FILED_CONFIRMED", "AWAITING_CONFIRMATION"] }, case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } },
    select: { title: true, protocol: true, receipt: true, isDemo: true },
  });
  if (!p?.receipt) throw new NotFoundError("Recibo não encontrado.");
  return p;
}

async function cancelSchedule(id: string, note: string, userId: string | null, organizationId: string, title: string) {
  await db.petitionFiling.updateMany({ where: { id, scheduledFor: null }, data: { scheduleNote: note } });
  if (userId) await notify({ organizationId, userId, kind: "petition.schedule", title: "Agendamento de protocolo não executado", body: `${title}: ${note}`.slice(0, 250), link: `/peticoes/${id}`, dedupeKey: `petition.schedule:${id}:${Date.now()}` });
}

/** Rotina do agendador (a cada minuto): executa os agendamentos vencidos, no máximo 20 por vez. */
export async function runDueSchedules(now = new Date()) {
  // Antes de tudo: envio "preso" vira estado desconhecido (nunca é reenviado automaticamente).
  await recoverStuckSubmissions(now).catch((e) => logger.warn("petition.recover_failed", { error: e instanceof Error ? e.message : String(e) }));
  const due = await db.petitionFiling.findMany({
    where: { status: "APPROVED", deletedAt: null, scheduledFor: { lte: now }, organization: { deletedAt: null, suspendedAt: null } },
    orderBy: { scheduledFor: "asc" },
    take: MAX_PER_RUN,
    select: { id: true, title: true, organizationId: true, scheduledById: true, case: { select: { number: true } } },
  });
  const out = { due: due.length, submitted: 0, failed: 0, skipped: 0 };
  for (const p of due) {
    // reserva atômica: só uma execução pega este agendamento
    const claim = await db.petitionFiling.updateMany({ where: { id: p.id, status: "APPROVED", scheduledFor: { lte: now } }, data: { scheduledFor: null, scheduleNote: null } });
    if (claim.count === 0) continue;
    try {
      const org = await db.organization.findUnique({ where: { id: p.organizationId }, select: { petitionScheduleEnabled: true } });
      if (!org?.petitionScheduleEnabled) { await cancelSchedule(p.id, "o agendamento de protocolos está desligado no escritório.", p.scheduledById, p.organizationId, p.title); out.skipped++; continue; }
      const ctx = p.scheduledById ? await resolveTenantContext(p.scheduledById, p.organizationId, {}) : null;
      if (!ctx || !ctx.permissions.has("petitions:approve")) { await cancelSchedule(p.id, "quem agendou não tem mais permissão para aprovar envios.", p.scheduledById, p.organizationId, p.title); out.skipped++; continue; }
      const res = await submitPetition(ctx, p.id, { confirmCase: p.case.number ?? undefined });
      out.submitted++;
      await notify({ organizationId: p.organizationId, userId: ctx.userId, kind: "petition.schedule", title: res.isDemo ? "Envio agendado concluído (demonstração)" : res.officiallyFiled ? "Petição protocolada no horário agendado" : "Envio agendado concluído sem confirmação oficial: confira no tribunal", body: `${p.title} · protocolo ${res.protocol}`.slice(0, 250), link: `/peticoes/${p.id}`, dedupeKey: `petition.schedule.ok:${p.id}` });
    } catch (e) {
      out.failed++;
      const msg = e instanceof Error ? e.message.slice(0, 250) : "falha inesperada";
      logger.warn("petition.schedule_failed", { petitionId: p.id, error: msg });
      await cancelSchedule(p.id, msg, p.scheduledById, p.organizationId, p.title).catch(() => undefined);
    }
  }
  return out;
}
