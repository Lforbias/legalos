/**
 * Painel do DEVELOPER (dono da plataforma). Mesmas regras do painel da plataforma:
 * só super-admin ativo COM 2FA; nunca devolve conteúdo de escritórios (nada de teor, e-mails de clientes, URLs completas,
 * chaves ou metadados de auditoria) — só contagens, estados, nomes de escritório e mensagens técnicas curtas e mascaradas.
 */
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { asaasConfigFromEnv } from "@/lib/billing/asaas";
import { datajudApiKey } from "@/lib/datajud/client";
import { db } from "@/lib/db/client";
import { defaultHttp, fetchDjen } from "@/lib/djen/client";
import { verifySmtpConnection } from "@/lib/mail/mailer";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { JOBS, sanitizeError, withJobRun, type JobKey } from "@/server/job-runs";
import { audit } from "./audit.service";
import { runDjenAll } from "./djen.service";
import { runMailOutbox } from "./mail-outbox.service";
import { runMniAll } from "./mni.service";
import { runDueSchedules } from "./petition-queue.service";
import { runMonitoringCheck } from "./monitoring.service";
import { assertPlatform, integrationsHealth, listPlatformAudit, type PlatformCtx } from "./platform.service";
import { runWebhookDeliveries } from "./webhook.service";
import { runSlaCheck } from "./chat-sla.service";
import { runChatExtras } from "./chat-extras.service";
import { runPushDue } from "./push.service";

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);

// ───────────────────────── Saúde e rotinas ─────────────────────────

export type JobState = "ok" | "error" | "stale" | "never" | "running";
export type JobRow = {
  key: JobKey; label: string; everyMin: number; manual: boolean; state: JobState;
  lastStartedAt: Date | null; lastDurationMs: number | null; lastOkAt: Date | null; lastError: string | null; lastSummary: Record<string, unknown> | null;
  runs24: number; errors24: number;
};

export async function jobsOverview(pc: PlatformCtx) {
  await assertPlatform(pc);
  const now = Date.now();
  const rows: JobRow[] = [];
  for (const [key, def] of Object.entries(JOBS) as [JobKey, (typeof JOBS)[JobKey]][]) {
    const [last, lastOk, runs24, errors24] = await Promise.all([
      db.jobRun.findFirst({ where: { job: key }, orderBy: { startedAt: "desc" } }),
      db.jobRun.findFirst({ where: { job: key, status: "OK" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
      db.jobRun.count({ where: { job: key, startedAt: { gte: ago(86_400_000) } } }),
      db.jobRun.count({ where: { job: key, status: "ERROR", startedAt: { gte: ago(86_400_000) } } }),
    ]);
    const lateAfter = Math.max(def.everyMin * 3, 15) * MIN;
    let state: JobState = "never";
    if (last) {
      const age = now - last.startedAt.getTime();
      if (last.status === "RUNNING") state = age > 15 * MIN ? "stale" : "running";
      else if (age > lateAfter) state = "stale";
      else state = last.status === "OK" ? "ok" : "error";
    }
    rows.push({
      key, label: def.label, everyMin: def.everyMin, manual: def.manual, state,
      lastStartedAt: last?.startedAt ?? null, lastDurationMs: last?.durationMs ?? null, lastOkAt: lastOk?.startedAt ?? null,
      lastError: last?.status === "ERROR" ? last.error : null, lastSummary: (last?.summary as Record<string, unknown> | null) ?? null, runs24, errors24,
    });
  }
  return { cronConfigured: Boolean(process.env.CRON_SECRET), jobs: rows };
}

export async function recentJobRuns(pc: PlatformCtx, job?: string, take = 30) {
  await assertPlatform(pc);
  const where = job && job in JOBS ? { job } : {};
  return db.jobRun.findMany({ where, orderBy: { startedAt: "desc" }, take: Math.min(take, 100), select: { id: true, job: true, trigger: true, status: true, startedAt: true, durationMs: true, summary: true, error: true } });
}

export async function systemOverview(pc: PlatformCtx) {
  await assertPlatform(pc);
  const h = await integrationsHealth(pc);
  const mem = process.memoryUsage();
  const [orgs, queueMail, queueHooks] = await Promise.all([
    db.organization.count({ where: { deletedAt: null } }),
    db.mailOutbox.count({ where: { status: "PENDING" } }),
    db.webhookDelivery.count({ where: { status: "PENDING" } }),
  ]);
  return {
    ...h.system,
    runtime: { node: process.version, env: process.env.NODE_ENV ?? "?", uptimeMin: Math.round(process.uptime() / 60), rssMb: Math.round(mem.rss / 1_048_576) },
    orgs, queueMail, queueHooks,
  };
}

/** Disparo manual de uma rotina (só as que não enviam nada a clientes). Uma por vez; auditado. */
export async function runJobManually(pc: PlatformCtx, job: string) {
  await assertPlatform(pc);
  if (!(job in JOBS) || !JOBS[job as JobKey].manual) throw new ValidationError("Esta rotina não pode ser disparada manualmente.");
  const key = job as JobKey;
  const running = await db.jobRun.findFirst({ where: { job: key, status: "RUNNING", startedAt: { gte: ago(10 * MIN) } }, select: { id: true } });
  if (running) throw new ConflictError("Esta rotina já está rodando. Aguarde terminar.");
  const fn: () => Promise<object> = { webhooks: () => runWebhookDeliveries(), mail: () => runMailOutbox(), djen: () => runDjenAll(), mni: () => runMniAll(), "chat-sla": () => runSlaCheck(), "chat-extras": () => runChatExtras(), "push-due": () => runPushDue(), "petition-queue": () => runDueSchedules(), monitoring: () => runMonitoringCheck() }[key as "webhooks" | "mail" | "djen" | "mni" | "chat-sla" | "chat-extras" | "push-due" | "petition-queue" | "monitoring"];
  await audit({ action: "platform.job_run", userId: pc.userId, resourceType: "job", metadata: { job: key }, meta: pc.meta });
  try {
    const r = await withJobRun<object>(key, "MANUAL", fn);
    return { ok: true as const, summary: Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === "number" || typeof v === "boolean")) };
  } catch (err) {
    return { ok: false as const, message: sanitizeError(err) };
  }
}

// ───────────────────────── API, chaves e webhooks ─────────────────────────

const host = (u: string) => { try { return new URL(u).host; } catch { return "endereço inválido"; } };

export async function apiOverview(pc: PlatformCtx) {
  await assertPlatform(pc);
  const now = new Date();
  const live = { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const [keysActive, keysRevoked, keysExpired, keysUnused30, byOrg, endpoints, hooksOff, problemEndpoints, delivered7, failed7, pending, overdue, failedList, mailGroups, mailFailed] = await Promise.all([
    db.apiKey.count({ where: live }),
    db.apiKey.count({ where: { revokedAt: { not: null } } }),
    db.apiKey.count({ where: { revokedAt: null, expiresAt: { lte: now } } }),
    db.apiKey.count({ where: { ...live, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: ago(30 * 86_400_000) } }] } }),
    db.apiKey.groupBy({ by: ["organizationId"], where: live, _count: { _all: true }, _max: { lastUsedAt: true } }),
    db.webhookEndpoint.count({ where: { deletedAt: null } }),
    db.webhookEndpoint.count({ where: { deletedAt: null, enabled: false } }),
    db.webhookEndpoint.findMany({ where: { deletedAt: null, OR: [{ enabled: false }, { consecutiveFailures: { gt: 0 } }] }, orderBy: { consecutiveFailures: "desc" }, take: 20, select: { name: true, url: true, enabled: true, disabledReason: true, consecutiveFailures: true, lastSuccessAt: true, organization: { select: { name: true } } } }),
    db.webhookDelivery.count({ where: { status: "SUCCEEDED", createdAt: { gte: ago(7 * 86_400_000) } } }),
    db.webhookDelivery.count({ where: { status: "FAILED", createdAt: { gte: ago(7 * 86_400_000) } } }),
    db.webhookDelivery.count({ where: { status: "PENDING" } }),
    db.webhookDelivery.count({ where: { status: "PENDING", nextAttemptAt: { lt: ago(15 * MIN) } } }),
    db.webhookDelivery.findMany({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, eventType: true, attempts: true, lastStatusCode: true, lastError: true, createdAt: true, endpoint: { select: { enabled: true, deletedAt: true } }, organizationId: true } }),
    db.mailOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
    db.mailOutbox.findMany({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, kind: true, attempts: true, lastError: true, createdAt: true } }),
  ]);
  const orgNames = new Map((await db.organization.findMany({ where: { id: { in: [...byOrg.map((o) => o.organizationId), ...failedList.map((f) => f.organizationId)] } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
  return {
    keys: { active: keysActive, revoked: keysRevoked, expired: keysExpired, unused30: keysUnused30, byOrg: byOrg.map((o) => ({ organization: orgNames.get(o.organizationId) ?? "—", active: o._count._all, lastUsedAt: o._max.lastUsedAt })).sort((a, b) => b.active - a.active).slice(0, 30) },
    webhooks: {
      endpoints, disabled: hooksOff, delivered7, failed7, pending, overdue,
      problems: problemEndpoints.map((e) => ({ organization: e.organization.name, name: e.name, host: host(e.url), enabled: e.enabled, disabledReason: e.disabledReason, failures: e.consecutiveFailures, lastSuccessAt: e.lastSuccessAt })),
      failedDeliveries: failedList.map((f) => ({ id: f.id, organization: orgNames.get(f.organizationId) ?? "—", eventType: f.eventType, attempts: f.attempts, statusCode: f.lastStatusCode, error: f.lastError ? sanitizeError(f.lastError).slice(0, 160) : null, createdAt: f.createdAt, retryable: Boolean(f.endpoint.enabled && !f.endpoint.deletedAt) })),
    },
    mail: { byStatus: Object.fromEntries(mailGroups.map((g) => [g.status, g._count._all])) as Record<string, number>, failed: mailFailed.map((m) => ({ id: m.id, kind: m.kind, attempts: m.attempts, error: m.lastError ? sanitizeError(m.lastError).slice(0, 160) : null, createdAt: m.createdAt })) },
  };
}

export async function retryDeliveryAsPlatform(pc: PlatformCtx, id: string) {
  await assertPlatform(pc);
  const d = await db.webhookDelivery.findUnique({ where: { id }, select: { organizationId: true } });
  const res = await db.webhookDelivery.updateMany({ where: { id, status: "FAILED", endpoint: { deletedAt: null, enabled: true } }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null } });
  if (res.count !== 1) throw new NotFoundError("Entrega não encontrada, já reenviada ou o webhook está desligado.");
  await audit({ action: "platform.webhook_retry", organizationId: d?.organizationId ?? null, userId: pc.userId, resourceType: "webhook_delivery", resourceId: id, meta: pc.meta });
}

export async function retryMailAsPlatform(pc: PlatformCtx, id: string) {
  await assertPlatform(pc);
  const res = await db.mailOutbox.updateMany({ where: { id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null } });
  if (res.count !== 1) throw new NotFoundError("E-mail não encontrado ou já reenviado.");
  await audit({ action: "platform.mail_retry", userId: pc.userId, resourceType: "mail_outbox", resourceId: id, meta: pc.meta });
}

// ───────────────────────── Auditoria e erros ─────────────────────────

export async function errorsOverview(pc: PlatformCtx) {
  await assertPlatform(pc);
  const [total24, total7, groups, recent] = await Promise.all([
    db.appError.count({ where: { createdAt: { gte: ago(86_400_000) } } }),
    db.appError.count({ where: { createdAt: { gte: ago(7 * 86_400_000) } } }),
    db.appError.groupBy({ by: ["source", "message"], where: { createdAt: { gte: ago(7 * 86_400_000) } }, _count: { _all: true }, _max: { createdAt: true }, orderBy: { _count: { message: "desc" } }, take: 15 }),
    db.appError.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, source: true, message: true, correlationId: true, createdAt: true } }),
  ]);
  const [denied, failure] = await Promise.all([listPlatformAudit(pc, { result: "DENIED", take: 20 }), listPlatformAudit(pc, { result: "FAILURE", take: 20 })]);
  const flagged = [...denied, ...failure].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 30);
  const platformActions = await listPlatformAudit(pc, { platformOnly: true, take: 20 });
  return {
    total24, total7,
    groups: groups.map((g) => ({ source: g.source, message: g.message, count: g._count._all, lastAt: g._max.createdAt })),
    recent, flagged, platformActions,
  };
}

// ───────────────────────── Testar integrações ─────────────────────────

export const INTEGRATION_TESTS = {
  database: "Banco de dados",
  storage: "Armazenamento de arquivos",
  smtp: "E-mail (SMTP) — só conecta, não envia",
  asaas: "Cobrança (Asaas)",
  datajud: "DataJud (CNJ)",
  djen: "DJEN (diário eletrônico)",
} as const;
export type IntegrationKey = keyof typeof INTEGRATION_TESTS;
export type TestResult = { key: IntegrationKey; label: string; ok: boolean; ms: number; message: string };

const lastTest = new Map<string, number>();

export async function testIntegration(pc: PlatformCtx, key: string): Promise<TestResult> {
  await assertPlatform(pc);
  if (!(key in INTEGRATION_TESTS)) throw new ValidationError("Integração desconhecida.");
  const k = key as IntegrationKey;
  const prev = lastTest.get(k) ?? 0;
  if (Date.now() - prev < 5_000) throw new ConflictError("Aguarde alguns segundos entre testes da mesma integração.");
  lastTest.set(k, Date.now());
  const t0 = Date.now();
  let ok = false;
  let message = "";
  try {
    if (k === "database") {
      await db.$queryRaw`SELECT 1`;
      ok = true; message = "Banco respondeu.";
    } else if (k === "storage") {
      const dir = path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), ".storage"));
      await access(dir, constants.W_OK);
      ok = true; message = "Pasta de arquivos existe e é gravável.";
    } else if (k === "smtp") {
      ({ ok, message } = await verifySmtpConnection());
    } else if (k === "asaas") {
      const { config, error } = asaasConfigFromEnv();
      if (!config) message = error ?? "Cobrança não configurada.";
      else {
        const res = await fetch(`${config.baseUrl}/customers?limit=1`, { headers: { access_token: config.apiKey, "user-agent": "LegalOS/1.0" }, signal: AbortSignal.timeout(15_000), redirect: "error" });
        ok = res.ok;
        message = res.ok ? `Asaas respondeu (${config.sandbox ? "sandbox" : "produção"}).` : res.status === 401 ? "Asaas recusou a chave de acesso." : `Asaas respondeu HTTP ${res.status}.`;
      }
    } else if (k === "datajud") {
      const apiKey = datajudApiKey();
      if (!apiKey) message = "DATAJUD_API_KEY não configurada.";
      else {
        const base = (process.env.DATAJUD_BASE_URL?.trim() || "https://api-publica.datajud.cnj.jus.br").replace(/\/$/, "");
        const res = await fetch(`${base}/api_publica_tjba/_search`, { method: "POST", headers: { "content-type": "application/json", authorization: `APIKey ${apiKey}` }, body: JSON.stringify({ size: 0, query: { match_all: {} } }), signal: AbortSignal.timeout(20_000) });
        ok = res.ok;
        message = res.ok ? "DataJud respondeu." : res.status === 401 || res.status === 403 ? "DataJud recusou a chave." : `DataJud respondeu HTTP ${res.status}.`;
      }
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const r = await fetchDjen({ numeroOab: "1", ufOab: "BA", inicio: today, fim: today }, defaultHttp, { pauseMs: 0, retries: 0 });
      ok = true; message = `DJEN respondeu (${r.items.length} item(ns) na janela de teste).`;
    }
  } catch (err) {
    ok = false;
    message = sanitizeError(err);
  }
  const ms = Date.now() - t0;
  await audit({ action: "platform.integration_test", userId: pc.userId, resourceType: "integration", resourceId: k, result: ok ? "SUCCESS" : "FAILURE", metadata: { ok, ms }, meta: pc.meta });
  return { key: k, label: INTEGRATION_TESTS[k], ok, ms, message };
}

// ───────────────────────── Interruptores por escritório ─────────────────────────

export const SWITCH_LABELS = { ai: "IA", datajud: "DataJud", djen: "Captura DJEN", mni: "PJe/MNI", billing: "Cobrança WhatsApp", bot: "Robô de atendimento", away: "Mensagem de ausência" } as const;
export type SwitchKeyP = keyof typeof SWITCH_LABELS;

export async function switchesOverview(pc: PlatformCtx) {
  await assertPlatform(pc);
  const [orgs, djen, mni, billing, bot, away] = await Promise.all([
    db.organization.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 100, select: { id: true, name: true, suspendedAt: true, aiEnabled: true, datajudEnabled: true } }),
    db.djenMonitor.groupBy({ by: ["organizationId"], where: { enabled: true }, _count: { _all: true } }),
    db.courtConnection.groupBy({ by: ["organizationId"], where: { enabled: true }, _count: { _all: true } }),
    db.whatsappBillingSettings.findMany({ where: { enabled: true }, select: { organizationId: true } }),
    db.whatsappBot.findMany({ where: { enabled: true }, select: { organizationId: true } }),
    db.whatsappAccount.findMany({ where: { awayEnabled: true }, select: { organizationId: true } }),
  ]);
  const n = (rows: { organizationId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.organizationId, r._count._all]));
  const dj = n(djen), mn = n(mni);
  const set = (rows: { organizationId: string }[]) => new Set(rows.map((r) => r.organizationId));
  const bi = set(billing), bo = set(bot), aw = set(away);
  return orgs.map((o) => ({
    id: o.id, name: o.name, suspended: Boolean(o.suspendedAt),
    on: { ai: o.aiEnabled, datajud: o.datajudEnabled, djen: (dj.get(o.id) ?? 0) > 0, mni: (mn.get(o.id) ?? 0) > 0, billing: bi.has(o.id), bot: bo.has(o.id), away: aw.has(o.id) } as Record<SwitchKeyP, boolean>,
    counts: { djen: dj.get(o.id) ?? 0, mni: mn.get(o.id) ?? 0 },
  }));
}

/** Parada de emergência: o dono só DESLIGA. Religar é decisão do escritório (nada volta a funcionar sozinho). */
export async function switchOffForOrganization(pc: PlatformCtx, orgId: string, key: string) {
  await assertPlatform(pc);
  if (!(key in SWITCH_LABELS)) throw new ValidationError("Interruptor desconhecido.");
  const org = await db.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { id: true } });
  if (!org) throw new NotFoundError("Escritório não encontrado.");
  const k = key as SwitchKeyP;
  let changed = 0;
  if (k === "ai") changed = (await db.organization.updateMany({ where: { id: orgId, aiEnabled: true }, data: { aiEnabled: false } })).count;
  if (k === "datajud") changed = (await db.organization.updateMany({ where: { id: orgId, datajudEnabled: true }, data: { datajudEnabled: false } })).count;
  if (k === "djen") changed = (await db.djenMonitor.updateMany({ where: { organizationId: orgId, enabled: true }, data: { enabled: false } })).count;
  if (k === "mni") changed = (await db.courtConnection.updateMany({ where: { organizationId: orgId, enabled: true }, data: { enabled: false } })).count;
  if (k === "billing") changed = (await db.whatsappBillingSettings.updateMany({ where: { organizationId: orgId, enabled: true }, data: { enabled: false } })).count;
  if (k === "bot") changed = (await db.whatsappBot.updateMany({ where: { organizationId: orgId, enabled: true }, data: { enabled: false } })).count;
  if (k === "away") changed = (await db.whatsappAccount.updateMany({ where: { organizationId: orgId, awayEnabled: true }, data: { awayEnabled: false } })).count;
  await audit({ action: "platform.switch_off", organizationId: orgId, userId: pc.userId, resourceType: "switch", resourceId: k, metadata: { changed }, meta: pc.meta });
  return { changed };
}
