import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { formatDocument, onlyDigits } from "@/lib/validation/br-documents";
import { formatPhone } from "@/lib/format/phone";
import { formatMoneyBR } from "@/lib/validation/money";
import { textToDocx } from "@/lib/templates/docx";
import { renderPreviewPdf } from "@/lib/templates/pdf";
import { resolveLetterhead } from "./letterhead.service";
import { expandSnippets, findUnknownVariables, longDate, renderTemplate, shortDate, TEMPLATE_VARIABLES, type MergeValues } from "@/lib/templates/merge";
import { assertCan, can, type TenantContext } from "@/server/context";
import { todayYmd } from "@/lib/dates/ymd";
import { audit } from "./audit.service";
import { assertCaseVisible } from "./case.service";
import { DOCUMENT_CATEGORIES } from "@/modules/documents/schemas";
import { sanitizeFileName, storeNewDocument } from "./document.service";
import { isUniqueViolation } from "./db-errors";
import { activeSnippetMap } from "./snippet.service";

export type TemplateInput = { name: string; description?: string | null; category?: string | null; body: string; active?: boolean };

function clean(i: TemplateInput, snippetSlugs: ReadonlySet<string>) {
  const name = i.name.trim();
  if (name.length < 3 || name.length > 120) throw new ValidationError("Nome inválido.", { name: ["Informe um nome de 3 a 120 caracteres."] });
  const body = i.body.replace(/\r\n/g, "\n");
  if (!body.trim()) throw new ValidationError("O modelo está vazio.", { body: ["Escreva o texto do modelo."] });
  if (body.length > 100_000) throw new ValidationError("Modelo muito longo.", { body: ["Máximo de 100.000 caracteres."] });
  const unknown = findUnknownVariables(body, snippetSlugs);
  if (unknown.length) throw new ValidationError("O modelo usa campos desconhecidos.", { body: [`Campos desconhecidos: ${unknown.map((u) => `{{${u}}}`).join(", ")}.`] });
  const category = i.category?.trim() || null;
  const description = i.description?.trim() || null;
  if (category && category.length > 60) throw new ValidationError("Categoria longa demais.", { category: ["Máximo de 60 caracteres."] });
  if (description && description.length > 500) throw new ValidationError("Descrição longa demais.", { description: ["Máximo de 500 caracteres."] });
  return { name, body, category, description, active: i.active ?? true };
}

export async function listTemplates(ctx: TenantContext) {
  assertCan(ctx, "documents:read");
  const manage = can(ctx, "templates:manage");
  return db.documentTemplate.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, ...(manage ? {} : { active: true }) },
    orderBy: { name: "asc" },
    take: 300,
    select: { id: true, name: true, description: true, category: true, active: true, updatedAt: true },
  });
}

export async function getTemplate(ctx: TenantContext, id: string) {
  assertCan(ctx, "documents:read");
  const t = await db.documentTemplate.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null } });
  if (!t || (!t.active && !can(ctx, "templates:manage"))) throw new NotFoundError("Modelo não encontrado.");
  return t;
}

export async function createTemplate(ctx: TenantContext, raw: TemplateInput) {
  assertCan(ctx, "templates:manage");
  const data = clean(raw, new Set((await activeSnippetMap(ctx.organizationId)).keys()));
  try {
    return await db.$transaction(async (tx) => {
      const t = await tx.documentTemplate.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId, updatedById: ctx.userId } });
      await audit({ action: "template.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "template", resourceId: t.id, meta: ctx.meta }, tx);
      return t;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ValidationError("Já existe um modelo com este nome.", { name: ["Já existe um modelo com este nome."] });
    throw err;
  }
}

export async function updateTemplate(ctx: TenantContext, id: string, raw: TemplateInput) {
  assertCan(ctx, "templates:manage");
  const data = clean(raw, new Set((await activeSnippetMap(ctx.organizationId)).keys()));
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.documentTemplate.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { ...data, updatedById: ctx.userId } });
      if (res.count === 0) throw new NotFoundError("Modelo não encontrado.");
      await audit({ action: "template.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "template", resourceId: id, meta: ctx.meta }, tx);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ValidationError("Já existe um modelo com este nome.", { name: ["Já existe um modelo com este nome."] });
    throw err;
  }
}

export async function deleteTemplate(ctx: TenantContext, id: string) {
  assertCan(ctx, "templates:manage");
  await db.$transaction(async (tx) => {
    const res = await tx.documentTemplate.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { deletedAt: new Date(), active: false } });
    if (res.count === 0) throw new NotFoundError("Modelo não encontrado.");
    await audit({ action: "template.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "template", resourceId: id, meta: ctx.meta }, tx);
  });
}

/** Coleta os valores de mesclagem. Só lê o que o usuário pode ver (sigilo do processo, permissão de clientes). */
async function collectValues(ctx: TenantContext, owner: { caseId?: string | null; clientId?: string | null }): Promise<MergeValues> {
  const [org, user] = await Promise.all([
    db.organization.findFirst({ where: { id: ctx.organizationId }, select: { name: true, legalName: true, document: true } }),
    db.user.findFirst({ where: { id: ctx.userId }, select: { name: true } }),
  ]);
  const today = todayYmd(ctx.timezone);
  const values: MergeValues = {
    "escritorio.nome": org?.legalName || org?.name,
    "advogado.nome": user?.name,
    "data.hoje": shortDate(today),
    "data.hoje_extenso": longDate(today),
    "escritorio.documento": org?.document ? formatDocument(onlyDigits(org.document).length > 11 ? "COMPANY" : "PERSON", org.document) : null,
  };
  let clientId = owner.clientId ?? null;
  if (owner.caseId) {
    assertCan(ctx, "cases:read");
    await assertCaseVisible(ctx, owner.caseId);
    const c = await db.case.findFirst({
      where: { id: owner.caseId, organizationId: ctx.organizationId, deletedAt: null },
      include: {
        parties: { orderBy: { createdAt: "asc" }, select: { clientId: true, role: true, name: true } },
        members: { where: { role: "RESPONSIBLE" }, take: 1, select: { user: { select: { name: true } } } },
      },
    });
    if (!c) throw new NotFoundError("Processo não encontrado.");
    values["processo.numero"] = c.number;
    values["processo.titulo"] = c.title;
    values["processo.tribunal"] = c.court;
    values["processo.vara"] = c.courtUnit;
    values["processo.area"] = c.area;
    values["processo.assunto"] = c.subject;
    values["processo.fase"] = c.phase;
    values["processo.valor_causa"] = c.claimValue ? formatMoneyBR(c.claimValue.toString()) : null;
    values["processo.numero_antigo"] = c.legacyNumber;
    values["processo.data_distribuicao"] = c.distributedAt ? shortDate(c.distributedAt.toISOString().slice(0, 10)) : null;
    values["processo.responsavel"] = c.members[0]?.user.name ?? null;
    const poles = (role: string) => c.parties.filter((p) => p.role === role).map((p) => p.name).join("; ") || null;
    values["processo.polo_ativo"] = poles("PLAINTIFF");
    values["processo.polo_passivo"] = poles("DEFENDANT");
    clientId = clientId ?? c.parties.find((p) => p.clientId)?.clientId ?? null;
  }
  if (clientId && can(ctx, "clients:read")) {
    const cl = await db.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null } });
    if (!cl) throw new NotFoundError("Cliente não encontrado.");
    values["cliente.nome"] = cl.name;
    values["cliente.documento"] = cl.document ? formatDocument(cl.type, cl.document) : null;
    values["cliente.email"] = cl.email;
    values["cliente.telefone"] = cl.phone ? formatPhone(cl.phone) : null;
    const street = [cl.addressStreet, cl.addressNumber].filter(Boolean).join(", ");
    const addr = [street, cl.addressComplement, cl.addressDistrict, [cl.addressCity, cl.addressState].filter(Boolean).join("/"), cl.addressZip].filter(Boolean).join(" — ");
    values["cliente.endereco"] = addr || null;
  }
  return values;
}

/** Texto mesclado de um modelo para um destino (processo OU cliente), com as mesmas regras de permissão e sigilo. */
async function mergeTemplate(ctx: TenantContext, templateId: string, owner: { caseId?: string | null; clientId?: string | null }, rawTitle: string) {
  if (!owner.caseId && !owner.clientId) throw new ValidationError("Informe o processo ou o cliente.");
  if (owner.caseId && owner.clientId) throw new ValidationError("Escolha o processo OU o cliente como destino.");
  const tpl = await getTemplate(ctx, templateId);
  if (!tpl.active) throw new ConflictError("O modelo está desativado.");
  const title = rawTitle.trim() || tpl.name;
  if (title.length > 120) throw new ValidationError("Título muito longo.", { title: ["Máximo de 120 caracteres."] });
  if (owner.clientId) {
    assertCan(ctx, "clients:read");
    const c = await db.client.findFirst({ where: { id: owner.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
    if (!c) throw new NotFoundError("Cliente não encontrado.");
  }
  const values = await collectValues(ctx, owner);
  const { text, missing } = renderTemplate(expandSnippets(tpl.body, await activeSnippetMap(ctx.organizationId)), values);
  const labels = new Map<string, string>(TEMPLATE_VARIABLES.map((v) => [v.key, v.label]));
  return { tpl, title, text, missing: missing.map((k) => labels.get(k) ?? k) };
}

/** Gera um .docx editável (com timbrado) a partir do modelo e o grava como documento (versão 1) do processo OU do cliente. */
export async function generateFromTemplate(ctx: TenantContext, templateId: string, owner: { caseId?: string | null; clientId?: string | null }, rawTitle: string, letterheadId?: string | null) {
  assertCan(ctx, "documents:write");
  const { tpl, title, text, missing } = await mergeTemplate(ctx, templateId, owner, rawTitle);
  const letterhead = await resolveLetterhead(ctx, letterheadId);
  const buffer = await textToDocx(text, title, letterhead);
  const fileName = sanitizeFileName(`${title}.docx`);
  const doc = await storeNewDocument(
    ctx,
    { caseId: owner.caseId ?? null, clientId: owner.clientId ?? null },
    { name: fileName, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer },
    { category: tpl.category && (DOCUMENT_CATEGORIES as readonly string[]).includes(tpl.category) ? tpl.category : null, description: `Gerado do modelo "${tpl.name}".`, source: "TEMPLATE", templateId: tpl.id },
  );
  return { id: doc.id, missing };
}

/** Prévia em PDF do documento que seria gerado. Não grava nada; só lê o que o usuário pode ver. */
export async function previewTemplatePdf(ctx: TenantContext, templateId: string, owner: { caseId?: string | null; clientId?: string | null }, rawTitle: string, letterheadId?: string | null) {
  assertCan(ctx, "documents:write");
  const { title, text, missing } = await mergeTemplate(ctx, templateId, owner, rawTitle);
  const letterhead = await resolveLetterhead(ctx, letterheadId);
  const pdf = await renderPreviewPdf(text, title, letterhead);
  return { pdf, title, missing };
}
