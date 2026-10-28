import { z } from "zod";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { parseCourtOtpSecret } from "@/lib/pje/otp";
import { PJE_TARGETS, getPjeTarget } from "@/lib/robots/pje/targets";
import { certKey, openBytes, sealBytes } from "@/lib/security/pfx";
import { isValidCnpj, isValidCpf, onlyDigits } from "@/lib/validation/br-documents";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/**
 * Acesso do usuário a um portal de tribunal para o robô (hoje: PJe pelo SSO do PDPJ, com senha + 2º fator).
 * Uma linha por usuário e tribunal/grau. O segredo (senha e chave do 2º fator) é cifrado com a mesma chave do cofre,
 * nunca volta para tela ou API e só é aberto pelo worker na hora de usar. O dono vê e remove só os próprios acessos.
 */
export type PortalSecret = { document: string; password: string; otpSecret: string | null };

const MIN_RETEST_MS = 60_000;
const MAX_TARGETS = 20;

function requireKey(): Buffer {
  const k = certKey();
  if (!k) throw new ConflictError("O cofre não está configurado neste sistema (falta CERT_ENCRYPTION_KEY).");
  return k;
}

async function requireOwnMfa(userId: string) {
  const m = await db.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (!m?.enabledAt) throw new ConflictError("Para guardar a senha do PJe, ative a verificação em duas etapas do LegalOS em Minha conta.");
}

const hint = (doc: string) => (doc.length === 11 ? `CPF final ${doc.slice(-2)}` : `CNPJ final ${doc.slice(-4)}`);

export const connectPjeSchema = z.object({
  targets: z.array(z.string().max(40)).min(1, "Escolha pelo menos um tribunal.").max(MAX_TARGETS),
  document: z.string().trim().min(11).max(20),
  password: z.string().min(1, "Informe a senha do PJe.").max(200),
  /** Chave Base32 ou endereço otpauth lido do QR Code do 2º fator. Opcional: só vale se o PJe pedir o código. */
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
  lastJob: { status: string; message: string | null; finishedAt: Date | null; createdAt: Date; summary: unknown } | null;
};

export function pjeTargetOptions() {
  return PJE_TARGETS.map((t) => ({ key: t.key, label: t.label }));
}

export async function listMyPortalAccesses(ctx: TenantContext): Promise<PortalAccessRow[]> {
  assertCan(ctx, "cases:read");
  const rows = await db.portalAccess.findMany({
    where: { organizationId: ctx.organizationId, userId: ctx.userId },
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
      targetLabel: getPjeTarget(r.target)?.label ?? r.target,
      authMethod: r.authMethod,
      enabled: r.enabled,
      status: r.status,
      statusMessage: r.statusMessage,
      statusAt: r.statusAt,
      lastLoginAt: r.lastLoginAt,
      lastSyncAt: r.lastSyncAt,
      documentHint: secret?.document ? hint(secret.document) : "—",
      hasOtp: Boolean(secret?.otpSecret),
      lastJob: j ? { status: j.status, message: j.message, finishedAt: j.finishedAt, createdAt: j.createdAt, summary: j.summary } : null,
    };
  });
}

async function enqueue(organizationId: string, accessId: string, kind: "LOGIN_TEST" | "SYNC_NOTICES") {
  const open = await db.robotJob.findFirst({ where: { accessId, status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true } });
  if (open) return open.id;
  const job = await db.robotJob.create({ data: { organizationId, accessId, kind }, select: { id: true } });
  return job.id;
}

/** Cadastra (ou atualiza) o acesso aos tribunais escolhidos e enfileira o teste de login do primeiro. */
export async function connectPje(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "cases:read");
  const input = connectPjeSchema.parse(raw);
  const key = requireKey();
  await requireOwnMfa(ctx.userId);
  const targets = [...new Set(input.targets)];
  const unknown = targets.filter((t) => !getPjeTarget(t));
  if (unknown.length) throw new ValidationError("Tribunal inválido.", { targets: ["Escolha tribunais da lista."] });
  const document = onlyDigits(input.document);
  if (!(document.length === 11 ? isValidCpf(document) : document.length === 14 ? isValidCnpj(document) : false)) throw new ValidationError("CPF/CNPJ inválido.", { document: ["Confira o CPF/CNPJ do login do PJe."] });
  const otpSecret = input.otp ? parseCourtOtpSecret(input.otp) : null;
  const secretEnc = sealBytes(Buffer.from(JSON.stringify({ document, password: input.password, otpSecret } satisfies PortalSecret), "utf8"), key);
  const ids: string[] = [];
  for (const target of targets) {
    const data = { authMethod: "PASSWORD_OTP", certificateId: null, secretEnc, enabled: true, status: "PENDING", statusMessage: "Aguardando o primeiro teste de login.", statusAt: new Date() };
    const row = await db.portalAccess.upsert({
      where: { organizationId_userId_system_target: { organizationId: ctx.organizationId, userId: ctx.userId, system: "pje", target } },
      create: { organizationId: ctx.organizationId, userId: ctx.userId, system: "pje", target, label: getPjeTarget(target)!.label, ...data },
      update: data,
      select: { id: true },
    });
    ids.push(row.id);
  }
  const jobId = await enqueue(ctx.organizationId, ids[0]!, "LOGIN_TEST");
  await db.portalAccess.update({ where: { id: ids[0]! }, data: { status: "CONNECTING", statusMessage: "Na fila para o teste de login.", statusAt: new Date() } });
  await audit({ action: "portal_access.save", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_access", resourceId: ids[0], metadata: { system: "pje", targets, withOtp: Boolean(otpSecret) }, meta: ctx.meta });
  return { ids, jobId };
}

async function ownAccess(ctx: TenantContext, id: string) {
  const a = await db.portalAccess.findFirst({ where: { id, organizationId: ctx.organizationId, ...(can(ctx, "integrations:manage") ? {} : { userId: ctx.userId }) } });
  if (!a) throw new NotFoundError("Acesso não encontrado.");
  return a;
}

/** Enfileira um novo teste de login (no máximo um por minuto por acesso). */
export async function testPortalAccess(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:read");
  const a = await db.portalAccess.findFirst({ where: { id, organizationId: ctx.organizationId, userId: ctx.userId } });
  if (!a) throw new NotFoundError("Acesso não encontrado.");
  if (!a.enabled) throw new ConflictError("Este acesso está desligado. Ligue-o antes de testar.");
  const last = await db.robotJob.findFirst({ where: { accessId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true, summary: true } });
  if (last && Date.now() - last.createdAt.getTime() < MIN_RETEST_MS) throw new ConflictError("Aguarde um minuto antes de testar de novo.");
  // senha recusada: repetir o mesmo login só agrava (pode bloquear a conta). A pessoa precisa corrigir os dados antes.
  const code = (last?.summary as { code?: string } | null)?.code;
  if (a.status === "NEEDS_ACTION" && (code === "BAD_CREDENTIALS" || code === "OTP_REJECTED")) throw new ConflictError("O PJe recusou os dados deste acesso. Corrija a senha ou o 2º fator em \"Atualizar senha\" antes de testar de novo.");
  const jobId = await enqueue(ctx.organizationId, id, "LOGIN_TEST");
  await db.portalAccess.update({ where: { id }, data: { status: "CONNECTING", statusMessage: "Na fila para o teste de login.", statusAt: new Date() } });
  await audit({ action: "portal_access.test", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_access", resourceId: id, meta: ctx.meta });
  return { jobId };
}

export async function setPortalAccessEnabled(ctx: TenantContext, id: string, enabled: boolean) {
  assertCan(ctx, "cases:read");
  const a = await db.portalAccess.findFirst({ where: { id, organizationId: ctx.organizationId, userId: ctx.userId }, select: { id: true } });
  if (!a) throw new NotFoundError("Acesso não encontrado.");
  await db.portalAccess.update({ where: { id }, data: { enabled } });
  await audit({ action: enabled ? "portal_access.enable" : "portal_access.disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_access", resourceId: id, meta: ctx.meta });
}

/** O dono remove o próprio acesso; quem administra integrações remove o de qualquer pessoa (nunca lê o segredo). */
export async function deletePortalAccess(ctx: TenantContext, id: string) {
  await ownAccess(ctx, id);
  await db.portalAccess.delete({ where: { id } });
  await audit({ action: "portal_access.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_access", resourceId: id, meta: ctx.meta });
}

/**
 * Agendador: enfileira a leitura periódica dos acessos conectados. Desligado por padrão (ROBOT_SYNC_ENABLED=1 liga) até a
 * leitura das intimações ser conferida contra a tela real: cada leitura é um login no PJe e não deve ser repetido à toa.
 */
export async function enqueueDueSyncs(opts: { now?: Date; everyMinutes?: number } = {}) {
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
