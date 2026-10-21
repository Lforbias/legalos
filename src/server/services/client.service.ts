import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { onlyDigits } from "@/lib/validation/br-documents";
import { clientSchema, contactSchema, toClientData, type ClientInput, type ContactInput } from "@/modules/clients/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { isUniqueViolation } from "./db-errors";

export const PAGE_SIZE = 20;

export type ClientListFilters = {
  q?: string;
  status?: "PROSPECT" | "ACTIVE" | "INACTIVE";
  type?: "PERSON" | "COMPANY";
  tag?: string;
  page?: number;
};

function listWhere(ctx: TenantContext, f: ClientListFilters): Prisma.ClientWhereInput {
  const where: Prisma.ClientWhereInput = { organizationId: ctx.organizationId, deletedAt: null };
  if (f.status) where.status = f.status;
  if (f.type) where.type = f.type;
  if (f.tag) where.tags = { has: f.tag };
  const q = f.q?.trim().slice(0, 80);
  if (q) {
    const digits = onlyDigits(q);
    const or: Prisma.ClientWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
      { tradeName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
    if (digits.length >= 3) or.push({ document: { contains: digits } }, { phone: { contains: digits } });
    where.OR = or;
  }
  return where;
}

export async function listClients(ctx: TenantContext, filters: ClientListFilters = {}) {
  assertCan(ctx, "clients:read");
  const page = Math.max(1, filters.page ?? 1);
  const where = listWhere(ctx, filters);
  const [total, rows] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, type: true, status: true, name: true, tradeName: true, document: true, email: true, phone: true, tags: true, createdAt: true,
        _count: { select: { parties: true } },
      },
    }),
  ]);
  return { total, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), items: rows };
}

/** Lista leve para seletores (autocompletar) em formulários de processo. */
export async function searchClientsForSelect(ctx: TenantContext, q: string, limit = 8) {
  assertCan(ctx, "clients:read");
  const term = q.trim().slice(0, 80);
  return db.client.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, ...(term ? { name: { contains: term, mode: "insensitive" } } : {}) },
    orderBy: { name: "asc" },
    take: limit,
    select: { id: true, name: true, type: true, document: true },
  });
}

export async function getClient(ctx: TenantContext, id: string) {
  assertCan(ctx, "clients:read");
  const client = await db.client.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null },
    include: { contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } },
  });
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  return client;
}

export async function listClientTags(ctx: TenantContext): Promise<string[]> {
  assertCan(ctx, "clients:read");
  const rows = await db.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest(tags) AS tag FROM clients
    WHERE organization_id = ${ctx.organizationId}::uuid AND deleted_at IS NULL ORDER BY 1 LIMIT 100`;
  return rows.map((r) => r.tag);
}

async function assertDocumentFree(ctx: TenantContext, document: string | null, ignoreId?: string) {
  if (!document) return;
  const dup = await db.client.findFirst({
    where: { organizationId: ctx.organizationId, document, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true, name: true },
  });
  if (dup) throw new ConflictError(`Já existe um cliente com este documento neste escritório: ${dup.name}.`);
}

export async function createClient(ctx: TenantContext, raw: ClientInput) {
  assertCan(ctx, "clients:write");
  const data = toClientData(clientSchema.parse(raw));
  await assertDocumentFree(ctx, data.document);
  try {
    const client = await db.client.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId } });
    await audit({
      action: "client.create",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceType: "client",
      resourceId: client.id,
      metadata: { type: client.type },
      meta: ctx.meta,
    });
    return client;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Já existe um cliente com este documento neste escritório.");
    throw err;
  }
}

export async function updateClient(ctx: TenantContext, id: string, raw: ClientInput) {
  assertCan(ctx, "clients:write");
  const existing = await db.client.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null } });
  if (!existing) throw new NotFoundError("Cliente não encontrado.");
  const data = toClientData(clientSchema.parse(raw));
  if (existing.type !== data.type) {
    throw new ValidationError("O tipo de pessoa não pode ser alterado depois do cadastro.", { type: ["Não é possível alterar o tipo."] });
  }
  await assertDocumentFree(ctx, data.document, id);
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => JSON.stringify(data[k]) !== JSON.stringify(existing[k as keyof typeof existing]));
  try {
    const client = await db.client.update({ where: { id }, data });
    await audit({
      action: "client.update",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceType: "client",
      resourceId: id,
      metadata: { fields: changed },
      meta: ctx.meta,
    });
    return client;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Já existe um cliente com este documento neste escritório.");
    throw err;
  }
}

/** Exclusão lógica. Bloqueada enquanto o cliente estiver vinculado a processos em andamento ou suspensos. */
export async function archiveClient(ctx: TenantContext, id: string) {
  assertCan(ctx, "clients:delete");
  const client = await db.client.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null } });
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  const openCases = await db.caseParty.count({
    where: { clientId: id, organizationId: ctx.organizationId, case: { deletedAt: null, status: { in: ["ACTIVE", "SUSPENDED"] } } },
  });
  if (openCases > 0) {
    throw new ConflictError(`Este cliente está vinculado a ${openCases} processo(s) em andamento. Encerre ou desvincule antes de excluir.`);
  }
  await db.client.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE" } });
  await audit({ action: "client.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client", resourceId: id, meta: ctx.meta });
}

// ---------- contatos ----------

async function getClientForWrite(ctx: TenantContext, clientId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  return client;
}

function toContactData(input: ContactInput) {
  const v = contactSchema.parse(input);
  return {
    name: v.name,
    role: v.role || null,
    email: v.email ? v.email.toLowerCase() : null,
    phone: v.phone ? onlyDigits(v.phone) : null,
    isPrimary: v.isPrimary,
    notes: v.notes || null,
  };
}

export async function addContact(ctx: TenantContext, clientId: string, input: ContactInput) {
  assertCan(ctx, "clients:write");
  await getClientForWrite(ctx, clientId);
  const data = toContactData(input);
  const contact = await db.$transaction(async (tx) => {
    if (data.isPrimary) await tx.clientContact.updateMany({ where: { clientId, organizationId: ctx.organizationId }, data: { isPrimary: false } });
    return tx.clientContact.create({ data: { ...data, clientId, organizationId: ctx.organizationId } });
  });
  await audit({ action: "client.contact_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client", resourceId: clientId, metadata: { contactId: contact.id }, meta: ctx.meta });
  return contact;
}

export async function updateContact(ctx: TenantContext, contactId: string, input: ContactInput) {
  assertCan(ctx, "clients:write");
  const existing = await db.clientContact.findFirst({ where: { id: contactId, organizationId: ctx.organizationId, client: { deletedAt: null } } });
  if (!existing) throw new NotFoundError("Contato não encontrado.");
  const data = toContactData(input);
  await db.$transaction(async (tx) => {
    if (data.isPrimary) await tx.clientContact.updateMany({ where: { clientId: existing.clientId, organizationId: ctx.organizationId, id: { not: contactId } }, data: { isPrimary: false } });
    await tx.clientContact.update({ where: { id: contactId }, data });
  });
  await audit({ action: "client.contact_update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client", resourceId: existing.clientId, metadata: { contactId }, meta: ctx.meta });
}

export async function deleteContact(ctx: TenantContext, contactId: string) {
  assertCan(ctx, "clients:write");
  const existing = await db.clientContact.findFirst({ where: { id: contactId, organizationId: ctx.organizationId, client: { deletedAt: null } } });
  if (!existing) throw new NotFoundError("Contato não encontrado.");
  await db.clientContact.delete({ where: { id: contactId } });
  await audit({ action: "client.contact_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client", resourceId: existing.clientId, metadata: { contactId }, meta: ctx.meta });
}

