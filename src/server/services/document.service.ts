import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { deleteObject, putObject } from "@/lib/storage/local-storage";
import { assertStorageAvailable } from "./plan.service";
import { assertCan, can, type TenantContext } from "@/server/context";
import type { Prisma } from "@prisma/client";
import { DOCUMENT_CATEGORIES } from "@/modules/documents/schemas";
import { audit } from "./audit.service";
import { assertCaseVisible, caseVisibility, logCaseEvent } from "./case.service";

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // abaixo do limite de 10 MB de buffer do proxy do Next

type Sniff = (b: Buffer) => boolean;
const startsWith = (sig: number[]): Sniff => (b) => sig.every((v, i) => b[i] === v);
const textLike: Sniff = (b) => !b.subarray(0, 8192).includes(0);

/** Lista de permissão por extensão: o tipo MIME é definido por nós (nunca pelo navegador) e o conteúdo é conferido pela assinatura. */
export const ALLOWED_TYPES: Record<string, { mime: string; sniff: Sniff }> = {
  pdf: { mime: "application/pdf", sniff: startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]) },
  png: { mime: "image/png", sniff: startsWith([0x89, 0x50, 0x4e, 0x47]) },
  jpg: { mime: "image/jpeg", sniff: startsWith([0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", sniff: startsWith([0xff, 0xd8, 0xff]) },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sniff: startsWith([0x50, 0x4b, 0x03, 0x04]) },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sniff: startsWith([0x50, 0x4b, 0x03, 0x04]) },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", sniff: startsWith([0x50, 0x4b, 0x03, 0x04]) },
  odt: { mime: "application/vnd.oasis.opendocument.text", sniff: startsWith([0x50, 0x4b, 0x03, 0x04]) },
  doc: { mime: "application/msword", sniff: startsWith([0xd0, 0xcf, 0x11, 0xe0]) },
  xls: { mime: "application/vnd.ms-excel", sniff: startsWith([0xd0, 0xcf, 0x11, 0xe0]) },
  txt: { mime: "text/plain; charset=utf-8", sniff: textLike },
  csv: { mime: "text/csv; charset=utf-8", sniff: textLike },
};

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").replace(/\s+/g, " ").trim();
  return clean.slice(-150) || "arquivo";
}

export function classifyFile(fileName: string, buffer: Buffer): { name: string; mime: string } {
  const name = sanitizeFileName(fileName);
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const type = ALLOWED_TYPES[ext];
  if (!type) throw new ValidationError("Tipo de arquivo não permitido.", { file: [`Formatos aceitos: ${Object.keys(ALLOWED_TYPES).join(", ")}.`] });
  if (buffer.length === 0) throw new ValidationError("O arquivo está vazio.", { file: ["O arquivo está vazio."] });
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new ValidationError("Arquivo muito grande.", { file: ["O tamanho máximo é 8 MB."] });
  if (!type.sniff(buffer)) throw new ValidationError("O conteúdo do arquivo não corresponde à extensão.", { file: ["O conteúdo não corresponde ao formato informado."] });
  return { name, mime: type.mime };
}

type Owner = { caseId?: string | null; clientId?: string | null };

/** Valida que o ator pode ver o "dono" (processo ou cliente) e devolve a permissão de leitura correspondente já checada. */
async function assertOwnerReadable(ctx: TenantContext, owner: Owner) {
  if (!owner.caseId && !owner.clientId) throw new ValidationError("Informe o processo ou o cliente do documento.");
  if (owner.caseId) {
    assertCan(ctx, "cases:read");
    await assertCaseVisible(ctx, owner.caseId);
  }
  if (owner.clientId) {
    assertCan(ctx, "clients:read");
    const c = await db.client.findFirst({ where: { id: owner.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
    if (!c) throw new NotFoundError("Cliente não encontrado.");
  }
}

export { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL, type DocumentCategory } from "@/modules/documents/schemas";

type DocMeta = { category?: string | null; description?: string | null };
function cleanMeta(meta: DocMeta | undefined) {
  const category = meta?.category?.trim() || null;
  if (category && !(DOCUMENT_CATEGORIES as readonly string[]).includes(category)) throw new ValidationError("Categoria inválida.", { category: ["Categoria inválida."] });
  const description = meta?.description?.trim() || null;
  if (description && description.length > 1000) throw new ValidationError("Descrição muito longa.", { description: ["Máximo de 1000 caracteres."] });
  return { category, description };
}

const LIST_SELECT = { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true, updatedAt: true, uploadedById: true, category: true, currentVersion: true } as const;

export async function listDocuments(ctx: TenantContext, owner: Owner) {
  assertCan(ctx, "documents:read");
  await assertOwnerReadable(ctx, owner);
  return db.document.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      ...(owner.caseId ? { caseId: owner.caseId } : {}),
      ...(owner.clientId ? { clientId: owner.clientId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: LIST_SELECT,
  });
}

export type RepositoryFilters = { q?: string; category?: string; scope?: "case" | "client" };

/** Documentos que o usuário pode ver: de processos visíveis (sigilo) e de clientes (se puder ver clientes). Escopo opcional por origem. */
export function documentVisibilityWhere(ctx: TenantContext, scope?: "case" | "client"): Prisma.DocumentWhereInput | null {
  const owners: Prisma.DocumentWhereInput[] = [];
  if (can(ctx, "cases:read") && scope !== "client") owners.push({ caseId: { not: null }, case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } });
  if (can(ctx, "clients:read") && scope !== "case") owners.push({ clientId: { not: null }, client: { is: { deletedAt: null } } });
  if (owners.length === 0) return null;
  return { organizationId: ctx.organizationId, deletedAt: null, OR: owners };
}

/** Repositório geral: documentos de processos visíveis ao usuário (sigilo) e de clientes (se puder ver clientes). */
export async function listRepository(ctx: TenantContext, f: RepositoryFilters = {}) {
  assertCan(ctx, "documents:read");
  const base = documentVisibilityWhere(ctx, f.scope);
  if (!base) return { items: [], total: 0, truncated: false };
  const where: Prisma.DocumentWhereInput = {
    ...base,
    ...(f.category && (DOCUMENT_CATEGORIES as readonly string[]).includes(f.category) ? { category: f.category } : {}),
    ...(f.q?.trim() ? { name: { contains: f.q.trim().slice(0, 100), mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    db.document.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { ...LIST_SELECT, case: { select: { id: true, title: true, number: true } }, client: { select: { id: true, name: true } } },
    }),
    db.document.count({ where }),
  ]);
  return { items, total, truncated: total > items.length };
}

export async function uploadDocument(ctx: TenantContext, owner: Owner, file: { name: string; buffer: Buffer }, meta?: DocMeta) {
  assertCan(ctx, "documents:write");
  if (owner.caseId && owner.clientId) throw new ValidationError("Vincule o documento a um processo OU a um cliente.");
  await assertOwnerReadable(ctx, owner);
  const { name, mime } = classifyFile(file.name, file.buffer);
  const { category, description } = cleanMeta(meta);
  return storeNewDocument(ctx, owner, { name, mime, buffer: file.buffer }, { category, description, source: "UPLOAD", templateId: null });
}

/** Grava arquivo + documento + versão 1 de forma atômica (o arquivo é removido se o banco falhar). */
export async function storeNewDocument(
  ctx: TenantContext,
  owner: Owner,
  file: { name: string; mime: string; buffer: Buffer },
  opts: { category: string | null; description: string | null; source: "UPLOAD" | "TEMPLATE"; templateId: string | null; externalKey?: string | null },
) {
  await assertStorageAvailable(ctx.organizationId, file.buffer.length);
  const key = `${ctx.organizationId}/${randomUUID()}`;
  await putObject(key, file.buffer);
  const sha256 = createHash("sha256").update(file.buffer).digest("hex");
  try {
    return await db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          organizationId: ctx.organizationId,
          caseId: owner.caseId ?? null,
          clientId: owner.clientId ?? null,
          name: file.name,
          mimeType: file.mime,
          sizeBytes: file.buffer.length,
          sha256,
          storageKey: key,
          uploadedById: ctx.userId,
          category: opts.category,
          description: opts.description,
          templateId: opts.templateId,
          externalKey: opts.externalKey ?? null,
        },
      });
      await tx.documentVersion.create({
        data: {
          organizationId: ctx.organizationId,
          documentId: doc.id,
          version: 1,
          fileName: file.name,
          mimeType: file.mime,
          sizeBytes: file.buffer.length,
          sha256,
          storageKey: key,
          source: opts.source,
          uploadedById: ctx.userId,
        },
      });
      if (owner.caseId) {
        await logCaseEvent(tx, ctx, owner.caseId, {
          kind: "DOCUMENT_ADDED",
          title: opts.source === "TEMPLATE" ? `Documento gerado de modelo: ${file.name}` : `Documento anexado: ${file.name}`,
        });
      }
      await audit(
        { action: opts.source === "TEMPLATE" ? "document.generate" : "document.upload", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: doc.id, metadata: { size: doc.sizeBytes, mime: file.mime }, meta: ctx.meta },
        tx,
      );
      return doc;
    });
  } catch (err) {
    await deleteObject(key);
    throw err;
  }
}

export async function loadDocumentChecked(ctx: TenantContext, id: string) {
  const doc = await db.document.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null } });
  if (!doc) throw new NotFoundError("Documento não encontrado.");
  await assertOwnerReadable(ctx, { caseId: doc.caseId, clientId: doc.clientId });
  return doc;
}

/** Documento + histórico de versões (para a página de detalhe). */
export async function getDocument(ctx: TenantContext, id: string) {
  assertCan(ctx, "documents:read");
  const doc = await loadDocumentChecked(ctx, id);
  const [versions, owner, petitions] = await Promise.all([
    db.documentVersion.findMany({ where: { documentId: doc.id, organizationId: ctx.organizationId }, orderBy: { version: "desc" }, select: { id: true, version: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, source: true, note: true, uploadedById: true, createdAt: true } }),
    doc.caseId
      ? db.case.findFirst({ where: { id: doc.caseId, organizationId: ctx.organizationId }, select: { id: true, title: true, number: true } }).then((c) => ({ case: c, client: null }))
      : db.client.findFirst({ where: { id: doc.clientId!, organizationId: ctx.organizationId }, select: { id: true, name: true } }).then((c) => ({ case: null, client: c })),
    can(ctx, "petitions:read")
      ? db.petitionFiling.findMany({ where: { documentId: id, organizationId: ctx.organizationId, deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, documentVersion: true } })
      : Promise.resolve([]),
  ]);
  return { doc, versions, owner, petitions };
}

export async function updateDocumentMeta(ctx: TenantContext, id: string, raw: { name: string; category?: string | null; description?: string | null }) {
  assertCan(ctx, "documents:write");
  const doc = await loadDocumentChecked(ctx, id);
  const name = sanitizeFileName(raw.name);
  const { category, description } = cleanMeta(raw);
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id: doc.id }, data: { name, category, description } });
    await audit({ action: "document.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: id, meta: ctx.meta }, tx);
  });
}

/** Nova versão do mesmo documento. O arquivo anterior é preservado. Petições em revisão/aprovadas voltam a rascunho. */
export async function addDocumentVersion(ctx: TenantContext, id: string, file: { name: string; buffer: Buffer }, note?: string | null) {
  assertCan(ctx, "documents:write");
  const doc = await loadDocumentChecked(ctx, id);
  const { name, mime } = classifyFile(file.name, file.buffer);
  const cleanNote = note?.trim() || null;
  if (cleanNote && cleanNote.length > 500) throw new ValidationError("Observação muito longa.", { note: ["Máximo de 500 caracteres."] });
  await assertStorageAvailable(ctx.organizationId, file.buffer.length);
  const key = `${ctx.organizationId}/${randomUUID()}`;
  await putObject(key, file.buffer);
  const sha256 = createHash("sha256").update(file.buffer).digest("hex");
  try {
    return await db.$transaction(async (tx) => {
      const next = doc.currentVersion + 1;
      const res = await tx.document.updateMany({
        where: { id: doc.id, organizationId: ctx.organizationId, deletedAt: null, currentVersion: doc.currentVersion },
        data: { currentVersion: next, mimeType: mime, sizeBytes: file.buffer.length, sha256, storageKey: key },
      });
      if (res.count === 0) throw new ConflictError("Outra versão foi enviada ao mesmo tempo. Recarregue a página e tente de novo.");
      await tx.documentVersion.create({
        data: { organizationId: ctx.organizationId, documentId: doc.id, version: next, fileName: name, mimeType: mime, sizeBytes: file.buffer.length, sha256, storageKey: key, source: "UPLOAD", note: cleanNote, uploadedById: ctx.userId },
      });
      const reopened = await tx.petitionFiling.updateMany({
        where: { documentId: doc.id, organizationId: ctx.organizationId, status: { in: ["IN_REVIEW", "APPROVED"] }, deletedAt: null },
        data: { status: "DRAFT", scheduledFor: null, scheduledById: null, reviewerId: null, reviewedAt: null, reviewNote: `O documento recebeu a versão ${next}; a petição precisa de nova revisão.` },
      });
      if (doc.caseId) await logCaseEvent(tx, ctx, doc.caseId, { kind: "DOCUMENT_ADDED", title: `Nova versão (v${next}) de ${doc.name}` });
      await audit({ action: "document.version", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: doc.id, metadata: { version: next, petitionsReopened: reopened.count }, meta: ctx.meta }, tx);
      return { version: next };
    });
  } catch (err) {
    await deleteObject(key);
    throw err;
  }
}

/** Resolve o arquivo (versão corrente ou uma específica) para download aplicando escritório, sigilo e permissões. */
export async function getDocumentForDownload(ctx: TenantContext, id: string, version?: number) {
  assertCan(ctx, "documents:read");
  const doc = await loadDocumentChecked(ctx, id);
  const v = await db.documentVersion.findFirst({ where: { documentId: doc.id, organizationId: ctx.organizationId, version: version ?? doc.currentVersion } });
  if (!v) throw new NotFoundError("Versão não encontrada.");
  await audit({ action: "document.download", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: doc.id, metadata: { version: v.version }, meta: ctx.meta });
  return { id: doc.id, name: v.fileName, mimeType: v.mimeType, sizeBytes: v.sizeBytes, storageKey: v.storageKey, version: v.version };
}

/** Exclusão lógica: o registro some das listas; os arquivos são mantidos em armazenamento (retenção/auditoria). */
export async function deleteDocument(ctx: TenantContext, id: string) {
  assertCan(ctx, "documents:write");
  const doc = await loadDocumentChecked(ctx, id);
  const active = await db.petitionFiling.count({ where: { documentId: id, organizationId: ctx.organizationId, deletedAt: null, status: { in: ["IN_REVIEW", "APPROVED", "SUBMITTING", "SUBMITTED"] } } });
  const activeAsAttachment = await db.petitionAttachment.count({ where: { documentId: id, organizationId: ctx.organizationId, petition: { is: { deletedAt: null, status: { in: ["IN_REVIEW", "APPROVED", "SUBMITTING", "SUBMITTED"] } } } } });
  if (active + activeAsAttachment > 0) throw new ConflictError("O documento está vinculado a uma petição em andamento ou protocolada e não pode ser excluído.");
  await db.$transaction(async (tx) => {
    const res = await tx.document.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (res.count === 0) throw new ConflictError("O documento já foi removido.");
    if (doc.caseId) await logCaseEvent(tx, ctx, doc.caseId, { kind: "DOCUMENT_REMOVED", title: `Documento removido: ${doc.name}` });
    await audit({ action: "document.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: id, meta: ctx.meta }, tx);
  });
}
