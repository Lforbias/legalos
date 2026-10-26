import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ConflictError } from "@/lib/permissions/check";
import { prospectEditSchema } from "@/modules/prospecting/schema";
import { assertPlatform, type PlatformCtx } from "./platform.service";
import { audit } from "./audit.service";

export async function listCommercialProspects(pc: PlatformCtx, filters: { q?: string; stage?: string; neighborhood?: string; location?: string; page?: number; blocked?: string }) {
  await assertPlatform(pc);
  const q = filters.q?.trim().slice(0, 100);
  const where: Prisma.CommercialProspectWhereInput = {
    ...(q ? { OR: [{ legalName: { contains: q, mode: "insensitive" } }, { tradeName: { contains: q, mode: "insensitive" } }, { cnpj: { contains: q.replace(/[.\-/]/g, "") } }, { postalCode: { contains: q.replace(/-/g, "") } }] } : {}),
    ...(filters.stage ? { stage: filters.stage } : {}),
    ...(filters.neighborhood ? { neighborhood: filters.neighborhood } : {}),
    ...(filters.location === "located" ? { latitude: { not: null } } : filters.location === "pending" ? { latitude: null } : {}),
    ...(filters.blocked === "yes" ? { doNotContact: true } : filters.blocked === "no" ? { doNotContact: false } : {}),
  };
  const total = await db.commercialProspect.count({ where });
  const pages = Math.max(1, Math.ceil(total / 50));
  const page = Math.min(pages, Math.max(1, Math.trunc(filters.page || 1)));
  const [items, points, locatedFiltered, count, located, blocked, latest, neighborhoods] = await Promise.all([
    db.commercialProspect.findMany({ where, orderBy: [{ legalName: "asc" }, { cnpj: "asc" }], take: 50, skip: (page - 1) * 50 }),
    db.commercialProspect.findMany({ where: { AND: [where, { latitude: { not: null } }] }, select: { cnpj: true, legalName: true, latitude: true, longitude: true, doNotContact: true, locationAccuracy: true }, orderBy: { cnpj: "asc" }, take: 2000 }),
    db.commercialProspect.count({ where: { AND: [where, { latitude: { not: null } }] } }),
    db.commercialProspect.count(), db.commercialProspect.count({ where: { latitude: { not: null } } }),
    db.commercialProspect.count({ where: { doNotContact: true } }),
    db.commercialProspect.aggregate({ _max: { sourceMonth: true, importedAt: true } }),
    db.commercialProspect.findMany({ distinct: ["neighborhood"], select: { neighborhood: true }, orderBy: { neighborhood: "asc" } }),
  ]);
  return { items, points, locatedFiltered, total, page, pages, count, located, blocked, latest: latest._max, neighborhoods: neighborhoods.map(n => n.neighborhood).filter(Boolean) };
}

export async function getCommercialProspect(pc: PlatformCtx, cnpj: string) {
  await assertPlatform(pc);
  return db.commercialProspect.findUnique({ where: { cnpj } });
}

export async function updateCommercialProspect(pc: PlatformCtx, input: unknown) {
  await assertPlatform(pc);
  const { cnpj, version, ...data } = prospectEditSchema.parse(input);
  return db.$transaction(async tx => {
    const current = await tx.commercialProspect.findUnique({ where: { cnpj } });
    if (!current || current.version !== version) throw new ConflictError("Este cadastro foi atualizado. Reabra a ficha antes de salvar.");
    const moved = current.latitude !== data.latitude || current.longitude !== data.longitude || current.locationAccuracy !== data.locationAccuracy;
    const changed = await tx.commercialProspect.updateMany({ where: { cnpj, version }, data: {
      ...data, locationAccuracy: data.latitude === null ? null : data.locationAccuracy,
      locationSource: data.latitude === null ? null : moved ? "Conferência manual" : current.locationSource,
      version: { increment: 1 },
    } });
    if (!changed.count) throw new ConflictError("Este cadastro foi atualizado. Reabra a ficha antes de salvar.");
    if (data.doNotContact) await tx.comProspect.updateMany({ where: { cnpj, deletedAt: null }, data: { doNotContact: true, nextActionAt: null, nextActionNote: null } });
    await audit({ action: "platform.prospect.updated", userId: pc.userId, resourceType: "commercial_prospect", resourceId: cnpj, meta: pc.meta, metadata: { stage: data.stage, doNotContact: data.doNotContact, locationChanged: moved } }, tx);
  });
}
