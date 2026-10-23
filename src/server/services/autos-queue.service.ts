import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { assertCaseVisible } from "./case.service";
import { connectionForCase, importAutosMni } from "./mni.service";
import { resolveTenantContext } from "./tenant.service";
import { isUniqueViolation } from "./db-errors";
import { audit } from "./audit.service";
import { notify } from "./notification.service";
const countImported = (organizationId: string, caseId: string) => db.document.count({ where: { organizationId, caseId, externalKey: { startsWith: "mni:" }, deletedAt: null } });
const ACTIVE = ["QUEUED", "RUNNING", "RETRY"];
async function access(ctx: TenantContext, caseId: string, write = false) {
  assertCan(ctx, "cases:read"); assertCan(ctx, "documents:read");
  if (write) { assertCan(ctx, "cases:write"); assertCan(ctx, "documents:write"); }
  await assertCaseVisible(ctx, caseId);
}
export async function latestAutosJob(ctx: TenantContext, caseId: string) {
  await access(ctx, caseId);
  return db.autosDownloadJob.findFirst({ where: { organizationId: ctx.organizationId, caseId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, status: true, listed: true, imported: true, remaining: true, skipped: true, attempts: true, error: true, updatedAt: true, nextRunAt: true } });
}
export async function enqueueAutos(ctx: TenantContext, caseId: string) {
  await access(ctx, caseId, true);
  const c = await db.case.findFirstOrThrow({ where: { id: caseId, organizationId: ctx.organizationId } });
  if (c.confidential || !c.number) throw new ConflictError("A fila exige processo não sigiloso com número CNJ.");
  const connection = await connectionForCase(ctx, caseId);
  if (!connection) throw new ConflictError("Configure uma conexão compatível em Integrações.");
  const row = await db.courtConnection.findUniqueOrThrow({ where: { id: connection.id } });
  if (row.authProfile === "TJPR_SCMPP") throw new ConflictError("Este serviço fornece movimentações públicas, não autos digitais.");
  const existing = await db.autosDownloadJob.findFirst({ where: { organizationId: ctx.organizationId, caseId, status: { in: ACTIVE } } });
  if (existing) return existing.id;
  try {
    const initialCount = await countImported(ctx.organizationId, caseId);
    const job = await db.autosDownloadJob.create({ data: { organizationId: ctx.organizationId, caseId, userId: ctx.userId, initialCount } });
    await audit({ action: "autos.queue_created", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { jobId: job.id }, meta: ctx.meta });
    return job.id;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    return (await db.autosDownloadJob.findFirstOrThrow({ where: { organizationId: ctx.organizationId, caseId, status: { in: ACTIVE } } })).id;
  }
}
export async function retryAutos(ctx: TenantContext, caseId: string, id: string) {
  await access(ctx, caseId, true);
  const job = await db.autosDownloadJob.findFirst({ where: { id, caseId, organizationId: ctx.organizationId } });
  if (!job) throw new NotFoundError("Download não encontrado.");
  if (job.status !== "FAILED") throw new ConflictError("Só downloads com falha podem ser retomados.");
  try {
    const r = await db.autosDownloadJob.updateMany({ where: { id, status: "FAILED" }, data: { status: "QUEUED", userId: ctx.userId, attempts: 0, error: null, nextRunAt: new Date() } });
    if (!r.count) throw new ConflictError("O download já foi retomado.");
  } catch (e) { if (isUniqueViolation(e)) throw new ConflictError("Já existe outro download ativo deste processo."); throw e; }
  await audit({ action: "autos.queue_retry", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { jobId: id }, meta: ctx.meta });
}
/** Uma passagem de até 10 arquivos por chamada. Lease e token impedem dois workers de concluir o mesmo lote. */
export async function runAutosQueue(opts: { importer?: typeof importAutosMni; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const candidates = await db.autosDownloadJob.findMany({ where: { OR: [{ status: { in: ["QUEUED", "RETRY"] }, nextRunAt: { lte: now } }, { status: "RUNNING", leaseUntil: { lt: now } }] }, orderBy: { nextRunAt: "asc" }, take: 1 });
  let completed = 0, failed = 0, processed = 0;
  for (const job of candidates) {
    const token = randomUUID();
    const claimed = await db.autosDownloadJob.updateMany({ where: { id: job.id, status: job.status, leaseToken: job.leaseToken, updatedAt: job.updatedAt }, data: { status: "RUNNING", leaseToken: token, leaseUntil: new Date(now.getTime() + 15 * 60_000) } });
    if (!claimed.count) continue;
    processed++;
    try {
      const ctx = await resolveTenantContext(job.userId, job.organizationId, {});
      if (!ctx) throw new ConflictError("Acesso ao escritório indisponível.");
      await access(ctx, job.caseId, true);
      const excluded = new Set(job.excludedIds);
      const result = await (opts.importer ?? importAutosMni)(ctx, job.caseId, undefined, job.excludedIds, id => excluded.add(id), 10);
      const done = result.remaining === 0;
      const imported = Math.max(job.imported + result.imported, (await countImported(job.organizationId, job.caseId)) - job.initialCount);
      await db.$transaction(async tx => {
        const changed = await tx.autosDownloadJob.updateMany({ where: { id: job.id, leaseToken: token }, data: { status: done ? "COMPLETED" : "QUEUED", attempts: 0, listed: result.listed, imported, remaining: result.remaining, skipped: { increment: result.skippedSecret + result.skippedUnsupported + result.skippedTooBig }, excludedIds: [...excluded], error: null, nextRunAt: now, leaseUntil: null, leaseToken: null } });
        if (done && changed.count) await notify({ organizationId: job.organizationId, userId: job.userId, kind: "AUTOS_DOWNLOAD", title: "Download dos autos concluído", body: "Confira os documentos recebidos e os arquivos ignorados na página de autos.", link: `/processos/${job.caseId}/autos`, dedupeKey: `autos:${job.id}:complete` }, tx);
      });
      if (done) completed++;
    } catch {
      const imported = Math.max(job.imported, (await countImported(job.organizationId, job.caseId)) - job.initialCount);
      const attempts = job.attempts + 1;
      const terminal = attempts >= 3;
      // Nunca gravar corpo SOAP, senha ou erro externo potencialmente sensível na fila.
      await db.$transaction(async tx => {
        const changed = await tx.autosDownloadJob.updateMany({ where: { id: job.id, leaseToken: token }, data: { status: terminal ? "FAILED" : "RETRY", attempts, imported, error: terminal ? "Não foi possível concluir após 3 tentativas. Confira a conexão e as permissões e tente novamente." : "Falha ao consultar o tribunal. Nova tentativa agendada.", nextRunAt: new Date(now.getTime() + attempts * 60_000), leaseUntil: null, leaseToken: null } });
        if (terminal && changed.count) await notify({ organizationId: job.organizationId, userId: job.userId, kind: "AUTOS_DOWNLOAD", title: "Download dos autos precisa de atenção", link: `/processos/${job.caseId}/autos`, dedupeKey: `autos:${job.id}:failed` }, tx);
      });
      failed++;
    }
  }
  return { processed, completed, failed };
}
