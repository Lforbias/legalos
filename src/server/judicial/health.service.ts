import { db } from "@/lib/db/client";
import { certificateAlerts, HEALTH_ALERT_CODES, jobAlert, SEVERITY_ORDER, sourceAlerts, sourceHeadline, worstSeverity, type AlertCandidate, type AlertSeverity, type SourceAlertInput } from "@/lib/judicial/alerts";
import { detectSilence, evaluateFreshness, evaluateJobFreshness, isRunInterrupted, SOURCE_POLICIES, type FreshnessLevel, type SourceKind } from "@/lib/judicial/health-policy";
import { JOBS, type JobKey } from "@/server/job-runs";
import { assertCan, type TenantContext } from "@/server/context";
import { NotFoundError } from "@/lib/permissions/check";
import { audit } from "@/server/services/audit.service";
import { boxV2Enabled } from "@/lib/features";
import { notify } from "@/server/services/notification.service";

/** Falhas de autenticação que só uma pessoa resolve (senha, 2º fator, captcha, login expirado). */
const NEEDS_PERSON_CODES = new Set(["AUTH_REJECTED", "AUTH_REQUIRED", "AUTH_EXPIRED", "NEEDS_PERSON"]);
const NEEDS_ACTION_TEXT: Record<string, string> = {
  AUTH_REJECTED: "O tribunal recusou o acesso. Confira o login, a senha ou o certificado e atualize o acesso.",
  AUTH_REQUIRED: "Falta uma autorização para este acesso (login, 2º fator ou certificado).",
  AUTH_EXPIRED: "A autenticação deste acesso expirou. Renove o acesso.",
  NEEDS_PERSON: "O tribunal pediu uma verificação que só uma pessoa pode fazer (captcha, código ou desbloqueio da conta).",
};

export type SourceHealthRow = SourceAlertInput & {
  detail: string;
  lastSyncAt: Date | null;
  lastSuccessAt: Date | null;
  lastCaptureAt: Date | null;
  firstVerifiedAt: Date | null;
  severity: AlertSeverity | "OK";
  headline: string;
  /** Há uma execução em andamento agora. */
  runningSince: Date | null;
};

const DAY = 86_400_000;

async function captureTimes(organizationId: string, professionalId: string | null, now: Date): Promise<Date[]> {
  const rows = await db.courtNotice.findMany({
    where: { organizationId, originKind: "DJEN_PUBLICATION", deletedAt: null, ...(professionalId ? { professionalId } : {}), createdAt: { gte: new Date(now.getTime() - 90 * DAY) } },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map((r) => r.createdAt);
}

/** Falhas SEGUIDAS mais recentes (uma execução bem-sucedida zera). */
function leadingFailures(statuses: readonly string[]): number {
  let n = 0;
  for (const st of statuses) {
    if (st === "RUNNING") continue;
    if (st === "FAILED" || st === "INTERRUPTED") n++;
    else break;
  }
  return n;
}

export async function getSourceHealth(organizationId: string, now = new Date()): Promise<SourceHealthRow[]> {
  const [monitors, connections, accesses] = await Promise.all([
    db.djenMonitor.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    db.courtConnection.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, label: true, jtr: true, system: true, enabled: true, createdAt: true, lastSyncAt: true, lastStatus: true, lastMessage: true } }),
    db.portalAccess.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, label: true, target: true, enabled: true, createdAt: true, status: true, statusMessage: true, lastLoginAt: true, lastSyncAt: true } }),
  ]);
  const rows: SourceHealthRow[] = [];

  for (const m of monitors) {
    const runs = await db.syncRun.findMany({ where: { organizationId, sourceKind: "DJEN", sourceId: m.id }, orderBy: { startedAt: "desc" }, take: 10, select: { status: true, heartbeatAt: true, startedAt: true } });
    const open = runs.find((r) => r.status === "RUNNING");
    const lastSuccessAt = m.lastSuccessAt ?? (m.lastStatus === "OK" ? m.lastSyncAt : null);
    const fresh = evaluateFreshness({ policy: SOURCE_POLICIES.DJEN, enabled: m.enabled, createdAt: m.createdAt, lastSuccessAt, now });
    const times = await captureTimes(organizationId, m.professionalId, now);
    const silence = m.enabled ? detectSilence({ captureTimes: times, lastCaptureAt: m.lastCaptureAt ?? times[0] ?? null, now, policy: SOURCE_POLICIES.DJEN }) : null;
    const base: SourceAlertInput & { lastCaptureAt: Date | null } = {
      kind: "DJEN", id: m.id, label: m.label, enabled: m.enabled, freshness: fresh.level, minutesSinceSuccess: fresh.level === "OFF" ? null : fresh.minutes,
      lastStatus: m.lastStatus, lastMessage: m.lastMessage, consecutiveFailures: leadingFailures(runs.map((r) => r.status)),
      silence: silence ? { silent: silence.silent, daysSinceLast: silence.daysSinceLast, typicalGapDays: silence.typicalGapDays } : null,
      interruptedRun: Boolean(open && isRunInterrupted(open.heartbeatAt, now)),
      unverified: m.enabled && lastSuccessAt !== null && m.firstVerifiedAt === null,
      lastCaptureAt: m.lastCaptureAt,
    };
    const alerts = sourceAlerts(base);
    rows.push({ ...base, detail: `OAB ${m.oabNumber}/${m.oabUf}`, lastSyncAt: m.lastSyncAt, lastSuccessAt, firstVerifiedAt: m.firstVerifiedAt, severity: worstSeverity(alerts), headline: sourceHeadline(base), runningSince: open?.startedAt ?? null });
  }

  for (const c of connections) {
    const ev = await db.connectorEvidence.findMany({ where: { organizationId, sourceKind: "MNI", sourceId: c.id, operation: "listNotices" }, orderBy: { checkedAt: "desc" }, take: 10, select: { outcome: true, reasonCode: true, checkedAt: true } });
    const lastPass = ev.find((e) => e.outcome === "PASSED");
    const lastSuccessAt = c.lastStatus === "OK" ? c.lastSyncAt : (lastPass?.checkedAt ?? null);
    const fresh = evaluateFreshness({ policy: SOURCE_POLICIES.MNI, enabled: c.enabled, createdAt: c.createdAt, lastSuccessAt, now });
    let failures = 0;
    for (const e of ev) {
      if (e.outcome === "FAILED") failures++;
      else break;
    }
    const lastFail = ev[0]?.outcome === "FAILED" ? ev[0].reasonCode : null;
    const needsAction = lastFail && NEEDS_PERSON_CODES.has(lastFail) ? (NEEDS_ACTION_TEXT[lastFail] ?? null) : null;
    const base: SourceAlertInput & { lastCaptureAt: Date | null } = {
      kind: "MNI", id: c.id, label: c.label, enabled: c.enabled, freshness: fresh.level, minutesSinceSuccess: fresh.level === "OFF" ? null : fresh.minutes,
      lastStatus: c.lastStatus, lastMessage: c.lastMessage, consecutiveFailures: failures, silence: null, interruptedRun: false, unverified: false, needsAction, lastCaptureAt: null,
    };
    rows.push({ ...base, detail: `Tribunal ${c.jtr}`, lastSyncAt: c.lastSyncAt, lastSuccessAt, firstVerifiedAt: null, severity: worstSeverity(sourceAlerts(base)), headline: sourceHeadline(base), runningSince: null });
  }

  for (const a of accesses) {
    // O robô de portal hoje só valida o login sob demanda: a saúde dele é o estado do acesso, não "frescor" de captura.
    const needsAction = a.enabled && (a.status === "NEEDS_ACTION" || a.status === "ERROR") ? (a.statusMessage ?? "O acesso ao portal precisa de atenção.") : null;
    const base: SourceAlertInput & { lastCaptureAt: Date | null } = {
      kind: "PORTAL", id: a.id, label: a.label, enabled: a.enabled, freshness: a.enabled ? "OK" : "OFF", minutesSinceSuccess: a.lastLoginAt ? Math.floor((now.getTime() - a.lastLoginAt.getTime()) / 60_000) : null,
      lastStatus: a.status, lastMessage: a.statusMessage, consecutiveFailures: 0, silence: null, interruptedRun: false, unverified: false, needsAction, lastCaptureAt: null,
    };
    const headline = !a.enabled ? "Desligado." : a.status === "CONNECTED" ? "Login conferido. A leitura automática de intimações deste portal ainda não está implementada." : (needsAction ?? "Aguardando o teste de login.");
    rows.push({ ...base, detail: `Portal ${a.target}`, lastSyncAt: a.lastSyncAt, lastSuccessAt: a.lastLoginAt, firstVerifiedAt: null, severity: worstSeverity(sourceAlerts(base)), headline, runningSince: null });
  }
  return rows;
}

export type JobHealthRow = { key: JobKey; label: string; everyMin: number; level: "OK" | "LATE" | "STALLED"; minutesLate: number; lastOkAt: Date | null; lastStatus: string | null };

/** Rotinas agendadas: a "última boa" é o início da última execução que terminou OK. */
export async function getJobHealth(keys: readonly JobKey[], now = new Date()): Promise<JobHealthRow[]> {
  const out: JobHealthRow[] = [];
  for (const key of keys) {
    const [ok, last] = await Promise.all([
      db.jobRun.findFirst({ where: { job: key, status: "OK" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
      db.jobRun.findFirst({ where: { job: key }, orderBy: { startedAt: "desc" }, select: { status: true } }),
    ]);
    const f = evaluateJobFreshness({ everyMin: JOBS[key].everyMin, lastStartedAt: ok?.startedAt ?? null, now });
    out.push({ key, label: JOBS[key].label, everyMin: JOBS[key].everyMin, level: f.level, minutesLate: f.minutesLate, lastOkAt: ok?.startedAt ?? null, lastStatus: last?.status ?? null });
  }
  return out;
}

export type OrgHealth = { sources: SourceHealthRow[]; jobs: JobHealthRow[]; candidates: AlertCandidate[]; severity: AlertSeverity | "OK" };

/** Calcula (sem gravar) tudo que está errado agora para um escritório. */
export async function computeOrgHealth(organizationId: string, opts: { now?: Date; includeJobs?: boolean } = {}): Promise<OrgHealth> {
  const now = opts.now ?? new Date();
  const sources = await getSourceHealth(organizationId, now);
  const certs = await db.certificate.findMany({ where: { organizationId, revokedAt: null }, select: { id: true, label: true, notAfter: true, revokedAt: true } });
  const wanted: JobKey[] = [];
  if (sources.some((s) => s.kind === "DJEN" && s.enabled)) wanted.push("djen");
  if (sources.some((s) => s.kind === "MNI" && s.enabled)) wanted.push("mni");
  if (sources.some((s) => s.kind === "PORTAL" && s.enabled)) wanted.push("robots");
  const jobs = opts.includeJobs === false ? [] : await getJobHealth(wanted, now);
  const candidates: AlertCandidate[] = [
    ...sources.flatMap((s) => sourceAlerts(s)),
    ...certs.flatMap((c) => certificateAlerts(c, now)),
    ...jobs.flatMap((j) => jobAlert(j)),
  ];
  return { sources, jobs, candidates, severity: worstSeverity(candidates) };
}

export type ReconcileResult = { opened: number; escalated: number; resolved: number; notified: number };

/** Grava os alertas atuais, reabre os que voltaram, resolve os que sumiram e avisa os administradores (sem repetir). */
export async function reconcileAlerts(organizationId: string, candidates: readonly AlertCandidate[], now = new Date()): Promise<ReconcileResult> {
  const res: ReconcileResult = { opened: 0, escalated: 0, resolved: 0, notified: 0 };
  const admins = (await db.membership.findMany({ where: { organizationId, status: "ACTIVE", role: { permissions: { has: "integrations:manage" } } }, select: { userId: true } })).map((r) => r.userId);
  const existing = await db.healthAlert.findMany({ where: { organizationId, code: { in: [...HEALTH_ALERT_CODES] } } });
  const byKey = new Map(existing.map((e) => [e.dedupeKey, e]));
  const seen = new Set<string>();

  for (const c of candidates) {
    seen.add(c.dedupeKey);
    const cur = byKey.get(c.dedupeKey);
    const data = { code: c.code, severity: c.severity, title: c.title.slice(0, 200), body: c.body.slice(0, 500), sourceKind: c.sourceKind, sourceId: c.sourceId, details: c.details as never, lastSeenAt: now };
    let alert = cur;
    let notifyNow = false;
    if (!cur) {
      alert = await db.healthAlert.create({ data: { ...data, organizationId, dedupeKey: c.dedupeKey, firstSeenAt: now } });
      res.opened++;
      notifyNow = true;
    } else if (cur.state === "RESOLVED") {
      alert = await db.healthAlert.update({ where: { id: cur.id }, data: { ...data, state: "OPEN", occurrences: 1, firstSeenAt: now, resolvedAt: null, acknowledgedAt: null, acknowledgedById: null } });
      res.opened++;
      notifyNow = true;
    } else {
      const escalated = SEVERITY_ORDER[c.severity as AlertSeverity] > SEVERITY_ORDER[cur.severity as AlertSeverity];
      alert = await db.healthAlert.update({ where: { id: cur.id }, data: { ...data, occurrences: { increment: 1 }, ...(escalated ? { state: "OPEN", acknowledgedAt: null, acknowledgedById: null } : {}) } });
      if (escalated) {
        res.escalated++;
        notifyNow = true;
      }
    }
    // só avisa quando abre ou escala, e só para aviso/crítico (informativos ficam na tela)
    if (notifyNow && alert && c.severity !== "INFO" && admins.length) {
      res.notified += await notify(
        admins.map((userId) => ({ organizationId, userId, kind: "MONITORING_ALERT", title: c.title, body: c.body, link: "/box/saude", dedupeKey: `health:${alert!.id}:${alert!.firstSeenAt.getTime()}:${c.severity}` })),
      );
    }
  }
  for (const e of existing) {
    if (e.state !== "RESOLVED" && !seen.has(e.dedupeKey)) {
      await db.healthAlert.update({ where: { id: e.id }, data: { state: "RESOLVED", resolvedAt: now } });
      res.resolved++;
    }
  }
  return res;
}

/** Verificação periódica (agendador a cada 5 min). Sem `organizationId`, percorre todos os escritórios ativos que têm alguma fonte. */
export async function runHealthCheck(organizationId?: string, opts: { now?: Date; includeJobs?: boolean } = {}) {
  const now = opts.now ?? new Date();
  // Sem `organizationId` (agendador), só os escritórios com o Box 2.0 ligado entram: com a chave desligada, ninguém recebe aviso novo.
  const candidates = organizationId
    ? [{ id: organizationId }]
    : await db.organization.findMany({
        where: { deletedAt: null, suspendedAt: null, OR: [{ id: { in: (await db.djenMonitor.findMany({ select: { organizationId: true }, distinct: ["organizationId"] })).map((x) => x.organizationId) } }, { id: { in: (await db.courtConnection.findMany({ select: { organizationId: true }, distinct: ["organizationId"] })).map((x) => x.organizationId) } }, { id: { in: (await db.portalAccess.findMany({ select: { organizationId: true }, distinct: ["organizationId"] })).map((x) => x.organizationId) } }] },
        select: { id: true },
      });
  const orgs = organizationId ? candidates : candidates.filter((o) => boxV2Enabled(o.id));
  const total: ReconcileResult & { orgs: number } = { orgs: orgs.length, opened: 0, escalated: 0, resolved: 0, notified: 0 };
  for (const o of orgs) {
    const h = await computeOrgHealth(o.id, { now, includeJobs: opts.includeJobs });
    const r = await reconcileAlerts(o.id, h.candidates, now);
    total.opened += r.opened;
    total.escalated += r.escalated;
    total.resolved += r.resolved;
    total.notified += r.notified;
  }
  return total;
}

export async function listAlerts(ctx: TenantContext, opts: { includeResolved?: boolean } = {}) {
  assertCan(ctx, "integrations:manage");
  return db.healthAlert.findMany({
    where: { organizationId: ctx.organizationId, ...(opts.includeResolved ? {} : { state: { in: ["OPEN", "ACKNOWLEDGED"] } }) },
    orderBy: [{ lastSeenAt: "desc" }],
    take: 100,
    select: { id: true, code: true, severity: true, title: true, body: true, state: true, sourceKind: true, sourceId: true, occurrences: true, firstSeenAt: true, lastSeenAt: true, acknowledgedAt: true, resolvedAt: true, details: true },
  });
}

/** Execuções recentes das fontes (técnico: só administradores). */
export async function listRecentRuns(ctx: TenantContext, take = 15) {
  assertCan(ctx, "integrations:manage");
  return db.syncRun.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { startedAt: "desc" },
    take,
    select: { id: true, sourceKind: true, sourceId: true, trigger: true, status: true, startedAt: true, finishedAt: true, pages: true, fetched: true, createdCount: true, coverage: true, errorCode: true, errorMessage: true },
  });
}

export async function acknowledgeAlert(ctx: TenantContext, id: string) {
  assertCan(ctx, "integrations:manage");
  const r = await db.healthAlert.updateMany({ where: { id, organizationId: ctx.organizationId, state: "OPEN" }, data: { state: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: ctx.userId } });
  if (r.count !== 1) throw new NotFoundError("Alerta não encontrado ou já tratado.");
  await audit({ action: "health_alert.ack", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "health_alert", resourceId: id, meta: ctx.meta });
}

export type { FreshnessLevel, SourceKind };
