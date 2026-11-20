import { assertBoxAvailable } from "@/server/box-guard";
import {
  assertEvolutionJudicialLoginEnabled, evolutionJudicialLoginEnabled,
  EVOLUTION_EPROC_JOB_ORIGIN,
  EVOLUTION_EPROC_SYSTEM,
  EVOLUTION_PJE_JOB_ORIGIN,
} from "@/lib/evolution-judicial-login";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { parseCourtOtpSecret } from "@/lib/pje/otp";
import { PJE_TARGETS, getPjeTarget } from "@/lib/robots/pje/targets";
import { REGIONAL_CONNECTOR_COURTS } from "@/lib/judicial/court-catalog";
import { EPROC_PORTAL_TARGETS, getEprocPortalTarget } from "@/lib/robots/eproc/targets";
import { certKey, openBytes, sealBytes } from "@/lib/security/pfx";
import { assertCertificateUsable } from "@/server/services/certificate.service";
import { isValidCnpj, isValidCpf, onlyDigits } from "@/lib/validation/br-documents";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/**
 * Acesso do usuário aos portais regionais para o robô (certificado A1 + chave TOTP obrigatória).
 * Uma linha por usuário e tribunal/grau. O segredo (senha e chave do 2º fator) é cifrado com a mesma chave do cofre,
 * nunca volta para tela ou API e só é aberto pelo worker na hora de usar. O dono vê e remove só os próprios acessos.
 */
export type PortalSecret = { document: string; password: string; otpSecret: string | null };

const MIN_RETEST_MS = 60_000;
const MAX_TARGETS = 20;
export type PortalAccessSurface = "legacy" | "evolution" | "evolution-eproc";

function assertPortalSurface(surface: PortalAccessSurface) {
  if (surface !== "legacy") assertEvolutionJudicialLoginEnabled();
  else assertBoxAvailable();
}

function assertPortalPermission(ctx: TenantContext, surface: PortalAccessSurface) {
  assertCan(ctx, surface !== "legacy" ? "integrations:manage" : "cases:read");
  if (surface !== "legacy" && !evolutionJudicialLoginEnabled(ctx.organizationId)) throw new ConflictError("O acesso privado aos portais judiciais não está liberado para este escritório.");
}

function requireKey(): Buffer {
  const k = certKey();
  if (!k) throw new ConflictError("O cofre não está configurado neste sistema (falta CERT_ENCRYPTION_KEY).");
  return k;
}

async function requireOwnMfa(userId: string) {
  const m = await db.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (!m?.enabledAt) throw new ConflictError("Para guardar credenciais de tribunal, ative a verificação em duas etapas do LegalOS em Minha conta.");
}

const hint = (doc: string) => (doc.length === 11 ? `CPF final ${doc.slice(-2)}` : `CNPJ final ${doc.slice(-4)}`);

export const connectPjeSchema = z.object({
  targets: z.array(z.string().max(40)).min(1, "Escolha pelo menos um tribunal.").max(MAX_TARGETS),
  document: z.string().trim().max(20).optional(),
  password: z.string().max(200).optional(),
  certificateId: z.uuid().optional(),
  /** Chave Base32 ou endereço otpauth lido do QR Code do 2º fator. Obrigatória nos logins do piloto. */
  otp: z.string().trim().max(2048).optional(),
}).strict();

export type PortalAccessRow = {
  id: string;
  system: string;
  target: string;
  targetLabel: string;
  authMethod: string;
  enabled: boolean;
  status: string;
  statusMessage: string | null;
  statusAt: Date | null;
  lastLoginAt: Date | null;
  lastSyncAt: Date | null;
  documentHint: string;
  hasOtp: boolean;
  hasCertificate: boolean;
  lastJob: { status: string; message: string | null; finishedAt: Date | null; createdAt: Date; summary: unknown } | null;
};

export function pjeTargetOptions(surface: PortalAccessSurface = "legacy") {
  const targets = surface === "evolution" ? PJE_TARGETS.filter(isRegionalPjeTarget) : surface === "evolution-eproc" ? [] : PJE_TARGETS;
  return targets.map((t) => ({ key: t.key, label: t.label }));
}

export function isRegionalPjeTarget(target: (typeof PJE_TARGETS)[number]): boolean {
  const courtCode = target.key.split("-")[0]?.toUpperCase();
  return REGIONAL_CONNECTOR_COURTS.some((court) => court.code === courtCode);
}

export async function listMyPortalAccesses(ctx: TenantContext, surface: PortalAccessSurface = "legacy"): Promise<PortalAccessRow[]> {
  assertPortalSurface(surface);
  assertPortalPermission(ctx, surface);
  const rows = await db.portalAccess.findMany({
    where: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      ...(surface === "evolution" ? { system: "pje", target: { in: PJE_TARGETS.filter(isRegionalPjeTarget).map((t) => t.key) } } : {}),
      ...(surface === "evolution-eproc" ? { system: EVOLUTION_EPROC_SYSTEM, target: { in: EPROC_PORTAL_TARGETS.map((t) => t.key) } } : {}),
    },
    orderBy: [{ system: "asc" }, { target: "asc" }],
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const key = rows.length ? requireKey() : null;
  return rows.map((r) => {
    let secret: PortalSecret | null = null;
    try {
      secret = JSON.parse(openBytes(r.secretEnc, key!).toString("utf8")) as PortalSecret;
    } catch {
      secret = null;
    }
    const j = r.jobs[0];
    return {
      id: r.id,
      system: r.system,
      target: r.target,
      targetLabel: surface === "evolution-eproc" ? getEprocPortalTarget(r.target)?.label ?? r.target : getPjeTarget(r.target)?.label ?? r.target,
      authMethod: r.authMethod,
      enabled: r.enabled,
      status: r.status,
      statusMessage: r.statusMessage,
      statusAt: r.statusAt,
      lastLoginAt: r.lastLoginAt,
      lastSyncAt: r.lastSyncAt,
      documentHint: secret?.document ? (surface === "evolution-eproc" ? "Usuário eproc cadastrado" : hint(secret.document)) : "—",
      hasOtp: Boolean(secret?.otpSecret),
      hasCertificate: Boolean(r.certificateId),
      lastJob: j ? { status: j.status, message: j.message, finishedAt: j.finishedAt, createdAt: j.createdAt, summary: j.summary } : null,
    };
  });
}

async function enqueue(organizationId: string, accessId: string, kind: "LOGIN_TEST" | "SYNC_NOTICES", origin?: string) {
  const open = await db.robotJob.findFirst({
    where: {
      accessId,
      kind,
      status: { in: ["QUEUED", "RUNNING"] },
      ...(origin ? { summary: { path: ["origin"], equals: origin } } : {}),
    },
    select: { id: true },
  });
  if (open) return open.id;
  const terminalEvents = [{ at: new Date().toISOString(), level: "INFO", message: "Login solicitado; aguardando o robô do tribunal." }];
  const job = await db.robotJob.create({ data: { organizationId, accessId, kind, summary: { ...(origin ? { origin } : {}), terminalEvents } }, select: { id: true } });
  return job.id;
}

/** Cadastra o certificado e o segredo TOTP e enfileira o teste do primeiro destino. */
export async function connectPje(ctx: TenantContext, raw: unknown, surface: PortalAccessSurface = "legacy") {
  assertPortalSurface(surface);
  assertPortalPermission(ctx, surface);
  const input = connectPjeSchema.parse(raw);
  const certificatePilot = surface !== "legacy";
  if (certificatePilot && !input.certificateId) throw new ValidationError("Selecione um certificado digital válido.", { certificateId: ["O certificado é obrigatório neste acesso."] });
  if (certificatePilot && !input.otp) throw new ValidationError("Informe a chave do autenticador.", { otp: ["A chave do autenticador é obrigatória."] });
  if (!input.certificateId && !input.password) throw new ValidationError("Informe a senha ou selecione um certificado.", { password: ["A senha é obrigatória quando não há certificado."] });
  const key = requireKey();
  await requireOwnMfa(ctx.userId);
  if (input.certificateId) await assertCertificateUsable(ctx, input.certificateId, certificatePilot ? "portal" : "legacy");
  const targets = [...new Set(input.targets)];
  if (surface === "evolution" && (targets.length !== 1 || !PJE_TARGETS.some((t) => t.key === targets[0] && isRegionalPjeTarget(t)))) {
    throw new ValidationError("Escolha um destino PJe do Sul ou Sudeste.", { targets: ["Este conector só atende Justiça Estadual, Federal e do Trabalho no Sul e Sudeste."] });
  }
  const unknown = targets.filter((t) => !getPjeTarget(t));
  if (unknown.length) throw new ValidationError("Tribunal inválido.", { targets: ["Escolha tribunais da lista."] });
  const document = onlyDigits(input.document ?? "");
  if (!document && !input.certificateId) throw new ValidationError("Informe o CPF/CNPJ do login do PJe.", { document: ["CPF/CNPJ obrigatório sem certificado."] });
  if (document && !(document.length === 11 ? isValidCpf(document) : document.length === 14 ? isValidCnpj(document) : false)) throw new ValidationError("CPF/CNPJ inválido.", { document: ["Confira o CPF/CNPJ do certificado."] });
  const otpSecret = input.otp ? parseCourtOtpSecret(input.otp) : null;
  const secretEnc = sealBytes(Buffer.from(JSON.stringify({ document, password: input.password ?? "", otpSecret } satisfies PortalSecret), "utf8"), key);
  const ids: string[] = [];
  for (const target of targets) {
    const data = { authMethod: input.certificateId ? "CERTIFICATE" : "PASSWORD_OTP", certificateId: input.certificateId ?? null, secretEnc, enabled: true, status: "PENDING", statusMessage: certificatePilot ? "Aguardando o primeiro teste de login por certificado." : "Aguardando o primeiro teste de login.", statusAt: new Date() };
    const row = await db.portalAccess.upsert({
      where: { organizationId_userId_system_target: { organizationId: ctx.organizationId, userId: ctx.userId, system: "pje", target } },
      create: { organizationId: ctx.organizationId, userId: ctx.userId, system: "pje", target, label: getPjeTarget(target)!.label, ...data },
      update: data,
      select: { id: true },
    });
    ids.push(row.id);
  }
  const jobId = await enqueue(ctx.organizationId, ids[0]!, "LOGIN_TEST", surface === "evolution" ? EVOLUTION_PJE_JOB_ORIGIN : undefined);
  await db.portalAccess.update({ where: { id: ids[0]! }, data: { status: "CONNECTING", statusMessage: "Na fila para o teste de login.", statusAt: new Date() } });
  await audit({ action: "portal_access.save", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_access", resourceId: ids[0], metadata: { system: "pje", targets, withOtp: Boolean(otpSecret) }, meta: ctx.meta });
  return { ids, jobId };
}

const connectEprocSchema = z.object({
  targetKey: z.string().min(3).max(40),
  username: z.string().trim().max(30).optional(),
  password: z.string().max(40).optional(),
  certificateId: z.uuid(),
  otp: z.string().trim().max(2048).optional(),
}).strict();

/** Guarda e testa login eproc por certificado nos portais fixos do recorte regional. */
export async function connectEprocPortal(ctx: TenantContext, raw: unknown) {
  const surface: PortalAccessSurface = "evolution-eproc";
  assertPortalSurface(surface);
  assertPortalPermission(ctx, surface);
  const input = connectEprocSchema.parse(raw);
  if (!input.otp) throw new ValidationError("Informe a chave do autenticador do eproc.", { otp: ["A chave do autenticador é obrigatória."] });
  const key = requireKey();
  await requireOwnMfa(ctx.userId);
  await assertCertificateUsable(ctx, input.certificateId, "portal");
  const target = getEprocPortalTarget(input.targetKey);
  if (!target || !REGIONAL_CONNECTOR_COURTS.some((court) => court.code === target.courtCode)) {
    throw new ValidationError("Escolha um destino eproc do Sul ou Sudeste, nos ramos Estadual, Federal ou do Trabalho.", { targetKey: ["Este destino está fora do escopo permitido."] });
  }
  const otpSecret = parseCourtOtpSecret(input.otp);
  const secretEnc = sealBytes(Buffer.from(JSON.stringify({ document: input.username ?? "", password: input.password ?? "", otpSecret } satisfies PortalSecret), "utf8"), key);
  const data = { authMethod: "CERTIFICATE", certificateId: input.certificateId, secretEnc, enabled: true, status: "PENDING", statusMessage: "Aguardando o primeiro teste de login por certificado no eproc.", statusAt: new Date() };
  const access = await db.portalAccess.upsert({
    where: { organizationId_userId_system_target: { organizationId: ctx.organizationId, userId: ctx.userId, system: EVOLUTION_EPROC_SYSTEM, target: target.key } },
    create: { organizationId: ctx.organizationId, userId: ctx.userId, system: EVOLUTION_EPROC_SYSTEM, target: target.key, label: target.label, ...data },
    update: data,
    select: { id: true },
  });
  const jobId = await enqueue(ctx.organizationId, access.id, "LOGIN_TEST", EVOLUTION_EPROC_JOB_ORIGIN);
  await db.portalAccess.update({ where: { id: access.id }, data: { status: "CONNECTING", statusMessage: "Na fila para o teste de login no eproc.", statusAt: new Date() } });
  await audit({ action: "portal_access.save", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_access", resourceId: access.id, metadata: { system: EVOLUTION_EPROC_SYSTEM, target: target.key, withOtp: true }, meta: ctx.meta });
  return { id: access.id, jobId };
}

export async function connectEprocTjmg(ctx: TenantContext, raw: unknown) {
  const input = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  return connectEprocPortal(ctx, { ...input, targetKey: "tjmg-1g" });
}

/** Enfileira um novo teste de login (no máximo um por minuto por acesso). */
export async function testPortalAccess(ctx: TenantContext, id: string, surface: PortalAccessSurface = "legacy") {
  assertPortalSurface(surface);
  assertPortalPermission(ctx, surface);
  const a = await db.portalAccess.findFirst({ where: { id, organizationId: ctx.organizationId, userId: ctx.userId, ...(surface === "evolution" ? { system: "pje", target: { in: PJE_TARGETS.filter(isRegionalPjeTarget).map((t) => t.key) } } : {}), ...(surface === "evolution-eproc" ? { system: EVOLUTION_EPROC_SYSTEM, target: { in: EPROC_PORTAL_TARGETS.map((t) => t.key) } } : {}) } });
  if (!a) throw new NotFoundError("Acesso não encontrado.");
  if (!a.enabled) throw new ConflictError("Este acesso está desligado. Ligue-o antes de testar.");
  const last = await db.robotJob.findFirst({ where: { accessId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true, summary: true } });
  if (last && Date.now() - last.createdAt.getTime() < MIN_RETEST_MS) throw new ConflictError("Aguarde um minuto antes de testar de novo.");
  // senha recusada: repetir o mesmo login só agrava (pode bloquear a conta). A pessoa precisa corrigir os dados antes.
  const code = (last?.summary as { code?: string } | null)?.code;
  if (a.status === "NEEDS_ACTION" && (code === "BAD_CREDENTIALS" || code === "OTP_REJECTED")) throw new ConflictError("O PJe recusou os dados deste acesso. Corrija a senha ou o 2º fator em \"Atualizar senha\" antes de testar de novo.");
  const origin = surface === "evolution" ? EVOLUTION_PJE_JOB_ORIGIN : surface === "evolution-eproc" ? EVOLUTION_EPROC_JOB_ORIGIN : undefined;
  const jobId = await enqueue(ctx.organizationId, id, "LOGIN_TEST", origin);
  await db.portalAccess.update({ where: { id }, data: { status: "CONNECTING", statusMessage: "Na fila para o teste de login.", statusAt: new Date() } });
  await audit({ action: "portal_access.test", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_access", resourceId: id, meta: ctx.meta });
  return { jobId };
}

export async function setPortalAccessEnabled(ctx: TenantContext, id: string, enabled: boolean, surface: PortalAccessSurface = "legacy") {
  assertPortalSurface(surface);
  assertCan(ctx, "cases:read");
  const a = await db.portalAccess.findFirst({ where: { id, organizationId: ctx.organizationId, userId: ctx.userId, ...(surface === "evolution" ? { system: "pje", target: { in: PJE_TARGETS.filter(isRegionalPjeTarget).map((t) => t.key) } } : {}), ...(surface === "evolution-eproc" ? { system: EVOLUTION_EPROC_SYSTEM, target: { in: EPROC_PORTAL_TARGETS.map((t) => t.key) } } : {}) }, select: { id: true } });
  if (!a) throw new NotFoundError("Acesso não encontrado.");
  await db.portalAccess.update({ where: { id }, data: { enabled } });
  await audit({ action: enabled ? "portal_access.enable" : "portal_access.disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_access", resourceId: id, meta: ctx.meta });
}

/** O dono remove o próprio acesso; quem administra integrações remove o de qualquer pessoa (nunca lê o segredo). */
export async function deletePortalAccess(ctx: TenantContext, id: string, surface: PortalAccessSurface = "legacy") {
  // Revocation remains available while the Evolution pilot is off; deletion cannot
  // start a browser job or touch the retired BOX.
  if (surface === "legacy") assertBoxAvailable();
  const a = await db.portalAccess.findFirst({ where: { id, organizationId: ctx.organizationId, ...(can(ctx, "integrations:manage") ? {} : { userId: ctx.userId }), ...(surface === "evolution" ? { system: "pje", target: { in: PJE_TARGETS.filter(isRegionalPjeTarget).map((t) => t.key) } } : {}), ...(surface === "evolution-eproc" ? { system: EVOLUTION_EPROC_SYSTEM, target: { in: EPROC_PORTAL_TARGETS.map((t) => t.key) } } : {}) }, select: { id: true } });
  if (!a) throw new NotFoundError("Acesso não encontrado.");
  await db.portalAccess.delete({ where: { id: a.id } });
  await audit({ action: "portal_access.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_access", resourceId: id, meta: ctx.meta });
}

/**
 * Agendador: enfileira a leitura periódica dos acessos conectados. Desligado por padrão (ROBOT_SYNC_ENABLED=1 liga) até a
 * leitura das intimações ser conferida contra a tela real: cada leitura é um login no PJe e não deve ser repetido à toa.
 */
export async function enqueueDueSyncs(opts: { now?: Date; everyMinutes?: number } = {}) {
  assertBoxAvailable();
  const out = { enabled: process.env.ROBOT_SYNC_ENABLED === "1", queued: 0 };
  if (!out.enabled) return out;
  const now = opts.now ?? new Date();
  const before = new Date(now.getTime() - (opts.everyMinutes ?? 60) * 60_000);
  const due = await db.portalAccess.findMany({
    where: { enabled: true, status: "CONNECTED", organization: { deletedAt: null, suspendedAt: null }, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: before } }] },
    select: { id: true, organizationId: true },
    take: 200,
  });
  for (const a of due) {
    const open = await db.robotJob.findFirst({ where: { accessId: a.id, status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true } });
    if (open) continue;
    await db.robotJob.create({ data: { organizationId: a.organizationId, accessId: a.id, kind: "SYNC_NOTICES" } });
    out.queued++;
  }
  return out;
}
