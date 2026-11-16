import type { Page } from "playwright-core";
import { Prisma } from "@prisma/client";
import { BOX_AVAILABLE } from "@/lib/box-retirement";
import {
  evolutionJudicialLoginEnabled,
  EVOLUTION_PJE_JOB_ORIGIN,
  EVOLUTION_EPROC_JOB_ORIGIN,
  EVOLUTION_EPROC_SYSTEM,
} from "@/lib/evolution-judicial-login";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { loginPje, type LoginOutcome } from "@/lib/robots/pje/login";
import { loginEprocPortal } from "@/lib/robots/eproc/login";
import { observeEprocPanel, type EprocPanelObservation } from "@/lib/robots/eproc/panel";
import { getTjmgReportLink, readTjmgReport, TJMG_REPORT_LABELS } from "@/lib/robots/eproc/report";
import { encryptSecret } from "@/lib/security/totp";
import { MAX_ATTEMPTS, backoffMs, mapOutcome } from "@/lib/robots/pje/outcome";
import { failureCodeForLogin } from "@/lib/judicial/robot-evidence";
import { recordEvidence } from "@/server/judicial/evidence.service";
import { probePjePanel } from "@/lib/robots/pje/panel";
import { getPjeTarget, PJE_TARGETS } from "@/lib/robots/pje/targets";
import { EPROC_PORTAL_TARGETS, eprocAllowedOrigins, getEprocPortalTarget } from "@/lib/robots/eproc/targets";
import { openBytes, certKey } from "@/lib/security/pfx";
import { audit } from "@/server/services/audit.service";
import { sanitizeError } from "@/server/job-runs";
import { isRegionalPjeTarget, type PortalSecret } from "@/server/services/portal-access.service";
import { resolveTenantContext } from "@/server/services/tenant.service";
import { getCertificateMaterial } from "@/server/services/certificate.service";
import { PJE_SSO_ORIGIN } from "@/lib/robots/pje/targets";

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
export type PortalClientCertificate = { pfx: Buffer; passphrase: string; origins: string[] };
export type RobotDeps = {
  /** Abre uma página de navegador limpa (sem cookies) para um trabalho. */
  openPage: (certificate?: PortalClientCertificate) => Promise<RobotPage>;
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
  const loginOnly = !BOX_AVAILABLE && evolutionJudicialLoginEnabled();
  if (!BOX_AVAILABLE && !loginOnly) return null;
  const regionalPjeKeys = PJE_TARGETS.filter(isRegionalPjeTarget).map((target) => target.key);
  const eprocKeys = EPROC_PORTAL_TARGETS.map((target) => target.key);
  const rows = await db.$queryRaw<Claimed[]>`
    UPDATE robot_jobs SET status = 'RUNNING', started_at = ${now}, attempts = attempts + 1
    WHERE id = (SELECT id FROM robot_jobs WHERE status = 'QUEUED' AND run_after <= ${now} AND (${loginOnly} = false OR (kind = 'LOGIN_TEST' AND ((summary ->> 'origin' = ${EVOLUTION_PJE_JOB_ORIGIN} AND access_id IN (SELECT id FROM portal_accesses WHERE system = 'pje' AND target IN (${Prisma.join(regionalPjeKeys)}))) OR (summary ->> 'origin' = ${EVOLUTION_EPROC_JOB_ORIGIN} AND access_id IN (SELECT id FROM portal_accesses WHERE system = ${EVOLUTION_EPROC_SYSTEM} AND target IN (${Prisma.join(eprocKeys)})))))) ORDER BY run_after, created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id`;
  return rows[0] ?? null;
}

const usedOtpSteps = new Map<string, Set<number>>();

function nameWords(name: string): string[] {
  return [...new Set(name.split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 3))];
}

export async function runJob(jobId: string, deps: RobotDeps): Promise<{ status: string }> {
  if (!BOX_AVAILABLE && !evolutionJudicialLoginEnabled()) return { status: "SKIPPED" };
  const now = deps.now ?? (() => new Date());
  const job = await db.robotJob.findUnique({
    where: { id: jobId },
    include: { access: { include: { user: { select: { id: true, name: true } } } } },
  });
  if (!job || job.status !== "RUNNING") return { status: "SKIPPED" };
  const savedSummary = job.summary && typeof job.summary === "object" && !Array.isArray(job.summary) ? job.summary as Record<string, unknown> : {};
  const savedEvents = Array.isArray(savedSummary.terminalEvents) ? savedSummary.terminalEvents : [];
  let terminalEvents = savedEvents.filter((event): event is { at: string; level: "INFO" | "SUCCESS" | "WARN" | "ERROR"; message: string } =>
    Boolean(event && typeof event === "object" && "at" in event && typeof event.at === "string" && "message" in event && typeof event.message === "string" && "level" in event && ["INFO", "SUCCESS", "WARN", "ERROR"].includes(String(event.level))),
  ).slice(-79);
  let jobSummary: Record<string, unknown> = { ...savedSummary };
  delete jobSummary.terminalEvents;
  const recordProgress = async (message: string, level: "INFO" | "SUCCESS" | "WARN" | "ERROR" = "INFO") => {
    terminalEvents = [...terminalEvents, { at: now().toISOString(), level, message: message.replace(/[\r\n]+/g, " ").slice(0, 240) }].slice(-80);
    jobSummary = { ...jobSummary, terminalEvents };
    try {
      await db.robotJob.update({ where: { id: job.id }, data: { summary: jobSummary as never } });
    } catch (error) {
      logger.warn("robot.terminal_log_failed", { jobId: job.id, error: sanitizeError(error) });
    }
  };
  const origin = typeof savedSummary.origin === "string" ? savedSummary.origin : undefined;
  await recordProgress(`Worker iniciou tentativa ${job.attempts} para ${job.access.target}.`);
  const accessPjeTarget = getPjeTarget(job.access.target);
  const accessEprocTarget = getEprocPortalTarget(job.access.target);
  const isEvolutionPje = origin === EVOLUTION_PJE_JOB_ORIGIN && job.access.system === "pje" && Boolean(accessPjeTarget && isRegionalPjeTarget(accessPjeTarget));
  const isEvolutionEproc = origin === EVOLUTION_EPROC_JOB_ORIGIN && job.access.system === EVOLUTION_EPROC_SYSTEM && Boolean(accessEprocTarget);
  const isEvolutionPilot = isEvolutionPje || isEvolutionEproc;
  if ((job.access.system === EVOLUTION_EPROC_SYSTEM && (!isEvolutionEproc || job.kind !== "LOGIN_TEST")) || (!BOX_AVAILABLE && (job.kind !== "LOGIN_TEST" || !isEvolutionPilot))) {
    await db.robotJob.update({ where: { id: job.id }, data: { status: "FAILED", message: "Este trabalho não pertence ao piloto de login autorizado da Evolution.", finishedAt: now() } });
    return { status: "SKIPPED" };
  }
  const access = job.access;
  const finishJob = async (status: string, message: string, summary: object = {}) => {
    if (status !== "QUEUED") await recordProgress(`Trabalho finalizado: ${message}`, status === "DONE" ? "SUCCESS" : status === "WAITING_PERSON" ? "WARN" : "ERROR");
    jobSummary = { ...jobSummary, ...summary, terminalEvents };
    await db.robotJob.update({ where: { id: job.id }, data: { status, message: message.slice(0, 400), finishedAt: status === "QUEUED" ? null : now(), summary: jobSummary as never } });
  };

  if (!access.enabled) {
    await finishJob("FAILED", "Este acesso está desligado.");
    return { status: "FAILED" };
  }
  const target = isEvolutionEproc ? null : accessPjeTarget;
  const key = certKey();
  if ((!isEvolutionEproc && !target) || !key) {
    const msg = !isEvolutionEproc && !target ? "Tribunal não está mais na lista de destinos do sistema." : "O cofre não está configurado neste sistema.";
    await finishJob("FAILED", msg);
    await db.portalAccess.update({ where: { id: access.id }, data: { status: "ERROR", statusMessage: msg, statusAt: now() } });
    return { status: "FAILED" };
  }

  let secret: PortalSecret;
  try {
    secret = JSON.parse(openBytes(access.secretEnc, key).toString("utf8")) as PortalSecret;
  } catch {
    const msg = "Não foi possível abrir os dados guardados. Atualize o acesso ao tribunal.";
    await finishJob("FAILED", msg);
    await db.portalAccess.update({ where: { id: access.id }, data: { status: "NEEDS_ACTION", statusMessage: msg, statusAt: now() } });
    return { status: "FAILED" };
  }
  await recordProgress("Acesso protegido aberto no cofre; segredo e código não são exibidos.");
  if (isEvolutionPilot && !secret.otpSecret) {
    const msg = "Cadastre a chave do autenticador antes de conectar ao tribunal.";
    await finishJob("FAILED", msg, { origin, code: "OTP_MISSING" });
    await db.portalAccess.update({ where: { id: access.id }, data: { status: "NEEDS_ACTION", statusMessage: msg, statusAt: now() } });
    return { status: "FAILED" };
  }

  let certMaterial: Awaited<ReturnType<typeof getCertificateMaterial>> | null = null;
  if (isEvolutionPilot) {
    if (!access.certificateId || access.authMethod !== "CERTIFICATE") {
      const msg = "Atualize este acesso e selecione um certificado digital.";
      await finishJob("FAILED", msg, { origin, code: "CERTIFICATE_REQUIRED" });
      await db.portalAccess.update({ where: { id: access.id }, data: { status: "NEEDS_ACTION", statusMessage: msg, statusAt: now() } });
      secret.otpSecret = null;
      return { status: "FAILED" };
    }
    const tenant = await resolveTenantContext(access.userId, access.organizationId, {});
    if (!tenant) {
      const msg = "A pessoa não tem mais acesso ativo a este escritório.";
      await finishJob("FAILED", msg, { origin, code: "CERTIFICATE_REJECTED" });
      await db.portalAccess.update({ where: { id: access.id }, data: { status: "NEEDS_ACTION", statusMessage: msg, statusAt: now() } });
      secret.otpSecret = null;
      return { status: "FAILED" };
    }
    try {
      certMaterial = await getCertificateMaterial(tenant, access.certificateId, "portal:login", null, "portal");
      await recordProgress("Certificado digital carregado no navegador isolado desta tentativa (o tribunal ainda não o validou); dados privados ocultos.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível usar o certificado digital selecionado.";
      await finishJob("FAILED", msg, { origin, code: "CERTIFICATE_REJECTED" });
      await db.portalAccess.update({ where: { id: access.id }, data: { status: "NEEDS_ACTION", statusMessage: msg, statusAt: now() } });
      secret.otpSecret = null;
      return { status: "FAILED" };
    }
  }

  const names = nameWords(access.user.name);
  const portalLabel = isEvolutionEproc ? "eproc" : "PJe";
  let outcome: LoginOutcome;
  let panel: Awaited<ReturnType<typeof probePjePanel>> | null = null;
  let eprocPanel: EprocPanelObservation | null = null;
  let rp: RobotPage | null = null;
  try {
    // O certificado do cofre só é apresentado às origens oficiais do próprio fluxo (catálogo fixo; nunca URL informada pelo usuário).
    const origins = isEvolutionEproc ? eprocAllowedOrigins(accessEprocTarget!) : [target!.origin, PJE_SSO_ORIGIN];
    rp = await deps.openPage(certMaterial ? { pfx: certMaterial.pfx, passphrase: certMaterial.passphrase, origins } : undefined);
    await recordProgress(`Navegador isolado pronto; iniciando o fluxo ${portalLabel}.`);
    const steps = usedOtpSteps.get(access.id) ?? new Set<number>();
    usedOtpSteps.set(access.id, steps);
    const credentials = { document: secret.document, password: secret.password, otpSecret: secret.otpSecret, certificateAuth: isEvolutionPilot };
    outcome = isEvolutionEproc
      ? await loginEprocPortal(rp.page, accessEprocTarget!, credentials, { names, usedOtpSteps: steps, onProgress: recordProgress })
      : await (deps.login ?? loginPje)(rp.page, target!, credentials, { names, usedOtpSteps: steps, onProgress: recordProgress });
    if (outcome.ok && isEvolutionEproc && job.kind === "LOGIN_TEST") {
      try { eprocPanel = await observeEprocPanel(rp.page, accessEprocTarget!); }
      catch (error) {
        logger.warn("robot.eproc_panel_probe_failed", { jobId, error: sanitizeError(error) });
        await recordProgress("Login confirmado; a leitura do painel falhou sem alterar o acesso ao tribunal.", "WARN");
      }
      if (eprocPanel) {
        const labels = eprocPanel.sections.map(({ label, count }) => count === null ? label : `${label}: ${count}`);
        await recordProgress(labels.length
          ? `Leitura segura do painel concluída: ${labels.length} listas identificadas (${[...new Set(labels)].join(", ")}). Nenhum processo ou comunicação foi aberto.`
          : "Login confirmado; o painel foi lido sem interagir com itens. Ainda não identifiquei as listas de processos ou comunicações nesta tela.", labels.length ? "SUCCESS" : "WARN");
      }
    }
    if (outcome.ok && isEvolutionEproc && access.target === "tjmg-1g" && key) {
      const reports = [];
      for (const label of TJMG_REPORT_LABELS) {
        try {
          const href = await getTjmgReportLink(rp.page, label);
          const result = href ? await readTjmgReport(rp.page, href) : null;
          if (!result?.recognized) {
            await recordProgress(`${label}: relatório indisponível ou tabela não identificada.`, "WARN");
            continue;
          }
          reports.push({ label, rows: result.rows, truncated: result.truncated });
          await recordProgress(`${label}: ${result.rows.length} registros lidos na página do relatório.`, "SUCCESS");
        } catch {
          await recordProgress(`${label}: não foi possível ler o relatório nesta tentativa.`, "WARN");
        }
      }
      if (reports.length) jobSummary.eprocReportsEnc = encryptSecret(JSON.stringify(reports), key);
    }
    if (outcome.ok && job.kind === "SYNC_NOTICES" && target) panel = await (deps.probe ?? probePjePanel)(rp.page, target, names);
  } catch (e) {
    logger.error("robot.job_crashed", { jobId, error: sanitizeError(e) });
    outcome = { ok: false, code: "NETWORK", message: "O navegador do robô falhou durante o teste.", retryable: true, signature: null, detail: String(sanitizeError(e)).slice(0, 240) };
  } finally {
    await rp?.close().catch(() => undefined);
    await recordProgress("Navegador isolado encerrado; dados temporários removidos.");
    certMaterial?.pfx.fill(0);
    secret.password = "";
    secret.otpSecret = null;
  }

  const m = mapOutcome(outcome, job.attempts, portalLabel);
  await recordProgress(outcome.ok ? "Resultado: acesso confirmado pelo tribunal." : `Resultado: ${outcome.message}`, outcome.ok ? "SUCCESS" : "ERROR");
  // Evidência real do acesso (login): é isto — e não o cadastro do acesso — que sustenta o estado "conectado" na Central de Conexões.
  try {
    await recordEvidence({
      organizationId: access.organizationId,
      source: { kind: "PORTAL", id: access.id },
      connectorKey: isEvolutionEproc ? "eproc-portal" : "pje-portal",
      courtCode: accessEprocTarget?.courtCode ?? access.target,
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
  const summary = { ...jobSummary, ...(isEvolutionPilot ? { origin: isEvolutionEproc ? EVOLUTION_EPROC_JOB_ORIGIN : EVOLUTION_PJE_JOB_ORIGIN } : {}), terminalEvents, code: outcome.ok ? "OK" : outcome.code, ...(!outcome.ok && outcome.detail ? { detail: outcome.detail } : {}), signature: outcome.signature, ...(panel ? { panel } : {}), ...(eprocPanel ? { eprocPanel } : {}) };
  if (m.retry) {
    await recordProgress(`Tentativa encerrada: ${outcome.ok ? m.message : outcome.message}. O robô tentará novamente depois da espera de segurança.`, "WARN");
    summary.terminalEvents = terminalEvents;
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
  if (outcome.ok && job.kind === "LOGIN_TEST" && !isEvolutionPilot) {
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
  if (!BOX_AVAILABLE && !evolutionJudicialLoginEnabled()) return 0;
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
