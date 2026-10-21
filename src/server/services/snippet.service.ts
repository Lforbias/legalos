import { db } from "@/lib/db/client";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { findUnknownVariables, isSnippetKey, SNIPPET_SLUG_RE, extractVariables } from "@/lib/templates/merge";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { isUniqueViolation } from "./db-errors";

export type SnippetInput = { slug: string; name: string; description?: string | null; body: string; active?: boolean };

function clean(i: SnippetInput) {
  const slug = i.slug.trim().toLowerCase();
  if (!SNIPPET_SLUG_RE.test(slug) || slug.length > 60) throw new ValidationError("Código inválido.", { slug: ["Use letras minúsculas, números e hífens (ex.: pedidos-finais), até 60 caracteres."] });
  const name = i.name.trim();
  if (name.length < 3 || name.length > 120) throw new ValidationError("Nome inválido.", { name: ["Informe um nome de 3 a 120 caracteres."] });
  const body = i.body.replace(/\r\n/g, "\n");
  if (!body.trim()) throw new ValidationError("O autotexto está vazio.", { body: ["Escreva o texto."] });
  if (body.length > 20_000) throw new ValidationError("Autotexto muito longo.", { body: ["Máximo de 20.000 caracteres."] });
  if (extractVariables(body).some(isSnippetKey)) throw new ValidationError("Autotexto dentro de autotexto não é permitido.", { body: ["Um autotexto não pode usar {{autotexto.…}}."] });
  const unknown = findUnknownVariables(body);
  if (unknown.length) throw new ValidationError("O autotexto usa campos desconhecidos.", { body: [`Campos desconhecidos: ${unknown.map((u) => `{{${u}}}`).join(", ")}.`] });
  const description = i.description?.trim() || null;
  if (description && description.length > 300) throw new ValidationError("Descrição longa demais.", { description: ["Máximo de 300 caracteres."] });
  return { slug, name, body, description, active: i.active ?? true };
}

const dupSlug = () => new ValidationError("Já existe um autotexto com este código.", { slug: ["Já existe um autotexto com este código."] });

export async function listSnippets(ctx: TenantContext) {
  assertCan(ctx, "documents:read");
  const manage = can(ctx, "templates:manage");
  return db.textSnippet.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, ...(manage ? {} : { active: true }) },
    orderBy: { slug: "asc" },
    take: 500,
    select: { id: true, slug: true, name: true, description: true, active: true, updatedAt: true },
  });
}

export async function getSnippet(ctx: TenantContext, id: string) {
  assertCan(ctx, "templates:manage");
  const s = await db.textSnippet.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null } });
  if (!s) throw new NotFoundError("Autotexto não encontrado.");
  return s;
}

export async function createSnippet(ctx: TenantContext, raw: SnippetInput) {
  assertCan(ctx, "templates:manage");
  const data = clean(raw);
  try {
    return await db.$transaction(async (tx) => {
      const s = await tx.textSnippet.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId, updatedById: ctx.userId } });
      await audit({ action: "snippet.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "snippet", resourceId: s.id, meta: ctx.meta }, tx);
      return s;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw dupSlug();
    throw e;
  }
}

export async function updateSnippet(ctx: TenantContext, id: string, raw: SnippetInput) {
  assertCan(ctx, "templates:manage");
  const data = clean(raw);
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.textSnippet.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { ...data, updatedById: ctx.userId } });
      if (res.count === 0) throw new NotFoundError("Autotexto não encontrado.");
      await audit({ action: "snippet.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "snippet", resourceId: id, meta: ctx.meta }, tx);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw dupSlug();
    throw e;
  }
}

export async function deleteSnippet(ctx: TenantContext, id: string) {
  assertCan(ctx, "templates:manage");
  await db.$transaction(async (tx) => {
    const res = await tx.textSnippet.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { deletedAt: new Date(), active: false } });
    if (res.count === 0) throw new NotFoundError("Autotexto não encontrado.");
    await audit({ action: "snippet.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "snippet", resourceId: id, meta: ctx.meta }, tx);
  });
}

/** Autotextos ATIVOS do escritório (slug → texto), para a mesclagem. */
export async function activeSnippetMap(organizationId: string): Promise<Map<string, string>> {
  const rows = await db.textSnippet.findMany({ where: { organizationId, deletedAt: null, active: true }, select: { slug: true, body: true } });
  return new Map(rows.map((r) => [r.slug, r.body]));
}
