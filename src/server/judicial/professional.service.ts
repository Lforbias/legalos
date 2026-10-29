import { db } from "@/lib/db/client";
import { UFS } from "@/lib/mni/tribunals";
import { ValidationError } from "@/lib/permissions/check";
import { onlyDigits } from "@/lib/validation/br-documents";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "@/server/services/audit.service";

/** Identidade profissional (advogado + OAB) cujas comunicações o Box monitora. Um escritório pode ter várias. */
export type ProfessionalInput = { name: string; oabNumber: string; oabUf: string; notifyEmail?: string | null; userId?: string | null };

export function normalizeOab(oabNumber: string, oabUf: string): { oabNumber: string; oabUf: string } {
  const number = onlyDigits(oabNumber).replace(/^0+/, "");
  if (!/^[0-9]{1,7}$/.test(number)) throw new ValidationError("Informe o número da OAB (somente dígitos, até 7).", { oabNumber: ["Número inválido."] });
  const uf = oabUf.trim().toUpperCase();
  if (!UFS.includes(uf)) throw new ValidationError("Selecione a seccional (UF) da OAB.", { oabUf: ["UF inválida."] });
  return { oabNumber: number, oabUf: uf };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Garante a identidade profissional (idempotente por OAB + UF). Não duplica: a mesma OAB no mesmo escritório é a mesma pessoa.
 * Usado pelo cadastro de monitoramento, pelo onboarding e pela migração de monitoramentos antigos.
 */
export async function ensureProfessional(organizationId: string, input: ProfessionalInput, createdById: string | null = null): Promise<{ id: string; created: boolean }> {
  const { oabNumber, oabUf } = normalizeOab(input.oabNumber, input.oabUf);
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new ValidationError("Informe o nome do profissional (2 a 120 caracteres).", { name: ["Nome inválido."] });
  const email = input.notifyEmail?.trim() || null;
  if (email && !EMAIL_RE.test(email)) throw new ValidationError("E-mail para avisos inválido.", { notifyEmail: ["E-mail inválido."] });
  const found = await db.professionalIdentity.findUnique({ where: { organizationId_oabUf_oabNumber: { organizationId, oabUf, oabNumber } }, select: { id: true, active: true } });
  if (found) {
    if (!found.active) await db.professionalIdentity.update({ where: { id: found.id }, data: { active: true } });
    return { id: found.id, created: false };
  }
  const row = await db.professionalIdentity.create({ data: { organizationId, userId: input.userId ?? null, name, oabNumber, oabUf, notifyEmail: email, createdById }, select: { id: true } });
  return { id: row.id, created: true };
}

export async function listProfessionals(ctx: TenantContext) {
  assertCan(ctx, "integrations:manage");
  return db.professionalIdentity.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, oabNumber: true, oabUf: true, notifyEmail: true, active: true, userId: true } });
}

/** Cadastro explícito (tela de Configurações/onboarding): valida duplicidade e audita. */
export async function addProfessional(ctx: TenantContext, input: ProfessionalInput) {
  assertCan(ctx, "integrations:manage");
  const r = await ensureProfessional(ctx.organizationId, input, ctx.userId);
  if (!r.created) throw new ValidationError("Essa OAB já está cadastrada neste escritório.", { oabNumber: ["Essa OAB já está cadastrada."] });
  await audit({ action: "professional.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "professional_identity", resourceId: r.id, metadata: { oabUf: input.oabUf.trim().toUpperCase() }, meta: ctx.meta });
  return r;
}
