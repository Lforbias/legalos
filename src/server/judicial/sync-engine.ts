import type { Prisma, SyncRun } from "@prisma/client";
import { db } from "@/lib/db/client";
import type { CoverageLevel } from "@/lib/judicial/evidence";
import { RUN_HEARTBEAT_TIMEOUT_MIN, type SourceKind } from "@/lib/judicial/health-policy";
import { isUniqueViolation } from "@/server/services/db-errors";

/**
 * Motor de execuções de sincronização. Reaproveita o Postgres que já existe (nada de Redis/serviço novo):
 *  - TRAVA: índice único parcial garante no máximo UMA execução "RUNNING" por fonte.
 *  - SINAL DE VIDA: cada etapa atualiza `heartbeat_at`; uma execução sem sinal há >10 min é marcada INTERRUPTED.
 *  - CHECKPOINT: `cursor` guarda onde parou (janela + próxima página) para retomar sem recomeçar.
 */
export type RunSource = { kind: SourceKind; id: string; organizationId: string };
export type RunTrigger = "CRON" | "MANUAL" | "ONBOARDING" | "RETRY";

export type RunCounters = { pages?: number; fetched?: number; reportedTotal?: number | null; created?: number; duplicates?: number; skipped?: number };

export async function recoverInterruptedRuns(now = new Date(), source?: RunSource): Promise<number> {
  const cut = new Date(now.getTime() - RUN_HEARTBEAT_TIMEOUT_MIN * 60_000);
  const r = await db.syncRun.updateMany({
    where: { status: "RUNNING", heartbeatAt: { lt: cut }, ...(source ? { sourceKind: source.kind, sourceId: source.id } : {}) },
    data: { status: "INTERRUPTED", finishedAt: now, errorCode: "INTERRUPTED", errorMessage: "A execução parou de dar sinal de vida e foi marcada como interrompida." },
  });
  return r.count;
}

export type StartResult = { locked: false; run: SyncRun } | { locked: true };

export async function startRun(source: RunSource, trigger: RunTrigger, init: { windowFrom?: Date | null; windowTo?: Date | null; cursor?: Prisma.InputJsonValue | null } = {}, now = new Date()): Promise<StartResult> {
  await recoverInterruptedRuns(now, source);
  try {
    const run = await db.syncRun.create({
      data: { organizationId: source.organizationId, sourceKind: source.kind, sourceId: source.id, trigger, startedAt: now, heartbeatAt: now, windowFrom: init.windowFrom ?? null, windowTo: init.windowTo ?? null, ...(init.cursor != null ? { cursor: init.cursor } : {}) },
    });
    return { locked: false, run };
  } catch (e) {
    if (isUniqueViolation(e)) return { locked: true };
    throw e;
  }
}

/** Sinal de vida + checkpoint + contadores parciais. */
export async function heartbeat(runId: string, patch: { cursor?: Prisma.InputJsonValue; counters?: RunCounters; windowFrom?: Date | null; windowTo?: Date | null } = {}, now = new Date()) {
  const c = patch.counters ?? {};
  await db.syncRun.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: {
      heartbeatAt: now,
      ...(patch.cursor !== undefined ? { cursor: patch.cursor } : {}),
      ...(patch.windowFrom !== undefined ? { windowFrom: patch.windowFrom } : {}),
      ...(patch.windowTo !== undefined ? { windowTo: patch.windowTo } : {}),
      ...(c.pages !== undefined ? { pages: c.pages } : {}),
      ...(c.fetched !== undefined ? { fetched: c.fetched } : {}),
      ...(c.reportedTotal !== undefined ? { reportedTotal: c.reportedTotal } : {}),
      ...(c.created !== undefined ? { createdCount: c.created } : {}),
      ...(c.duplicates !== undefined ? { duplicateCount: c.duplicates } : {}),
      ...(c.skipped !== undefined ? { skippedCount: c.skipped } : {}),
    },
  });
}

export async function finishRun(runId: string, status: "SUCCEEDED" | "PARTIAL" | "FAILED", o: { counters?: RunCounters; coverage?: CoverageLevel | null; errorCode?: string | null; errorMessage?: string | null; cursor?: Prisma.InputJsonValue | null } = {}, now = new Date()) {
  const c = o.counters ?? {};
  await db.syncRun.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: {
      status,
      finishedAt: now,
      heartbeatAt: now,
      coverage: o.coverage ?? null,
      errorCode: o.errorCode ?? null,
      errorMessage: o.errorMessage ? o.errorMessage.slice(0, 300) : null,
      ...(o.cursor !== undefined ? { cursor: o.cursor ?? undefined } : {}),
      ...(c.pages !== undefined ? { pages: c.pages } : {}),
      ...(c.fetched !== undefined ? { fetched: c.fetched } : {}),
      ...(c.reportedTotal !== undefined ? { reportedTotal: c.reportedTotal } : {}),
      ...(c.created !== undefined ? { createdCount: c.created } : {}),
      ...(c.duplicates !== undefined ? { duplicateCount: c.duplicates } : {}),
      ...(c.skipped !== undefined ? { skippedCount: c.skipped } : {}),
    },
  });
}

export const listRuns = (organizationId: string, source: { kind: SourceKind; id: string }, take = 20) =>
  db.syncRun.findMany({ where: { organizationId, sourceKind: source.kind, sourceId: source.id }, orderBy: { startedAt: "desc" }, take });
