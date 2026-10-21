import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { runChatAutomations } from "./chat-automation.service";
import { isUniqueViolation } from "./db-errors";

/**
 * LegalOS Chat — etiquetas (marcadores coloridos) e campos personalizados das conversas.
 * Definir etiquetas/campos exige `whatsapp:manage`; aplicar numa conversa exige `whatsapp:write`.
 */

export const LABEL_COLORS = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#64748b"] as const;
export const FIELD_KINDS = ["TEXT", "NUMBER", "DATE", "SELECT"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];
export const FIELD_KIND_LABEL: Record<FieldKind, string> = { TEXT: "Texto", NUMBER: "Número", DATE: "Data", SELECT: "Lista de opções" };

const nameOf = (raw: string, what: string) => {
  const n = raw.trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 40) throw new ValidationError(`Informe um nome de 2 a 40 caracteres.`, { name: [`Nome ${what}: de 2 a 40 caracteres.`] });
  return n;
};

// ---------------- etiquetas ----------------

export async function listLabels(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:read");
  const rows = await db.whatsappLabel.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true, _count: { select: { conversations: true } } } });
  return rows.map((l) => ({ id: l.id, name: l.name, color: l.color, uses: l._count.conversations }));
}

export async function saveLabel(ctx: TenantContext, id: string | null, i: { name: string; color: string }) {
  assertCan(ctx, "whatsapp:manage");
  const name = nameOf(i.name, "da etiqueta");
  if (!/^#[0-9a-fA-F]{6}$/.test(i.color)) throw new ValidationError("Cor inválida.", { color: ["Escolha uma cor da lista."] });
  try {
    let saved: { id: string };
    if (id) {
      const cur = await db.whatsappLabel.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
      if (!cur) throw new NotFoundError("Etiqueta não encontrada.");
      saved = await db.whatsappLabel.update({ where: { id }, data: { name, color: i.color }, select: { id: true } });
    } else {
      saved = await db.whatsappLabel.create({ data: { organizationId: ctx.organizationId, name, color: i.color, createdById: ctx.userId }, select: { id: true } });
    }
    await audit({ action: id ? "whatsapp.label_update" : "whatsapp.label_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_label", resourceId: saved.id, meta: ctx.meta });
    return saved;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("Já existe uma etiqueta com esse nome.", { name: ["Já existe uma etiqueta com esse nome."] });
    throw e;
  }
}

export async function deleteLabel(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappLabel.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Etiqueta não encontrada.");
  await audit({ action: "whatsapp.label_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_label", resourceId: id, meta: ctx.meta });
}

/** Troca o conjunto de etiquetas da conversa. Deixa uma nota interna com o que mudou. */
export async function setConversationLabels(ctx: TenantContext, conversationId: string, labelIds: string[]) {
  assertCan(ctx, "whatsapp:write");
  const conv = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!conv) throw new NotFoundError("Conversa não encontrada.");
  const want = [...new Set(labelIds)];
  const labels = await db.whatsappLabel.findMany({ where: { organizationId: ctx.organizationId, id: { in: want } }, select: { id: true, name: true } });
  if (labels.length !== want.length) throw new ValidationError("Etiqueta inválida.", { labels: ["Escolha etiquetas do escritório."] });
  const cur = await db.whatsappConversationLabel.findMany({ where: { conversationId, organizationId: ctx.organizationId }, select: { label: { select: { id: true, name: true } } } });
  const have = new Map(cur.map((c) => [c.label.id, c.label.name]));
  const add = labels.filter((l) => !have.has(l.id));
  const remove = [...have.entries()].filter(([id]) => !want.includes(id));
  if (add.length === 0 && remove.length === 0) return { added: 0, removed: 0 };
  await db.$transaction([
    db.whatsappConversationLabel.deleteMany({ where: { conversationId, organizationId: ctx.organizationId, labelId: { in: remove.map(([id]) => id) } } }),
    db.whatsappConversationLabel.createMany({ data: add.map((l) => ({ conversationId, labelId: l.id, organizationId: ctx.organizationId })), skipDuplicates: true }),
  ]);
  const parts = [add.length ? `adicionou ${add.map((l) => `“${l.name}”`).join(", ")}` : "", remove.length ? `removeu ${remove.map(([, n]) => `“${n}”`).join(", ")}` : ""].filter(Boolean);
  await db.whatsappMessage.create({ data: { organizationId: ctx.organizationId, conversationId, direction: "NOTE", type: "text", body: `Etiquetas: ${parts.join("; ")}.`, status: "NOTE", authorId: ctx.userId } });
  await audit({ action: "whatsapp.labels_set", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, metadata: { added: add.length, removed: remove.length }, meta: ctx.meta });
  for (const l of add) await runChatAutomations(ctx.organizationId, conversationId, { trigger: "LABEL_ADDED", eventKey: `label:${l.id}:${Date.now()}`, labelId: l.id, actorId: ctx.userId });
  return { added: add.length, removed: remove.length };
}

// ---------------- campos personalizados ----------------

export type FieldRow = { id: string; name: string; kind: FieldKind; options: string[]; active: boolean; uses: number };

export async function listFields(ctx: TenantContext, onlyActive = false): Promise<FieldRow[]> {
  assertCan(ctx, "whatsapp:read");
  const rows = await db.whatsappField.findMany({ where: { organizationId: ctx.organizationId, ...(onlyActive ? { active: true } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true, options: true, active: true, _count: { select: { values: true } } } });
  return rows.map((f) => ({ id: f.id, name: f.name, kind: f.kind as FieldKind, options: f.options, active: f.active, uses: f._count.values }));
}

export async function saveField(ctx: TenantContext, id: string | null, i: { name: string; kind: FieldKind; options?: string[]; active?: boolean }) {
  assertCan(ctx, "whatsapp:manage");
  const name = nameOf(i.name, "do campo");
  if (!(FIELD_KINDS as readonly string[]).includes(i.kind)) throw new ValidationError("Tipo de campo inválido.", { kind: ["Escolha o tipo do campo."] });
  const options = i.kind === "SELECT" ? [...new Set((i.options ?? []).map((o) => o.trim()).filter(Boolean))] : [];
  if (i.kind === "SELECT" && (options.length < 2 || options.length > 30 || options.some((o) => o.length > 60))) throw new ValidationError("Informe de 2 a 30 opções.", { options: ["Informe de 2 a 30 opções (até 60 caracteres cada)."] });
  try {
    let saved: { id: string };
    if (id) {
      const cur = await db.whatsappField.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, kind: true, _count: { select: { values: true } } } });
      if (!cur) throw new NotFoundError("Campo não encontrado.");
      if (cur.kind !== i.kind && cur._count.values > 0) throw new ConflictError("Este campo já tem valores preenchidos: não dá para trocar o tipo. Crie outro campo.");
      saved = await db.whatsappField.update({ where: { id }, data: { name, kind: i.kind, options, active: i.active ?? true }, select: { id: true } });
    } else {
      saved = await db.whatsappField.create({ data: { organizationId: ctx.organizationId, name, kind: i.kind, options, active: i.active ?? true, createdById: ctx.userId }, select: { id: true } });
    }
    await audit({ action: id ? "whatsapp.field_update" : "whatsapp.field_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_field", resourceId: saved.id, metadata: { kind: i.kind }, meta: ctx.meta });
    return saved;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("Já existe um campo com esse nome.", { name: ["Já existe um campo com esse nome."] });
    throw e;
  }
}

export async function deleteField(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappField.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Campo não encontrado.");
  await audit({ action: "whatsapp.field_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_field", resourceId: id, meta: ctx.meta });
}

export function cleanValue(f: { name: string; kind: string; options: string[] }, raw: string): string {
  const v = raw.trim();
  const bad = (m: string) => new ValidationError(m, { [f.name]: [m] });
  if (v.length > 500) throw bad(`${f.name}: no máximo 500 caracteres.`);
  if (f.kind === "NUMBER") {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) throw bad(`${f.name}: informe um número.`);
    return String(n);
  }
  if (f.kind === "DATE") {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    const ok = d && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
    if (!ok) throw bad(`${f.name}: informe uma data válida.`);
    return v;
  }
  if (f.kind === "SELECT" && !f.options.includes(v)) throw bad(`${f.name}: escolha uma das opções.`);
  return v;
}

/** Grava os valores dos campos da conversa. Valor vazio (ou null) apaga. Só campos ativos. */
export async function setFieldValues(ctx: TenantContext, conversationId: string, values: Record<string, string | null>) {
  assertCan(ctx, "whatsapp:write");
  const conv = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!conv) throw new NotFoundError("Conversa não encontrada.");
  const ids = Object.keys(values);
  const fields = await db.whatsappField.findMany({ where: { organizationId: ctx.organizationId, id: { in: ids }, active: true }, select: { id: true, name: true, kind: true, options: true } });
  if (fields.length !== ids.length) throw new ValidationError("Campo inválido.", { fields: ["Use apenas campos ativos do escritório."] });
  const upserts: { id: string; value: string }[] = [];
  const deletes: string[] = [];
  for (const f of fields) {
    const raw = values[f.id];
    if (raw == null || raw.trim() === "") deletes.push(f.id);
    else upserts.push({ id: f.id, value: cleanValue(f, raw) });
  }
  await db.$transaction([
    db.whatsappFieldValue.deleteMany({ where: { conversationId, organizationId: ctx.organizationId, fieldId: { in: deletes } } }),
    ...upserts.map((u) => db.whatsappFieldValue.upsert({
      where: { conversationId_fieldId: { conversationId, fieldId: u.id } },
      create: { conversationId, fieldId: u.id, organizationId: ctx.organizationId, value: u.value },
      update: { value: u.value },
    })),
  ]);
  await audit({ action: "whatsapp.fields_set", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, metadata: { set: upserts.length, cleared: deletes.length }, meta: ctx.meta });
  return { set: upserts.length, cleared: deletes.length };
}

/** Etiquetas e valores da conversa, para a tela. */
export async function conversationMeta(ctx: TenantContext, conversationId: string) {
  assertCan(ctx, "whatsapp:read");
  const [labels, values] = await Promise.all([
    db.whatsappConversationLabel.findMany({ where: { conversationId, organizationId: ctx.organizationId }, select: { labelId: true } }),
    db.whatsappFieldValue.findMany({ where: { conversationId, organizationId: ctx.organizationId }, select: { fieldId: true, value: true } }),
  ]);
  return { labelIds: labels.map((l) => l.labelId), values: Object.fromEntries(values.map((v) => [v.fieldId, v.value])) as Record<string, string> };
}
