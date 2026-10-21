import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { customFieldDefSchema, customFieldKey, customValuesSchema, parseOptions, type CustomFieldDefInput } from "@/modules/cases/extras-schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, logCaseEvent } from "./case.service";
import { isUniqueViolation } from "./db-errors";

/** 3.0-F1 — campos personalizados de processo: definidos por quem administra, preenchidos por quem edita o processo. */

export async function listCustomFields(ctx: TenantContext, opts: { includeInactive?: boolean } = {}) {
  assertCan(ctx, "cases:read");
  return db.customFieldDef.findMany({
    where: { organizationId: ctx.organizationId, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function createCustomField(ctx: TenantContext, raw: CustomFieldDefInput) {
  assertCan(ctx, "organization:manage");
  const input = customFieldDefSchema.parse(raw);
  const key = customFieldKey(input.label);
  if (!key) throw new ValidationError("Nome inválido.", { label: ["Use letras ou números no nome do campo."] });
  const count = await db.customFieldDef.count({ where: { organizationId: ctx.organizationId } });
  if (count >= 30) throw new ValidationError("Limite de 30 campos personalizados atingido.");
  try {
    const row = await db.customFieldDef.create({
      data: { organizationId: ctx.organizationId, key, label: input.label, type: input.type, options: input.type === "SELECT" ? parseOptions(input.options) : [], position: count },
    });
    await audit({ action: "custom_field.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "custom_field", resourceId: row.id, meta: ctx.meta });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Já existe um campo com este nome.");
    throw err;
  }
}

/** Desativar esconde o campo, mas mantém os valores já preenchidos nos processos. */
export async function setCustomFieldActive(ctx: TenantContext, id: string, active: boolean) {
  assertCan(ctx, "organization:manage");
  const r = await db.customFieldDef.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { active } });
  if (r.count === 0) throw new NotFoundError("Campo não encontrado.");
  await audit({ action: active ? "custom_field.enable" : "custom_field.disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "custom_field", resourceId: id, meta: ctx.meta });
}

const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Grava os valores do processo. Valor vazio apaga o campo. Chaves desconhecidas ou inativas são recusadas. */
export async function setCaseCustomFields(ctx: TenantContext, caseId: string, raw: unknown) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const values = customValuesSchema.parse(raw);
  const defs = await db.customFieldDef.findMany({ where: { organizationId: ctx.organizationId, active: true } });
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const errors: Record<string, string[]> = {};
  const clean: Record<string, string> = {};
  for (const [key, v] of Object.entries(values)) {
    const def = byKey.get(key);
    const value = v.trim();
    if (!def) {
      errors[key] = ["Campo inexistente ou desativado."];
      continue;
    }
    if (value === "") continue;
    if (def.type === "NUMBER" && !Number.isFinite(Number(value.replace(",", ".")))) errors[key] = ["Informe um número."];
    else if (def.type === "DATE" && !isYmd(value)) errors[key] = ["Data inválida."];
    else if (def.type === "SELECT" && !def.options.includes(value)) errors[key] = ["Opção inválida."];
    else clean[key] = def.type === "NUMBER" ? value.replace(",", ".") : value;
  }
  if (Object.keys(errors).length) throw new ValidationError("Corrija os campos personalizados.", errors);
  await db.$transaction(async (tx) => {
    const current = await tx.case.findFirstOrThrow({ where: { id: caseId, organizationId: ctx.organizationId }, select: { customFields: true } });
    // preserva o que não veio no envio (inclusive campos desativados)
    const keep = Object.fromEntries(Object.entries((current.customFields ?? {}) as Record<string, string>).filter(([k]) => !(k in values)));
    await tx.case.update({ where: { id: caseId }, data: { customFields: { ...keep, ...clean } } });
    await logCaseEvent(tx, ctx, caseId, { kind: "CUSTOM_FIELDS", title: "Campos personalizados atualizados" });
    await audit({ action: "case.custom_fields", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, meta: ctx.meta }, tx);
  });
}
