import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError } from "@/lib/permissions/check";
import { onlyDigits } from "@/lib/validation/br-documents";
import { registrySchema, type RegistryInput } from "@/modules/registry/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { PAGE_SIZE } from "./client.service";

/**
 * 3.0-F1 — cadastro único de partes (adversários, advogados, órgãos), reaproveitável entre processos.
 * Clientes do escritório continuam no cadastro de clientes; aqui ficam as demais partes.
 */

const data = (i: RegistryInput) => ({
  kind: i.kind,
  name: i.name.trim(),
  document: i.document ? onlyDigits(i.document) || i.document.trim() : null,
  profession: i.profession || null,
  issuingOrgan: i.issuingOrgan || null,
  email: i.email || null,
  phone: i.phone || null,
  notes: i.notes || null,
});

function searchWhere(ctx: TenantContext, q?: string): Prisma.PartyRegistryWhereInput {
  const and: Prisma.PartyRegistryWhereInput[] = [{ organizationId: ctx.organizationId, deletedAt: null }];
  const term = q?.trim().slice(0, 80);
  if (term) {
    const digits = onlyDigits(term);
    const or: Prisma.PartyRegistryWhereInput[] = [{ name: { contains: term, mode: "insensitive" } }, { profession: { contains: term, mode: "insensitive" } }];
    if (digits.length >= 3) or.push({ document: { contains: digits } });
    and.push({ OR: or });
  }
  return { AND: and };
}

export async function listRegistry(ctx: TenantContext, f: { q?: string; page?: number } = {}) {
  assertCan(ctx, "cases:read");
  const page = Math.max(1, f.page ?? 1);
  const where = searchWhere(ctx, f.q);
  const [total, items] = await Promise.all([
    db.partyRegistry.count({ where }),
    db.partyRegistry.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { caseParties: true } } },
    }),
  ]);
  return { total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), items };
}

/** Busca rápida para o seletor de partes do processo. */
export async function searchRegistry(ctx: TenantContext, q: string) {
  assertCan(ctx, "cases:read");
  if (q.trim().length < 2) return [];
  return db.partyRegistry.findMany({
    where: searchWhere(ctx, q),
    orderBy: { name: "asc" },
    take: 8,
    select: { id: true, kind: true, name: true, document: true, profession: true },
  });
}

export async function createRegistryParty(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "cases:write");
  const input = registrySchema.parse(raw);
  const d = data(input);
  if (d.document) {
    const dup = await db.partyRegistry.findFirst({ where: { organizationId: ctx.organizationId, deletedAt: null, document: d.document }, select: { id: true, name: true } });
    if (dup) throw new ConflictError(`Já existe no cadastro uma parte com este documento: ${dup.name}.`);
  }
  const row = await db.partyRegistry.create({ data: { ...d, organizationId: ctx.organizationId, createdById: ctx.userId } });
  await audit({ action: "registry.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "party_registry", resourceId: row.id, meta: ctx.meta });
  return row;
}

export async function updateRegistryParty(ctx: TenantContext, id: string, raw: unknown) {
  assertCan(ctx, "cases:write");
  const input = registrySchema.parse(raw);
  const existing = await db.partyRegistry.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError("Parte não encontrada.");
  const d = data(input);
  if (d.document) {
    const dup = await db.partyRegistry.findFirst({ where: { organizationId: ctx.organizationId, deletedAt: null, document: d.document, id: { not: id } }, select: { name: true } });
    if (dup) throw new ConflictError(`Já existe no cadastro uma parte com este documento: ${dup.name}.`);
  }
  await db.$transaction(async (tx) => {
    await tx.partyRegistry.update({ where: { id }, data: d });
    // mantém a cópia do nome/documento nos processos já vinculados
    await tx.caseParty.updateMany({ where: { registryId: id, organizationId: ctx.organizationId }, data: { name: d.name, document: d.document } });
    await audit({ action: "registry.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "party_registry", resourceId: id, meta: ctx.meta }, tx);
  });
}

/** Exclusão lógica; os processos já vinculados mantêm a cópia dos dados da parte. */
export async function deleteRegistryParty(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:write");
  const existing = await db.partyRegistry.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError("Parte não encontrada.");
  await db.partyRegistry.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "registry.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "party_registry", resourceId: id, meta: ctx.meta });
}

/** Processos (visíveis ao usuário) em que a parte atua. */
export async function casesOfRegistryParty(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:read");
  const { caseVisibility } = await import("./case.service");
  return db.case.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, parties: { some: { registryId: id } } }, caseVisibility(ctx)] },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, number: true, title: true, status: true },
  });
}
