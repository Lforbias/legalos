import { db } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate, dateToYmd } from "@/lib/dates/ymd";
import { DJEN_PAGE_SIZE, defaultHttp, djenBase, type DjenHttp } from "@/lib/djen/client";
import { createDjenAdapter } from "@/lib/djen/adapter";
import { djenHeader } from "@/lib/judicial/communication";
import type { EvidenceEnvironment, OperationFailure } from "@/lib/judicial/contracts";
import { coverageLevelOf, isLocalOrFakeUrl, type CoverageLevel } from "@/lib/judicial/evidence";
import { UFS } from "@/lib/mni/tribunals";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { onlyDigits } from "@/lib/validation/br-documents";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { requireMfa } from "./certificate.service";
import { isUniqueViolation } from "./db-errors";
import { assignNoticeToTeam } from "./inbox-flow.service";
import { assignNotice } from "./notice.service";
import { resolveTenantContext } from "./tenant.service";
import { ingestCommunication } from "@/server/judicial/communication-ingest";
import { recordEvidence } from "@/server/judicial/evidence.service";
import { ensureProfessional } from "@/server/judicial/professional.service";
import { finishRun, heartbeat, recoverInterruptedRuns, startRun, type RunTrigger } from "@/server/judicial/sync-engine";

/**
 * Box 3.0: o DJEN (Diário de Justiça Eletrônico Nacional, CNJ) é fonte pública — consulta por OAB/UF, sem
 * certificado, sem sessão autenticada em tribunal — e por isso também NÃO depende de `BOX_AVAILABLE`, que
 * permanece reservado ao Box autenticado (PJe/eproc, certificados, sessões) e segue retirado. O motor de
 * sincronização abaixo (trava por execução, checkpoint por página, evidência por operação) já é o padrão de
 * orquestração única do Box 3.0: grava evidência via `recordEvidence` a cada página/resultado real, nunca
 * marca sucesso de janela parcial como completa, e distingue transporte injetado/local (SIMULATED) de
 * resposta real do DJEN (PRODUCTION). Mantido no formato de chamadas diretas a `recordEvidence` (em vez do
 * `runCapability` usado pelo DataJud) porque esta sincronização grava várias evidências por execução
 * (checkAvailability na primeira página, listNotices por página/falha, listNotices final) dentro do mesmo
 * laço com checkpoint — refatorar para uma única chamada de `runCapability` encobriria esse detalhamento
 * sem necessidade; o ponto de centralização real é `recordEvidence`, usado por ambos.
 */
export type MonitorRow = { id: string; label: string; oabNumber: string; oabUf: string; enabled: boolean; lastSyncAt: Date | null; lastStatus: string | null; lastMessage: string | null; defaultAssigneeId: string | null; defaultTeamId: string | null; professionalId: string | null; lastSuccessAt: Date | null; lastCaptureAt: Date | null; firstVerifiedAt: Date | null };

/** Já existe uma sincronização desta fonte em andamento (trava). Não é falha da fonte: não altera o estado do monitoramento. */
export class SyncBusyError extends ConflictError {
  constructor() {
    super("Já existe uma sincronização desta OAB em andamento. Aguarde alguns instantes.");
    this.name = "SyncBusyError";
  }
}

/** A fonte respondeu com falha (com o código, para a tela explicar em linguagem simples). */
export class SyncFailedError extends ConflictError {
  constructor(message: string, public readonly failureCode: string) {
    super(message);
    this.name = "SyncFailedError";
  }
}

const OVERLAP_DAYS = 2;
const FIRST_SYNC_DAYS = 7;
const MAX_DAYS = 30;

export async function listMonitors(ctx: TenantContext): Promise<MonitorRow[]> {
  assertCan(ctx, "integrations:manage");
  return db.djenMonitor.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, label: true, oabNumber: true, oabUf: true, enabled: true, lastSyncAt: true, lastStatus: true, lastMessage: true, defaultAssigneeId: true, defaultTeamId: true, professionalId: true, lastSuccessAt: true, lastCaptureAt: true, firstVerifiedAt: true } });
}

export async function createMonitor(ctx: TenantContext, input: { label: string; oabNumber: string; oabUf: string }) {
  assertCan(ctx, "integrations:manage");
  const label = input.label.trim();
  if (label.length < 2 || label.length > 80) throw new ValidationError("Dê um nome ao monitoramento (2 a 80 caracteres).", { label: ["Nome inválido."] });
  const oabNumber = onlyDigits(input.oabNumber).replace(/^0+/, "");
  if (!/^[0-9]{1,7}$/.test(oabNumber)) throw new ValidationError("Informe o número da OAB (somente dígitos, até 7).", { oabNumber: ["Número inválido."] });
  const oabUf = input.oabUf.trim().toUpperCase();
  if (!UFS.includes(oabUf)) throw new ValidationError("Selecione a seccional (UF) da OAB.", { oabUf: ["UF inválida."] });
  try {
    const prof = await ensureProfessional(ctx.organizationId, { name: label, oabNumber, oabUf }, ctx.userId);
    const m = await db.djenMonitor.create({ data: { organizationId: ctx.organizationId, label, oabNumber, oabUf, createdById: ctx.userId, professionalId: prof.id }, select: { id: true } });
    await audit({ action: "djen.monitor_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "djen_monitor", resourceId: m.id, metadata: { oabUf }, meta: ctx.meta });
    return m;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("Essa OAB já está sendo monitorada.", { oabNumber: ["Essa OAB já está sendo monitorada."] });
    throw e;
  }
}

/** Define quem recebe as publicações novas deste monitoramento: um membro, uma equipe, ou ninguém (vão para a Entrada). */
export async function setMonitorRecipients(ctx: TenantContext, id: string, input: { userId?: string | null; teamId?: string | null }) {
  assertCan(ctx, "integrations:manage");
  const userId = input.userId || null;
  const teamId = input.teamId || null;
  if (userId && teamId) throw new ValidationError("Escolha um membro OU uma equipe, não os dois.", { userId: ["Escolha um membro ou uma equipe."] });
  if (userId) {
    const ok = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId, status: "ACTIVE", role: { permissions: { has: "inbox:read" } } }, select: { userId: true } });
    if (!ok) throw new ValidationError("Este membro não está ativo ou não tem acesso à caixa de entrada.", { userId: ["Escolha um membro com acesso à caixa de entrada."] });
  }
  if (teamId) {
    const ok = await db.workTeam.findFirst({ where: { id: teamId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!ok) throw new ValidationError("Equipe inválida.", { teamId: ["Selecione uma equipe."] });
  }
  const r = await db.djenMonitor.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { defaultAssigneeId: userId, defaultTeamId: teamId } });
  if (r.count !== 1) throw new NotFoundError("Monitoramento não encontrado.");
  await audit({ action: "djen.monitor_recipients", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "djen_monitor", resourceId: id, metadata: { userId, teamId }, meta: ctx.meta });
}

export async function setMonitorEnabled(ctx: TenantContext, id: string, enabled: boolean) {
  assertCan(ctx, "integrations:manage");
  const r = await db.djenMonitor.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { enabled } });
  if (r.count !== 1) throw new NotFoundError("Monitoramento não encontrado.");
  await audit({ action: enabled ? "djen.monitor_enable" : "djen.monitor_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "djen_monitor", resourceId: id, meta: ctx.meta });
}

export async function deleteMonitor(ctx: TenantContext, id: string) {
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const r = await db.djenMonitor.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Monitoramento não encontrado.");
  await audit({ action: "djen.monitor_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "djen_monitor", resourceId: id, meta: ctx.meta });
}

export type DjenSyncResult = {
  found: number;
  imported: number;
  alreadyKnown: number;
  cancelled: number;
  skipped: number;
  from: string;
  to: string;
  /** true = a janela inteira foi lida até o fim. false = leitura parcial (a janela NÃO avançou; a próxima execução retoma). */
  complete: boolean;
  coverage: CoverageLevel;
  runId: string;
  pages: number;
  reportedTotal: number | null;
};

const MAX_PAGES_PER_RUN = 40;

/** Estado de retomada guardado no monitoramento: só vale para a MESMA janela (a paginação depende dela). */
type Checkpoint = { from: string; to: string; nextPage: number; fetched: number; created: number; known: number; cancelled: number; skipped: number; pages: number };
const asCheckpoint = (v: unknown): Checkpoint | null => {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null);
  const [fetched, created, known, cancelled, skipped, pages, nextPage] = [n(o.fetched), n(o.created), n(o.known), n(o.cancelled), n(o.skipped), n(o.pages), n(o.nextPage)];
  if (typeof o.from !== "string" || typeof o.to !== "string" || nextPage === null || nextPage < 1) return null;
  return { from: o.from, to: o.to, nextPage, fetched: fetched ?? 0, created: created ?? 0, known: known ?? 0, cancelled: cancelled ?? 0, skipped: skipped ?? 0, pages: pages ?? 0 };
};

export type SyncOptions = { days?: number; http?: DjenHttp; pauseMs?: number; trigger?: RunTrigger; evidenceEnvironment?: EvidenceEnvironment; now?: Date };

/**
 * Sincroniza UM monitoramento do DJEN usando o motor de execuções:
 *  - trava: só uma execução por OAB por vez (concorrência não duplica nem corrompe);
 *  - checkpoint por página: se o processo cair, a próxima execução retoma da página onde parou;
 *  - a janela só avança quando TODAS as páginas foram lidas e a contagem bate com o total informado pela fonte;
 *  - cada resultado vira evidência (inclusive falhas); respostas de transporte injetado nunca contam como prova real.
 */
export async function syncDjen(ctx: TenantContext, monitorId: string, opts: SyncOptions = {}): Promise<DjenSyncResult> {
  // `assertCan`/`can()` zeram qualquer permissão `inbox:*` enquanto BOX_AVAILABLE for falso (retirada do Box
  // autenticado). O DJEN é público e faz parte do Box 3.0, por isso a verificação aqui é a permissão bruta do
  // cargo (mesmo padrão já usado em src/server/judicial/box-v3.service.ts e em src/app/(dashboard)/box-v3/*).
  if (!ctx.permissions.has("inbox:write")) throw new ForbiddenError();
  const m = await db.djenMonitor.findFirst({ where: { id: monitorId, organizationId: ctx.organizationId } });
  if (!m) throw new NotFoundError("Monitoramento não encontrado.");
  const now = opts.now ?? new Date();
  const today = todayYmd(ctx.timezone, now);
  const requested = opts.days && opts.days > 0 ? Math.min(opts.days, MAX_DAYS) : null;
  let from = requested ? addDays(today, -requested) : m.lastWindowEnd ? addDays(dateToYmd(m.lastWindowEnd), -OVERLAP_DAYS) : addDays(today, -FIRST_SYNC_DAYS);
  let startPage = 1;
  let acc: Omit<Checkpoint, "from" | "to" | "nextPage"> = { fetched: 0, created: 0, known: 0, cancelled: 0, skipped: 0, pages: 0 };
  const cp = requested ? null : asCheckpoint(m.checkpoint);
  if (cp) {
    // retoma só se a janela for a mesma; senão recomeça a partir da data mais antiga ainda não concluída (idempotência cobre o reprocesso)
    if (cp.to === today) {
      from = cp.from;
      startPage = cp.nextPage;
      acc = { fetched: cp.fetched, created: cp.created, known: cp.known, cancelled: cp.cancelled, skipped: cp.skipped, pages: cp.pages };
    } else if (cp.from < from) {
      from = cp.from;
    }
  }
  // transporte injetado (testes) ou DJEN_API_BASE apontando para servidor local/fictício: nunca prova o DJEN real
  const environment: EvidenceEnvironment = opts.evidenceEnvironment ?? (opts.http || isLocalOrFakeUrl(djenBase()) ? "SIMULATED" : "PRODUCTION");
  const source = { kind: "DJEN" as const, id: m.id, organizationId: ctx.organizationId };

  const started = await startRun(source, opts.trigger ?? "MANUAL", { windowFrom: ymdToDate(from), windowTo: ymdToDate(today), cursor: { from, to: today, nextPage: startPage } }, now);
  if (started.locked) throw new SyncBusyError();
  const run = started.run;

  // identidade profissional: monitoramentos antigos podem não ter (a migração cobre os existentes; isto cobre qualquer exceção)
  let professionalId = m.professionalId;
  if (!professionalId) {
    professionalId = (await ensureProfessional(ctx.organizationId, { name: m.label, oabNumber: m.oabNumber, oabUf: m.oabUf }, m.createdById)).id;
    await db.djenMonitor.update({ where: { id: m.id }, data: { professionalId } });
  }

  const adapter = createDjenAdapter(opts.http ?? defaultHttp, { pauseMs: opts.pauseMs });
  const oab = `${m.oabUf} ${m.oabNumber}`;
  let { fetched, created, known, cancelled, skipped, pages } = acc;
  let reportedTotal: number | null = null;
  let page = startPage;
  let complete = false;
  let firstPageOk = false;

  const evidence = (operation: "checkAvailability" | "listNotices", outcome: "PASSED" | "FAILED" | "INCONCLUSIVE", reasonCode: string | null, summary: string, details: Record<string, unknown> = {}) =>
    recordEvidence({ organizationId: ctx.organizationId, source: { kind: "DJEN", id: m.id }, connectorKey: "djen", operation, accessMethod: "PUBLIC", environment, outcome, reasonCode, summary, details, runId: run.id }, now);

  const failRun = async (f: OperationFailure): Promise<never> => {
    const checkpoint = { from, to: today, nextPage: page, fetched, created, known, cancelled, skipped, pages };
    await finishRun(run.id, "FAILED", { counters: { pages, fetched, reportedTotal, created, duplicates: known, skipped }, errorCode: f.code, errorMessage: f.message, cursor: checkpoint }, now);
    await db.djenMonitor.update({ where: { id: m.id }, data: { lastSyncAt: now, lastStatus: "ERROR", lastMessage: f.message.slice(0, 300), checkpoint: checkpoint as never } });
    if (!firstPageOk && page === startPage) await evidence("checkAvailability", "FAILED", f.code, f.message.slice(0, 200));
    await evidence("listNotices", "FAILED", f.code, f.message.slice(0, 200), { page, from, to: today });
    throw new SyncFailedError(f.message, f.code);
  };

  try {
    for (; page < startPage + MAX_PAGES_PER_RUN; page++) {
      const r = await adapter.listNotices!({ oabNumber: m.oabNumber, oabUf: m.oabUf, from, to: today, page, pageSize: DJEN_PAGE_SIZE });
      if (!r.ok) return await failRun(r);
      if (!firstPageOk && page === startPage) {
        firstPageOk = true;
        await evidence("checkAvailability", "PASSED", null, "O serviço respondeu com o formato esperado.", { latencyOk: true });
      }
      pages++;
      fetched += r.rawCount;
      skipped += r.unparsed;
      if (r.reportedTotal !== null) reportedTotal = r.reportedTotal;
      for (const c of r.items) {
        if (c.cancelled) {
          cancelled++;
          continue;
        }
        const out = await ingestCommunication(ctx, c, { receivedOn: today, header: djenHeader(c, oab), professionalId, syncRunId: run.id, capturedAt: now, evidence: { page, windowFrom: from, windowTo: today } });
        if (out.outcome === "KNOWN") {
          known++;
          continue;
        }
        created++;
        if (!out.duplicateContent && (m.defaultAssigneeId || m.defaultTeamId)) {
          // distribuir é conveniência: se falhar (ex.: o membro perdeu o acesso), a publicação continua na Entrada
          try {
            if (m.defaultAssigneeId) await assignNotice(ctx, out.noticeId, { userId: m.defaultAssigneeId });
            else if (m.defaultTeamId) await assignNoticeToTeam(ctx, out.noticeId, m.defaultTeamId);
          } catch {
            /* fica na Entrada */
          }
        }
      }
      // checkpoint a cada página: sinal de vida + onde retomar
      await heartbeat(run.id, { cursor: { from, to: today, nextPage: page + 1 }, counters: { pages, fetched, reportedTotal, created, duplicates: known, skipped } }, new Date());
      await db.djenMonitor.update({ where: { id: m.id }, data: { checkpoint: { from, to: today, nextPage: page + 1, fetched, created, known, cancelled, skipped, pages } as never } });
      if (!r.hasMore) {
        complete = true;
        page++;
        break;
      }
    }
  } catch (e) {
    if (e instanceof ConflictError) throw e;
    // erro inesperado (banco, etc.): a execução não pode ficar "em andamento" para sempre
    await finishRun(run.id, "FAILED", { counters: { pages, fetched, reportedTotal, created, duplicates: known, skipped }, errorCode: "INTERNAL", errorMessage: "Falha interna ao gravar as publicações." }, now);
    await db.djenMonitor.update({ where: { id: m.id }, data: { lastSyncAt: now, lastStatus: "ERROR", lastMessage: "Falha interna ao gravar as publicações." } });
    throw e;
  }

  // a fonte informou um total maior do que o recebido → leitura incompleta, mesmo que as páginas tenham acabado
  const shortfall = complete && reportedTotal !== null && fetched < reportedTotal;
  const wholeWindow = complete && !shortfall;
  const partial = !wholeWindow;
  const everCaptured = await db.courtNotice.count({ where: { organizationId: ctx.organizationId, originKind: "DJEN_PUBLICATION", deletedAt: null } });
  const coverage = coverageLevelOf({ reachable: true, queryCompleted: wholeWindow, partial, itemsEverCaptured: everCaptured });
  const found = fetched - skipped;
  const why = !complete ? "A janela tem resultados demais para uma execução; a próxima continua de onde parou." : shortfall ? `O DJEN informou ${reportedTotal} publicação(ões) e entregou ${fetched}; a janela será relida.` : "";
  const message = partial ? why : `${found} publicação(ões) de ${from} a ${today}; ${created} nova(s).`;
  const checkpoint = partial ? { from, to: today, nextPage: complete ? 1 : page, fetched: complete ? 0 : fetched, created: complete ? 0 : created, known: complete ? 0 : known, cancelled: complete ? 0 : cancelled, skipped: complete ? 0 : skipped, pages: complete ? 0 : pages } : null;

  await finishRun(run.id, partial ? "PARTIAL" : "SUCCEEDED", { counters: { pages, fetched, reportedTotal, created, duplicates: known, skipped }, coverage, errorCode: partial ? (shortfall ? "COUNT_MISMATCH" : "WINDOW_TOO_LARGE") : null, errorMessage: partial ? why : null, cursor: (checkpoint ?? null) as never }, now);
  await evidence("listNotices", partial ? "INCONCLUSIVE" : "PASSED", partial ? (shortfall ? "COUNT_MISMATCH" : "WINDOW_TOO_LARGE") : null, message.slice(0, 200), { pages, fetched, reportedTotal, created, known, skipped, cancelled, from, to: today });

  const verified = !partial && environment === "PRODUCTION";
  await db.djenMonitor.update({
    where: { id: m.id },
    data: {
      lastSyncAt: now,
      lastStatus: partial ? "PARTIAL" : "OK",
      lastMessage: message.slice(0, 300),
      checkpoint: (checkpoint ?? null) as never,
      ...(wholeWindow ? { lastWindowEnd: ymdToDate(today), lastSuccessAt: now } : {}),
      ...(created > 0 ? { lastCaptureAt: now } : {}),
      ...(verified && !m.firstVerifiedAt ? { firstVerifiedAt: now } : {}),
    },
  });
  await audit({ action: "djen.sync", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "djen_monitor", resourceId: m.id, metadata: { found, imported: created, from, to: today, complete: wholeWindow, runId: run.id }, meta: ctx.meta });
  return { found, imported: created, alreadyKnown: known, cancelled, skipped, from, to: today, complete: wholeWindow, coverage, runId: run.id, pages, reportedTotal };
}

/** Execução automática (chamada pelo agendador externo): sincroniza todos os monitoramentos ligados, cada um com o contexto de quem o criou. */
export async function runDjenAll(opts: { http?: DjenHttp; pauseMs?: number } = {}) {
  await recoverInterruptedRuns(); // execuções que pararam de dar sinal de vida não podem travar a fonte
  const monitors = await db.djenMonitor.findMany({ where: { enabled: true, organization: { deletedAt: null, suspendedAt: null } }, select: { id: true, organizationId: true, createdById: true }, orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } } });
  const out = { total: monitors.length, ok: 0, failed: 0, busy: 0, partial: 0, imported: 0 };
  for (const mon of monitors) {
    try {
      const ctx = await resolveTenantContext(mon.createdById, mon.organizationId, {});
      if (!ctx || !ctx.permissions.has("inbox:write")) {
        await db.djenMonitor.update({ where: { id: mon.id }, data: { lastSyncAt: new Date(), lastStatus: "ERROR", lastMessage: "Quem criou este monitoramento não tem mais acesso à caixa de entrada." } });
        out.failed++;
        continue;
      }
      const r = await syncDjen(ctx, mon.id, { ...opts, trigger: "CRON" });
      if (r.complete) out.ok++;
      else out.partial++;
      out.imported += r.imported;
    } catch (e) {
      if (e instanceof SyncBusyError) out.busy++;
      else out.failed++; // o motivo já ficou gravado no monitoramento
    }
  }
  return out;
}


