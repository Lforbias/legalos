import type { Page } from "playwright-core";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { loginPje, type LoginOutcome } from "@/lib/robots/pje/login";
import { MAX_ATTEMPTS, backoffMs, mapOutcome } from "@/lib/robots/pje/outcome";
import { failureCodeForLogin } from "@/lib/judicial/robot-evidence";
import { recordEvidence } from "@/server/judicial/evidence.service";
import { probePjePanel } from "@/lib/robots/pje/panel";
import { getPjeTarget } from "@/lib/robots/pje/targets";
import { openBytes, certKey } from "@/lib/security/pfx";
import { audit } from "@/server/services/audit.service";
import { sanitizeError } from "@/server/job-runs";
import type { PortalSecret } from "@/server/services/portal-access.service";

/**
 * Executor da fila do robô. Pega UM trabalho por vez (FOR UPDATE SKIP LOCKED), abre o navegador, faz o login no portal e
 * grava o resultado em linguagem simples. Regras que protegem a conta do advogado:
 *  - senha/CPF recusado → para e pede correção (nunca repete);
 *  - bloqueio ou excesso de tentativas → para e DESLIGA o acesso até a pessoa conferir;
 *  - captcha → para (o sistema não resolve captcha);
 *  - falha de rede/tempo → tenta de novo com espera crescente, no máximo 3 vezes.
 */
export const STUCK_AFTER_MS = 10 * 60_000;

export type RobotPage = { page: Page; close: () => Promise<void> };
export type RobotDeps = {
  /** Abre uma página de navegador limpa (sem cookies) para um trabalho. */
  openPage: () => Promise<RobotPage>;
  now?: () => Date;
  /** Só para teste: troca o login e a leitura do painel por versões de mentira. */
  login?: typeof loginPje;
  probe?: typeof probePjePanel;
};

type Claimed = { id: string };

/** Volta para a fila (ou encerra com falha) o que ficou "rodando" tempo demais, p.ex. se o worker caiu no meio. */
export async function recoverStuckJobs(now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - STUCK_AFTER_MS);
  const requeued = await db.$executeRaw`UPDATE robot_jobs SET status = 'QUEUED', message = 'Retomado depois de uma interrupção.' WHERE status = 'RUNNING' AND started_at < ${before} AND attempts < ${MAX_ATTEMPTS}`;
  const failed = await db.$executeRaw`UPDATE robot_jobs SET status = 'FAILED', finished_at = ${now}, message = 'O trabalho foi interrompido várias vezes.' WHERE status = 'RUNNING' AND started_at < ${before} AND attempts >= ${MAX_ATTEMPTS}`;
  return Number(requeued) + Number(failed);
}

/** Reserva o próximo trabalho da fila. Dois workers nunca pegam o mesmo. */
export async function claimNextJob(now: Date = new Date()): Promise<Claimed | null> {
  const rows = await db.$queryRaw<Claimed[]>`
    UPDATE robot_jobs SET status = 'RUNNING', started_at = ${now}, attempts = attempts + 1
    WHERE id = (SELECT id FROM robot_jobs WHERE status = 'QUEUED' AND run_after <= ${now} ORDER BY run_after, created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id`;
  return rows[0] ?? null;
}

const usedOtpSteps = new Map<string, Set<number>>();

function nameWords(name: string): string[] {
  return [...new Set(name.split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 3))];
}

export async function runJob(jobId: string, deps: RobotDeps): Promise<{ status: string }> {
  const now = deps.now ?? (() => new Date());
  const job = await db.robotJob.findUnique({
    where: { id: jobId },
    include: { access: { include: { user: { select: { id: true, name: true } } } } },
  });
  if (!job || job.status !== "RUNNING") return { status: "SKIPPED" };
  const access = job.access;
  const finishJob = (status: string, message: string, summary: object = {}) =>
    db.robotJob.update({ where: { id: job.id }, data: { status, message: message.slice(0, 400), finishedAt: status === "QUEUED" ? null : now(), summary: summary as never } });

  if (!access.enabled) {
    await finishJob("FAILED", "Este acesso está desligado.");
    return { status: "FAILED" };
  }
  const target = getPjeTarget(access.target);
  const key = certKey();
  if (!target || !key) {
    const msg = !target ? "Tribunal não está mais na lista de destinos do sistema." : "O cofre não está configurado neste sistema.";
    await finishJob("FAILED", msg);
    await db.portalAccess.update({ where: { id: access.id }, data: { status: "ERROR", statusMessage: msg, statusAt: now() } });
    return { status: "FAILED" };
  }

  let secret: PortalSecret;
  try {
    secret = JSON.parse(openBytes(access.secretEnc, key).toString("utf8")) as PortalSecret;
  } catch {
    const msg = "Não foi possível abrir a senha guardada. Cadastre o acesso de novo.";
    await finishJob("FAILED", msg);
    await db.portalAccess.update({ where: { id: access.id }, data: { status: "NEEDS_ACTION", statusMessage: msg, statusAt: now() } });
    return { status: "FAILED" };
  }

  const names = nameWords(access.user.name);
  let outcome: LoginOutcome;
  let panel: Awaited<ReturnType<typeof probePjePanel>> | null = null;
  let rp: RobotPage | null = null;
  try {
    rp = await deps.openPage();
    const steps = usedOtpSteps.get(access.id) ?? new Set<number>();
    usedOtpSteps.set(access.id, steps);
    outcome = await (deps.login ?? loginPje)(rp.page, target, { document: secret.document, password: secret.password, otpSecret: secret.otpSecret }, { names, usedOtpSteps: steps });
    if (outcome.ok && job.kind === "SYNC_NOTICES") panel = await (deps.probe ?? probePjePanel)(rp.page, target, names);
  } catch (e) {
    logger.error("robot.job_crashed", { jobId, error: sanitizeError(e) });
    outcome = { ok: false, code: "NETWORK", message: "O navegador do robô falhou durante o teste.", retryable: true, signature: null, detail: String(sanitizeError(e)).slice(0, 240) };
  } finally {
    await rp?.close().catch(() => undefined);
  }

  const m = mapOutcome(outcome, job.attempts);
  // Evidência real do acesso (login): é isto — e não o cadastro do acesso — que sustenta o estado "conectado" na Central de Conexões.
  try {
    await recordEvidence({
      organizationId: access.organizationId,
      source: { kind: "PORTAL", id: access.id },
      connectorKey: "pje-portal",
      courtCode: access.target,
      operation: "validateCredentials",
      accessMethod: "PORTAL_ROBOT",
      environment: deps.login ? "SIMULATED" : "PRODUCTION",
      outcome: outcome.ok ? "PASSED" : "FAILED",
      reasonCode: outcome.ok ? null : failureCodeForLogin(outcome.code),
      summary: outcome.ok ? "O login no portal funcionou." : outcome.message.slice(0, 200),
      details: { job: job.kind, attempt: job.attempts, ...(!outcome.ok && outcome.detail ? { cause: outcome.detail } : {}) },
    });
  } catch (e) {
    logger.error("robot.evidence_failed", { jobId, error: sanitizeError(e) });
  }
  const summary = { code: outcome.ok ? "OK" : outcome.code, ...(!outcome.ok && outcome.detail ? { detail: outcome.detail } : {}), signature: outcome.signature, ...(panel ? { panel } : {}) };
  if (m.retry) {
    await db.robotJob.update({ where: { id: job.id }, data: { status: "QUEUED", runAfter: new Date(now().getTime() + backoffMs(job.attempts)), message: m.message.slice(0, 400), summary: summary as never } });
  } else {
    await finishJob(m.jobStatus, m.message, summary);
  }
  await db.portalAccess.update({
    where: { id: access.id },
    data: {
      status: m.accessStatus,
      statusMessage: m.message.slice(0, 400),
      statusAt: now(),
      ...(outcome.ok ? { lastLoginAt: now(), ...(job.kind === "SYNC_NOTICES" ? { lastSyncAt: now() } : {}) } : {}),
      ...(m.disable ? { enabled: false } : {}),
    },
  });
  if (outcome.ok && job.kind === "LOGIN_TEST") {
    // mesmo login aceito: testa, uma vez, os outros tribunais cadastrados junto (um de cada vez pela fila)
    const siblings = await db.portalAccess.findMany({ where: { organizationId: access.organizationId, userId: access.userId, system: access.system, enabled: true, status: "PENDING", id: { not: access.id } }, select: { id: true } });
    for (const sib of siblings) {
      const open = await db.robotJob.findFirst({ where: { accessId: sib.id, status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true } });
      if (open) continue;
      await db.robotJob.create({ data: { organizationId: access.organizationId, accessId: sib.id, kind: "LOGIN_TEST" } });
      await db.portalAccess.update({ where: { id: sib.id }, data: { status: "CONNECTING", statusMessage: "Na fila para o teste de login.", statusAt: now() } });
    }
  }
  await audit({
    action: outcome.ok ? "portal_access.login_ok" : "portal_access.login_fail",
    organizationId: access.organizationId,
    userId: access.userId,
    resourceType: "portal_access",
    resourceId: access.id,
    metadata: { system: access.system, target: access.target, kind: job.kind, code: outcome.ok ? "OK" : outcome.code },
    result: outcome.ok ? "SUCCESS" : "FAILURE",
  });
  return { status: m.jobStatus };
}

/** Processa a fila até esvaziar (ou até `maxJobs`). Devolve quantos trabalhos rodou. */
export async function drainQueue(deps: RobotDeps, maxJobs = 10): Promise<number> {
  await recoverStuckJobs((deps.now ?? (() => new Date()))());
  let n = 0;
  while (n < maxJobs) {
    const c = await claimNextJob((deps.now ?? (() => new Date()))());
    if (!c) break;
    await runJob(c.id, deps);
    n++;
  }
  return n;
}
