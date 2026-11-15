import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { openBytes, certKey } from "@/lib/security/pfx";
import { sanitizeError } from "@/server/job-runs";
import { audit } from "@/server/services/audit.service";
import { recordEvidence } from "@/server/judicial/evidence.service";
import { ensureAdapters, getAdapter } from "@/lib/judicial/adapter-bootstrap";
import { mapAdapterOutcome, backoffMs, type AdapterContext, type AdapterOutcome, type AdapterSecret } from "@/lib/judicial/adapter";
import type { EvidenceEnvironment } from "@/lib/judicial/contracts";
import type { OperationFailure } from "@/lib/judicial/contracts";

type PortalSecret = { document: string; password: string; otpSecret: string | null };

function nameWords(name: string): string[] {
  return [...new Set(name.split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 3))];
}

function adapterFailureToEvidence(code: string): OperationFailure["code"] {
  switch (code) {
    case "BAD_CREDENTIALS":
    case "OTP_REJECTED":
      return "AUTH_REJECTED";
    case "OTP_REQUIRED":
    case "CERTIFICATE_REQUIRED":
    case "CERTIFICATE_EXPIRED":
      return "AUTH_REQUIRED";
    case "CERTIFICATE_REJECTED":
      return "AUTH_REJECTED";
    case "ACCOUNT_BLOCKED":
    case "NEEDS_PERSON":
    case "CAPTCHA":
      return "NEEDS_PERSON";
    case "UNKNOWN_PAGE":
    case "LAYOUT_CHANGED":
      return "LAYOUT_CHANGED";
    case "TIMEOUT":
      return "TIMEOUT";
    case "NETWORK":
    case "GEO_BLOCKED":
    case "RATE_LIMITED":
      return "UNAVAILABLE";
    default:
      return "INTERNAL";
  }
}

export type AdapterRunnerDeps = {
  openPage?: () => Promise<{ page: unknown; close: () => Promise<void> }>;
  now?: () => Date;
};

/**
 * Executa um job de LOGIN_TEST usando o adaptador genérico.
 * Resolve o adaptador pelo `system` do PortalAccess e delega.
 * Para adaptadores MNI (eproc, e-SAJ, PROJUDI) não precisa de browser.
 * Para PJe, o runner original em pje-runner.ts continua sendo usado.
 */
export async function runAdapterJob(jobId: string, deps: AdapterRunnerDeps = {}): Promise<{ status: string }> {
  ensureAdapters();
  const now = deps.now ?? (() => new Date());

  const job = await db.robotJob.findUnique({
    where: { id: jobId },
    include: { access: { include: { user: { select: { id: true, name: true } } } } },
  });
  if (!job || job.status !== "RUNNING") return { status: "SKIPPED" };

  const access = job.access;
  const adapter = getAdapter(access.system);
  if (!adapter) {
    await db.robotJob.update({
      where: { id: job.id },
      data: { status: "FAILED", message: `Adaptador "${access.system}" não encontrado.`, finishedAt: now() },
    });
    await db.portalAccess.update({
      where: { id: access.id },
      data: { status: "ERROR", statusMessage: `Adaptador "${access.system}" não encontrado.`, statusAt: now() },
    });
    return { status: "FAILED" };
  }

  if (!access.enabled) {
    await db.robotJob.update({
      where: { id: job.id },
      data: { status: "FAILED", message: "Este acesso está desligado.", finishedAt: now() },
    });
    return { status: "FAILED" };
  }

  const key = certKey();
  if (!key) {
    const msg = "O cofre não está configurado neste sistema.";
    await db.robotJob.update({ where: { id: job.id }, data: { status: "FAILED", message: msg, finishedAt: now() } });
    await db.portalAccess.update({ where: { id: access.id }, data: { status: "ERROR", statusMessage: msg, statusAt: now() } });
    return { status: "FAILED" };
  }

  let secret: PortalSecret;
  try {
    secret = JSON.parse(openBytes(access.secretEnc, key).toString("utf8")) as PortalSecret;
  } catch {
    const msg = "Não foi possível abrir as credenciais guardadas. Cadastre o acesso novamente.";
    await db.robotJob.update({ where: { id: job.id }, data: { status: "FAILED", message: msg, finishedAt: now() } });
    await db.portalAccess.update({ where: { id: access.id }, data: { status: "NEEDS_ACTION", statusMessage: msg, statusAt: now() } });
    return { status: "FAILED" };
  }

  const parts = access.target.split("-");
  const courtCode = (parts[0] ?? "").toUpperCase();
  const degree = parts[1] === "1g" ? "1" as const : "2" as const;

  const target = adapter.descriptor.supportedTargets.find(
    (t) => t.courtCode === courtCode && t.degree === degree,
  );
  if (!target) {
    const msg = `O tribunal ${courtCode} (${degree}º grau) não é suportado pelo adaptador ${adapter.descriptor.key}.`;
    await db.robotJob.update({ where: { id: job.id }, data: { status: "FAILED", message: msg, finishedAt: now() } });
    await db.portalAccess.update({ where: { id: access.id }, data: { status: "ERROR", statusMessage: msg, statusAt: now() } });
    return { status: "FAILED" };
  }

  const needsBrowser = adapter.descriptor.engineFamily === "PJE";
  let page: { page: unknown; close: () => Promise<void> } | null = null;

  const ctx: AdapterContext = {
    organizationId: access.organizationId,
    userId: access.userId,
    target,
    authMode: access.authMethod === "PASSWORD_OTP" ? "PASSWORD_OTP" : "PASSWORD",
    openSecret: async (): Promise<AdapterSecret> => ({
      document: secret.document,
      password: secret.password,
      otpSecret: secret.otpSecret,
    }),
    page: null,
    piiNames: nameWords(access.user.name),
  };

  let outcome: AdapterOutcome<{ evidenceEnvironment: EvidenceEnvironment }>;
  try {
    if (needsBrowser && deps.openPage) {
      page = await deps.openPage();
      ctx.page = page.page;
    }
    outcome = await adapter.validateCredentials(ctx);
  } catch (e) {
    logger.error("adapter_runner.job_crashed", { jobId, adapter: adapter.descriptor.key, error: sanitizeError(e) });
    outcome = {
      ok: false,
      code: "NETWORK",
      message: "O adaptador falhou durante o teste de conexão.",
      retryable: true,
      detail: String(sanitizeError(e)).slice(0, 240),
    };
  } finally {
    await page?.close().catch(() => undefined);
  }

  const m = mapAdapterOutcome(outcome, job.attempts);

  try {
    await recordEvidence({
      organizationId: access.organizationId,
      source: { kind: "PORTAL", id: access.id },
      connectorKey: adapter.descriptor.key,
      courtCode: access.target,
      operation: "validateCredentials",
      accessMethod: adapter.descriptor.supportedAuthModes[0] === "PASSWORD" ? "MNI" : "PORTAL_ROBOT",
      environment: outcome.ok ? outcome.data.evidenceEnvironment : "PRODUCTION",
      outcome: outcome.ok ? "PASSED" : "FAILED",
      reasonCode: outcome.ok ? null : adapterFailureToEvidence(outcome.code),
      summary: outcome.ok ? `Conectado ao ${courtCode} via ${adapter.descriptor.label}.` : outcome.message.slice(0, 200),
      details: { job: job.kind, attempt: job.attempts, adapter: adapter.descriptor.key, ...(!outcome.ok && outcome.detail ? { cause: outcome.detail } : {}) },
    });
  } catch (e) {
    logger.error("adapter_runner.evidence_failed", { jobId, error: sanitizeError(e) });
  }

  const summary = {
    code: outcome.ok ? "OK" : outcome.code,
    adapter: adapter.descriptor.key,
    ...(!outcome.ok && outcome.detail ? { detail: outcome.detail } : {}),
  };

  if (m.retry) {
    await db.robotJob.update({
      where: { id: job.id },
      data: { status: "QUEUED", runAfter: new Date(now().getTime() + backoffMs(job.attempts)), message: m.message.slice(0, 400), summary: summary as never },
    });
  } else {
    await db.robotJob.update({
      where: { id: job.id },
      data: { status: m.jobStatus, message: m.message.slice(0, 400), finishedAt: now(), summary: summary as never },
    });
  }

  await db.portalAccess.update({
    where: { id: access.id },
    data: {
      status: m.accessStatus,
      statusMessage: m.message.slice(0, 400),
      statusAt: now(),
      ...(outcome.ok ? { lastLoginAt: now() } : {}),
      ...(m.disable ? { enabled: false } : {}),
    },
  });

  await audit({
    action: outcome.ok ? "portal_access.login_ok" : "portal_access.login_fail",
    organizationId: access.organizationId,
    userId: access.userId,
    resourceType: "portal_access",
    resourceId: access.id,
    metadata: { system: access.system, target: access.target, kind: job.kind, adapter: adapter.descriptor.key, code: outcome.ok ? "OK" : outcome.code },
    result: outcome.ok ? "SUCCESS" : "FAILURE",
  });

  return { status: m.jobStatus };
}
