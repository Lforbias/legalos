import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { certKey, openBytes, parsePfx, sealBytes } from "@/lib/security/pfx";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { notify } from "./notification.service";

export const MAX_PFX_BYTES = 100 * 1024;
export const EXPIRY_WARN_DAYS = [30, 7] as const;
const DAY = 24 * 60 * 60 * 1000;

export const vaultAvailable = () => certKey() !== null;

function requireKey(): Buffer {
  const k = certKey();
  if (!k) throw new ConflictError("O cofre de certificados não está configurado neste sistema (falta CERT_ENCRYPTION_KEY).");
  return k;
}

export async function requireMfa(userId: string) {
  const m = await db.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (!m?.enabledAt) throw new ConflictError("Ative a verificação em duas etapas em Minha conta para gerenciar certificados digitais.");
}

export type CertStatus = "ACTIVE" | "EXPIRING" | "EXPIRED" | "REVOKED";
export function certStatus(c: { revokedAt: Date | null; notAfter: Date }, now = new Date()): CertStatus {
  if (c.revokedAt) return "REVOKED";
  if (c.notAfter <= now) return "EXPIRED";
  if (c.notAfter.getTime() - now.getTime() <= EXPIRY_WARN_DAYS[0] * DAY) return "EXPIRING";
  return "ACTIVE";
}

const safeSelect = { id: true, label: true, ownerUserId: true, subjectCn: true, documentHint: true, issuerCn: true, serialNumber: true, notBefore: true, notAfter: true, createdAt: true, revokedAt: true, lastUsedAt: true } satisfies Prisma.CertificateSelect;

export type CertificateRow = Prisma.CertificateGetPayload<{ select: typeof safeSelect }> & { ownerName: string; status: CertStatus };

/** Lista SEM nenhum material secreto (arquivo e senha nunca saem do banco por aqui). */
export async function listCertificates(ctx: TenantContext): Promise<CertificateRow[]> {
  assertCan(ctx, "certificates:manage");
  const rows = await db.certificate.findMany({ where: { organizationId: ctx.organizationId }, select: { ...safeSelect, owner: { select: { name: true } } }, orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { notAfter: "asc" }] });
  return rows.map(({ owner, ...r }) => ({ ...r, ownerName: owner.name, status: certStatus(r) }));
}

export async function uploadCertificate(ctx: TenantContext, input: { file: Buffer; password: string; label: string; ownerUserId: string }) {
  assertCan(ctx, "certificates:manage");
  const key = requireKey();
  await requireMfa(ctx.userId);
  const label = input.label.trim();
  if (!label || label.length > 120) throw new ValidationError("Informe um nome de até 120 caracteres.", { label: ["Nome obrigatório (até 120 caracteres)."] });
  if (!input.password) throw new ValidationError("Informe a senha do certificado.", { password: ["Senha obrigatória."] });
  if (input.file.length === 0 || input.file.length > MAX_PFX_BYTES) throw new ValidationError("Arquivo inválido (máximo de 100 KB).", { file: ["Arquivo inválido."] });
  const owner = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: input.ownerUserId, status: "ACTIVE" }, select: { id: true } });
  if (!owner) throw new ValidationError("O titular precisa ser um membro ativo do escritório.", { ownerUserId: ["Titular inválido."] });

  const info = parsePfx(input.file, input.password);
  const now = new Date();
  if (info.notAfter <= now) throw new ValidationError("Este certificado já está vencido.", { file: ["Certificado vencido."] });
  if (info.notBefore > now) throw new ValidationError("Este certificado ainda não é válido (data de início no futuro).", { file: ["Certificado ainda não vigente."] });

  try {
    const c = await db.certificate.create({
      data: {
        organizationId: ctx.organizationId,
        ownerUserId: input.ownerUserId,
        label,
        subjectCn: info.subjectCn,
        documentHint: info.documentHint,
        issuerCn: info.issuerCn,
        serialNumber: info.serialNumber,
        fingerprintSha256: info.fingerprintSha256,
        notBefore: info.notBefore,
        notAfter: info.notAfter,
        pfxEnc: sealBytes(input.file, key),
        passEnc: sealBytes(Buffer.from(input.password, "utf8"), key),
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await audit({ action: "certificate.upload", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "certificate", resourceId: c.id, metadata: { fingerprint: info.fingerprintSha256.slice(0, 16), notAfter: info.notAfter.toISOString(), ownerUserId: input.ownerUserId }, meta: ctx.meta });
    return c;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConflictError("Este certificado já está cadastrado neste escritório.");
    throw err;
  }
}

/** Revoga e APAGA o material cifrado (irreversível: para voltar a usar, envie o certificado de novo). */
export async function revokeCertificate(ctx: TenantContext, id: string) {
  assertCan(ctx, "certificates:manage");
  await requireMfa(ctx.userId);
  const res = await db.certificate.updateMany({ where: { id, organizationId: ctx.organizationId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: ctx.userId, pfxEnc: "", passEnc: "" } });
  if (res.count !== 1) throw new NotFoundError("Certificado não encontrado ou já revogado.");
  await audit({ action: "certificate.revoke", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "certificate", resourceId: id, meta: ctx.meta });
}

export async function listCertificateUsage(ctx: TenantContext, id: string, take = 50) {
  assertCan(ctx, "certificates:manage");
  const c = await db.certificate.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
  if (!c) throw new NotFoundError("Certificado não encontrado.");
  return db.certificateUsage.findMany({ where: { certificateId: id, organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: Math.min(take, 200) });
}

export type CertificateMaterial = { pfx: Buffer; passphrase: string; subjectCn: string; certificateId: string };

/**
 * USO INTERNO do motor de tribunais (worker): entrega o material decifrado SOMENTE em memória e registra o uso.
 * Permitido ao titular do certificado ou a quem tem `certificates:manage`; recusa revogado/vencido.
 * Nenhuma tela, rota ou API devolve este material.
 */
export async function getCertificateMaterial(ctx: TenantContext, id: string, purpose: string, caseId?: string | null): Promise<CertificateMaterial> {
  const key = requireKey();
  const c = await db.certificate.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c || (c.ownerUserId !== ctx.userId && !can(ctx, "certificates:manage"))) throw new NotFoundError("Certificado não encontrado.");
  if (c.revokedAt) throw new ConflictError("Este certificado foi revogado.");
  if (c.notAfter <= new Date()) throw new ConflictError("Este certificado está vencido.");
  const cleanPurpose = purpose.trim().slice(0, 120);
  if (!cleanPurpose) throw new ValidationError("Informe a finalidade do uso.");
  await db.$transaction([
    db.certificateUsage.create({ data: { organizationId: ctx.organizationId, certificateId: id, userId: ctx.userId, purpose: cleanPurpose, caseId: caseId ?? null } }),
    db.certificate.update({ where: { id }, data: { lastUsedAt: new Date() } }),
  ]);
  await audit({ action: "certificate.use", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "certificate", resourceId: id, metadata: { purpose: cleanPurpose }, meta: ctx.meta });
  return { pfx: openBytes(c.pfxEnc, key), passphrase: openBytes(c.passEnc, key).toString("utf8"), subjectCn: c.subjectCn, certificateId: id };
}

/** Avisa titular e administradores do cofre quando faltam 30 e 7 dias (ou já venceu). Idempotente. */
export async function runCertificateExpiryCheck(organizationId?: string, now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + EXPIRY_WARN_DAYS[0] * DAY);
  const certs = await db.certificate.findMany({ where: { revokedAt: null, notAfter: { lte: horizon }, ...(organizationId ? { organizationId } : {}) }, select: { id: true, label: true, organizationId: true, ownerUserId: true, notAfter: true } });
  let created = 0;
  for (const c of certs) {
    const left = c.notAfter.getTime() - now.getTime();
    const tier = left <= 0 ? "expired" : left <= EXPIRY_WARN_DAYS[1] * DAY ? "7" : "30";
    const admins = await db.membership.findMany({ where: { organizationId: c.organizationId, status: "ACTIVE", role: { permissions: { has: "certificates:manage" } } }, select: { userId: true } });
    const recipients = [...new Set([c.ownerUserId, ...admins.map((a) => a.userId)])];
    const when = tier === "expired" ? "VENCEU" : `vence em ${Math.max(1, Math.ceil(left / DAY))} dia(s)`;
    created += await notify(recipients.map((userId) => ({ organizationId: c.organizationId, userId, kind: "CERTIFICATE_EXPIRY", title: `Certificado digital "${c.label}" ${when}`, body: "Envie um certificado renovado no cofre para não interromper as consultas e protocolos.", link: "/certificados", dedupeKey: `cert-expiry:${c.id}:${tier}` })));
  }
  return created;
}
