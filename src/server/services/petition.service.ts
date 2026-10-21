import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { getPetitioningAdapter, registerPetitioningAdapter, SubmissionUncertainError } from "@/lib/petitioning/adapter";
import { onlyDigits } from "@/lib/validation/br-documents";
import { mniAdapter } from "./mni-petition.service";
import { getObjectStream } from "@/lib/storage/local-storage";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, caseVisibility, logCaseEvent } from "./case.service";
import { isUniqueViolation } from "./db-errors";
import { userNames } from "./members";
import { notify } from "./notification.service";
import { assertCredits, chargeCredits } from "./credit.service";
import { emitWebhookEvent } from "./webhook.service";

export const PETITION_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "SUBMITTING", "SUBMITTED", "FAILED", "CANCELED"] as const;
/** Webhook de falha de protocolo (best-effort: nunca derruba o fluxo). Sem dados sensíveis: só ids e o motivo curto. */
function emitFailed(ctx: TenantContext, p: { id: string; caseId: string }, adapterKey: string, isDemo: boolean, reason: string, uncertain = false) {
  return emitWebhookEvent(ctx.organizationId, "petition.failed", { petitionId: p.id, caseId: p.caseId, adapter: adapterKey, isDemo, uncertain, reason: reason.slice(0, 200) });
}
const STUCK_SUBMITTING_MS = 10 * 60_000;
export const ATTACHMENT_CLASSES = ["PROCURACAO", "DOCUMENTO_PESSOAL", "COMPROVANTE_RESIDENCIA", "PROVA_DOCUMENTAL", "CONTRATO", "DECISAO_ANEXA", "OUTROS"] as const;
export type AttachmentClass = (typeof ATTACHMENT_CLASSES)[number];
export const MAX_ATTACHMENTS = 20;

export type PetitionInput = { caseId: string; documentId: string; title: string; kind?: string | null; court?: string | null };

function cleanText(v: string | null | undefined, max: number, field: string) {
  const t = v?.trim() || null;
  if (t && t.length > max) throw new ValidationError("Texto muito longo.", { [field]: [`Máximo de ${max} caracteres.`] });
  return t;
}

async function loadPetition(ctx: TenantContext, id: string) {
  const p = await db.petitionFiling.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null, case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } },
    include: { case: { select: { id: true, title: true, number: true, court: true } }, document: { select: { id: true, name: true, currentVersion: true, deletedAt: true } } },
  });
  if (!p) throw new NotFoundError("Petição não encontrada.");
  return p;
}

export async function listPetitions(ctx: TenantContext, f: { status?: string; caseId?: string } = {}) {
  assertCan(ctx, "petitions:read");
  const where: Prisma.PetitionFilingWhereInput = {
    organizationId: ctx.organizationId,
    deletedAt: null,
    case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } },
    ...(f.status && (PETITION_STATUSES as readonly string[]).includes(f.status) ? { status: f.status as (typeof PETITION_STATUSES)[number] } : {}),
    ...(f.caseId ? { caseId: f.caseId } : {}),
  };
  const [items, total] = await Promise.all([
    db.petitionFiling.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, title: true, kind: true, status: true, isDemo: true, protocol: true, updatedAt: true, documentVersion: true, case: { select: { id: true, title: true, number: true } } },
    }),
    db.petitionFiling.count({ where }),
  ]);
  return { items, total, truncated: total > items.length };
}

export async function getPetition(ctx: TenantContext, id: string) {
  assertCan(ctx, "petitions:read");
  const p = await loadPetition(ctx, id);
  const names = await userNames(ctx, [p.authorId, p.reviewerId, p.submittedById]);
  const attachments = (await loadAttachments(ctx, p.id)).map((a) => ({ ...a, stale: a.document.deletedAt !== null || a.document.currentVersion !== a.documentVersion }));
  return { petition: p, names, stale: p.document.currentVersion !== p.documentVersion, attachments };
}

async function loadAttachments(ctx: TenantContext, petitionId: string) {
  return db.petitionAttachment.findMany({
    where: { petitionId, organizationId: ctx.organizationId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { document: { select: { id: true, name: true, currentVersion: true, deletedAt: true, sizeBytes: true } } },
  });
}

function assertAttachmentsUsable(atts: Awaited<ReturnType<typeof loadAttachments>>, when: "review" | "approve") {
  const gone = atts.find((a) => a.document.deletedAt);
  if (gone) throw new ConflictError(`O anexo "${gone.document.name}" foi removido dos documentos. Remova-o da petição.`);
  if (when === "approve") {
    const stale = atts.find((a) => a.document.currentVersion !== a.documentVersion);
    if (stale) throw new ConflictError(`O anexo "${stale.document.name}" mudou depois do envio para revisão. Devolva a petição ao rascunho e reenvie.`);
  }
}

function checkClass(v: string): AttachmentClass {
  if (!(ATTACHMENT_CLASSES as readonly string[]).includes(v)) throw new ValidationError("Classificação inválida.", { classification: ["Escolha uma classificação da lista."] });
  return v as AttachmentClass;
}

/** Só em rascunho. O documento precisa ser do mesmo processo, diferente do documento principal, e não pode se repetir. */
export async function addAttachment(ctx: TenantContext, petitionId: string, input: { documentId: string; classification: string }) {
  assertCan(ctx, "petitions:write");
  assertCan(ctx, "documents:read");
  const classification = checkClass(input.classification);
  const p = await loadPetition(ctx, petitionId);
  if (p.status !== "DRAFT") throw new ConflictError("Só é possível alterar os anexos de petições em rascunho.");
  if (input.documentId === p.documentId) throw new ValidationError("Esse é o documento principal.", { documentId: ["O documento principal já faz parte da petição."] });
  const doc = await db.document.findFirst({ where: { id: input.documentId, organizationId: ctx.organizationId, deletedAt: null, caseId: p.caseId }, select: { id: true, currentVersion: true } });
  if (!doc) throw new ValidationError("Documento inválido.", { documentId: ["Escolha um documento anexado a este processo."] });
  const current = await db.petitionAttachment.findMany({ where: { petitionId, organizationId: ctx.organizationId }, select: { position: true } });
  if (current.length >= MAX_ATTACHMENTS) throw new ValidationError("Limite de anexos atingido.", { documentId: [`Máximo de ${MAX_ATTACHMENTS} anexos por petição.`] });
  try {
    await db.petitionAttachment.create({
      data: { organizationId: ctx.organizationId, petitionId, documentId: doc.id, documentVersion: doc.currentVersion, classification, position: current.reduce((m, a) => Math.max(m, a.position), 0) + 1, createdById: ctx.userId },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("Este documento já está anexado à petição.");
    throw e;
  }
  await audit({ action: "petition.attachment_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petitionId, metadata: { classification }, meta: ctx.meta });
}

export async function removeAttachment(ctx: TenantContext, petitionId: string, attachmentId: string) {
  assertCan(ctx, "petitions:write");
  const p = await loadPetition(ctx, petitionId);
  if (p.status !== "DRAFT") throw new ConflictError("Só é possível alterar os anexos de petições em rascunho.");
  const r = await db.petitionAttachment.deleteMany({ where: { id: attachmentId, petitionId, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Anexo não encontrado.");
  await audit({ action: "petition.attachment_remove", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petitionId, meta: ctx.meta });
}

export async function setAttachmentClassification(ctx: TenantContext, petitionId: string, attachmentId: string, classification: string) {
  assertCan(ctx, "petitions:write");
  const cls = checkClass(classification);
  const p = await loadPetition(ctx, petitionId);
  if (p.status !== "DRAFT") throw new ConflictError("Só é possível alterar os anexos de petições em rascunho.");
  const r = await db.petitionAttachment.updateMany({ where: { id: attachmentId, petitionId, organizationId: ctx.organizationId }, data: { classification: cls } });
  if (r.count !== 1) throw new NotFoundError("Anexo não encontrado.");
  await audit({ action: "petition.attachment_classify", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petitionId, metadata: { classification: cls }, meta: ctx.meta });
}

/** Troca a posição do anexo com o vizinho (a ordem dos anexos vale no envio). */
export async function moveAttachment(ctx: TenantContext, petitionId: string, attachmentId: string, direction: "up" | "down") {
  assertCan(ctx, "petitions:write");
  const p = await loadPetition(ctx, petitionId);
  if (p.status !== "DRAFT") throw new ConflictError("Só é possível alterar os anexos de petições em rascunho.");
  await db.$transaction(async (tx) => {
    const list = await tx.petitionAttachment.findMany({ where: { petitionId, organizationId: ctx.organizationId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const i = list.findIndex((a) => a.id === attachmentId);
    if (i < 0) throw new NotFoundError("Anexo não encontrado.");
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    const order = list.map((a) => a.id);
    [order[i], order[j]] = [order[j]!, order[i]!];
    for (let k = 0; k < order.length; k++) await tx.petitionAttachment.update({ where: { id: order[k]! }, data: { position: k + 1 } });
  });
}

export async function createPetition(ctx: TenantContext, raw: PetitionInput) {
  assertCan(ctx, "petitions:write");
  assertCan(ctx, "documents:read");
  const title = raw.title.trim();
  if (title.length < 3 || title.length > 200) throw new ValidationError("Título inválido.", { title: ["Informe um título de 3 a 200 caracteres."] });
  const kind = cleanText(raw.kind, 80, "kind");
  const c = await assertCaseVisible(ctx, raw.caseId);
  const doc = await db.document.findFirst({ where: { id: raw.documentId, organizationId: ctx.organizationId, deletedAt: null, caseId: raw.caseId }, select: { id: true, currentVersion: true } });
  if (!doc) throw new ValidationError("Documento inválido.", { documentId: ["Escolha um documento anexado a este processo."] });
  const caseRow = await db.case.findFirst({ where: { id: c.id, organizationId: ctx.organizationId }, select: { court: true } });
  const court = cleanText(raw.court, 200, "court") ?? caseRow?.court ?? null;
  return db.$transaction(async (tx) => {
    const p = await tx.petitionFiling.create({
      data: { organizationId: ctx.organizationId, caseId: c.id, documentId: doc.id, documentVersion: doc.currentVersion, title, kind, court, authorId: ctx.userId },
    });
    await logCaseEvent(tx, ctx, c.id, { kind: "PETITION_CREATED", title: `Petição preparada: ${title}` });
    await audit({ action: "petition.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: p.id, meta: ctx.meta }, tx);
    return p;
  });
}

/** Só em rascunho. Troca o documento (do mesmo processo) e/ou os dados descritivos. */
export async function updatePetition(ctx: TenantContext, id: string, raw: PetitionInput) {
  assertCan(ctx, "petitions:write");
  const p = await loadPetition(ctx, id);
  if (p.status !== "DRAFT") throw new ConflictError("Só é possível editar petições em rascunho.");
  const title = raw.title.trim();
  if (title.length < 3 || title.length > 200) throw new ValidationError("Título inválido.", { title: ["Informe um título de 3 a 200 caracteres."] });
  const doc = await db.document.findFirst({ where: { id: raw.documentId, organizationId: ctx.organizationId, deletedAt: null, caseId: p.caseId }, select: { id: true, currentVersion: true } });
  if (!doc) throw new ValidationError("Documento inválido.", { documentId: ["Escolha um documento anexado a este processo."] });
  const res = await db.petitionFiling.updateMany({
    where: { id, organizationId: ctx.organizationId, status: "DRAFT" },
    data: { title, kind: cleanText(raw.kind, 80, "kind"), court: cleanText(raw.court, 200, "court"), documentId: doc.id, documentVersion: doc.currentVersion },
  });
  if (res.count === 0) throw new ConflictError("A petição mudou de situação. Recarregue a página.");
  await audit({ action: "petition.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, meta: ctx.meta });
}

async function transition(
  ctx: TenantContext,
  p: Awaited<ReturnType<typeof loadPetition>>,
  from: (typeof PETITION_STATUSES)[number][],
  data: Prisma.PetitionFilingUncheckedUpdateManyInput,
  event: { kind: string; title: string; description?: string | null },
  action: string,
  extra?: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  await db.$transaction(async (tx) => {
    const res = await tx.petitionFiling.updateMany({ where: { id: p.id, organizationId: ctx.organizationId, status: { in: from }, deletedAt: null }, data });
    if (res.count === 0) throw new ConflictError("A petição mudou de situação. Recarregue a página.");
    if (extra) await extra(tx);
    await logCaseEvent(tx, ctx, p.caseId, event);
    await audit({ action, organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: p.id, meta: ctx.meta }, tx);
  });
}

function assertDocumentUsable(p: Awaited<ReturnType<typeof loadPetition>>) {
  if (p.document.deletedAt) throw new ConflictError("O documento da petição foi removido.");
}

export async function requestReview(ctx: TenantContext, id: string) {
  assertCan(ctx, "petitions:write");
  const p = await loadPetition(ctx, id);
  assertDocumentUsable(p);
  const atts = await loadAttachments(ctx, p.id);
  assertAttachmentsUsable(atts, "review");
  // trava a versão que será revisada (documento principal e anexos)
  await transition(
    ctx,
    p,
    ["DRAFT"],
    { status: "IN_REVIEW", scheduledFor: null, scheduledById: null, documentVersion: p.document.currentVersion, reviewNote: null, reviewerId: null, reviewedAt: null, error: null },
    { kind: "PETITION_REVIEW", title: `Petição enviada para revisão: ${p.title}` },
    "petition.request_review",
    async (tx) => {
      for (const a of atts) await tx.petitionAttachment.update({ where: { id: a.id }, data: { documentVersion: a.document.currentVersion } });
    },
  );
  const approvers = await db.membership.findMany({
    where: { organizationId: ctx.organizationId, status: "ACTIVE", userId: { not: ctx.userId }, role: { permissions: { has: "petitions:approve" } } },
    select: { userId: true },
  });
  await notify(approvers.map((m) => ({ organizationId: ctx.organizationId, userId: m.userId, kind: "petition.review", title: "Petição aguardando revisão", body: p.title, link: `/peticoes/${p.id}`, dedupeKey: `petition.review:${p.id}:${Date.now()}` })));
}

export async function approvePetition(ctx: TenantContext, id: string) {
  assertCan(ctx, "petitions:approve");
  const p = await loadPetition(ctx, id);
  assertDocumentUsable(p);
  if (p.document.currentVersion !== p.documentVersion) throw new ConflictError("O documento mudou depois do envio para revisão. Devolva a petição ao rascunho e reenvie.");
  assertAttachmentsUsable(await loadAttachments(ctx, p.id), "approve");
  await transition(ctx, p, ["IN_REVIEW"], { status: "APPROVED", scheduledFor: null, scheduledById: null, scheduleNote: null, reviewerId: ctx.userId, reviewedAt: new Date(), reviewNote: null }, { kind: "PETITION_APPROVED", title: `Petição aprovada: ${p.title}` }, "petition.approve");
}

export async function returnPetition(ctx: TenantContext, id: string, note: string) {
  assertCan(ctx, "petitions:approve");
  const n = note.trim();
  if (n.length < 3) throw new ValidationError("Informe o motivo.", { note: ["Explique o que precisa ser ajustado."] });
  if (n.length > 1000) throw new ValidationError("Texto muito longo.", { note: ["Máximo de 1000 caracteres."] });
  const p = await loadPetition(ctx, id);
  await transition(ctx, p, ["IN_REVIEW", "APPROVED"], { status: "DRAFT", scheduledFor: null, scheduledById: null, scheduleNote: null, reviewerId: ctx.userId, reviewedAt: new Date(), reviewNote: n }, { kind: "PETITION_RETURNED", title: `Petição devolvida para ajustes: ${p.title}`, description: n }, "petition.return");
  if (p.authorId && p.authorId !== ctx.userId) await notify({ organizationId: ctx.organizationId, userId: p.authorId, kind: "petition.returned", title: "Petição devolvida para ajustes", body: p.title, link: `/peticoes/${p.id}`, dedupeKey: `petition.returned:${p.id}:${Date.now()}` });
}

export async function cancelPetition(ctx: TenantContext, id: string) {
  assertCan(ctx, "petitions:write");
  const p = await loadPetition(ctx, id);
  await transition(ctx, p, ["DRAFT", "IN_REVIEW", "APPROVED", "FAILED"], { status: "CANCELED", scheduledFor: null, scheduledById: null }, { kind: "PETITION_CANCELED", title: `Petição cancelada: ${p.title}` }, "petition.cancel");
}

/**
 * Envio pelo adaptador configurado. A reserva APPROVED/FAILED → SUBMITTING é atômica (evita envio duplo por duplo clique);
 * um envio "preso" há mais de 10 min (queda do processo) pode ser retomado. Sempre envia a versão APROVADA, nunca a mais recente.
 */
registerPetitioningAdapter(mniAdapter);

async function readStored(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const reader = (await getObjectStream(key)).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** `confirmCase`: obrigatório em adaptador REAL — o usuário digita o número do processo para confirmar o protocolo (ato irreversível). */
export async function submitPetition(ctx: TenantContext, id: string, opts: { confirmCase?: string; post?: unknown } = {}) {
  assertCan(ctx, "petitions:approve");
  const p = await loadPetition(ctx, id);
  assertDocumentUsable(p);
  if (p.document.currentVersion !== p.documentVersion) throw new ConflictError("O documento mudou depois da aprovação. Devolva a petição ao rascunho e reenvie para revisão.");
  const version = await db.documentVersion.findFirst({ where: { documentId: p.documentId, organizationId: ctx.organizationId, version: p.documentVersion } });
  if (!version) throw new NotFoundError("Versão do documento não encontrada.");
  const atts = await loadAttachments(ctx, p.id);
  assertAttachmentsUsable(atts, "approve");
  const attVersions = atts.length
    ? await db.documentVersion.findMany({ where: { organizationId: ctx.organizationId, OR: atts.map((a) => ({ documentId: a.documentId, version: a.documentVersion })) } })
    : [];
  const attachmentsForAdapter = atts.map((a) => {
    const v = attVersions.find((x) => x.documentId === a.documentId && x.version === a.documentVersion);
    if (!v) throw new NotFoundError(`Versão do anexo "${a.document.name}" não encontrada.`);
    return { fileName: v.fileName, mimeType: v.mimeType, sizeBytes: v.sizeBytes, sha256: v.sha256, classification: a.classification };
  });
  const adapter = getPetitioningAdapter();
  const submission = {
    petitionId: p.id,
    caseNumber: p.case.number,
    court: p.court,
    title: p.title,
    document: { fileName: version.fileName, mimeType: version.mimeType, sizeBytes: version.sizeBytes, sha256: version.sha256 },
    attachments: attachmentsForAdapter,
  };
  if (!adapter.isDemo) {
    const want = onlyDigits(p.case.number ?? "");
    if (!want || onlyDigits(opts.confirmCase ?? "") !== want) throw new ValidationError("Para protocolar no tribunal, digite o número do processo para confirmar.", { confirmCase: ["Número do processo não confere."] });
  }
  if (!adapter.isDemo) await assertCredits(ctx.organizationId, "petition.submit");
  await adapter.preflight?.(submission, { ctx, caseId: p.caseId, post: opts.post });

  const claim = await db.petitionFiling.updateMany({
    where: {
      id,
      organizationId: ctx.organizationId,
      deletedAt: null,
      OR: [{ status: { in: ["APPROVED", "FAILED"] } }, { status: "SUBMITTING", updatedAt: { lt: new Date(Date.now() - STUCK_SUBMITTING_MS) } }],
    },
    data: { status: "SUBMITTING", adapter: adapter.key, isDemo: adapter.isDemo, submittedById: ctx.userId, error: null },
  });
  if (claim.count === 0) throw new ConflictError("A petição não está aprovada para envio (ou já está sendo enviada).");

  let receipt: { protocol: string; receipt: string };
  try {
    const files = adapter.isDemo
      ? { main: Buffer.alloc(0), attachments: [] as Buffer[] }
      : { main: await readStored(version.storageKey), attachments: await Promise.all(atts.map((a) => readStored(attVersions.find((x) => x.documentId === a.documentId && x.version === a.documentVersion)!.storageKey))) };
    receipt = await adapter.submit(submission, { ctx, caseId: p.caseId, files, post: opts.post });
  } catch (err) {
    if (err instanceof SubmissionUncertainError) {
      logger.error("petition.submit_uncertain", { petitionId: id, adapter: adapter.key, error: err.message });
      await db.petitionFiling.updateMany({ where: { id, organizationId: ctx.organizationId, status: "SUBMITTING" }, data: { status: "FAILED", error: `ATENÇÃO: não recebemos confirmação do tribunal e a petição PODE ter sido protocolada. Confira no sistema do tribunal ANTES de reenviar. (${err.message.slice(0, 200)})` } });
      await audit({ action: "petition.submit", result: "FAILURE", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, metadata: { adapter: adapter.key, uncertain: true }, meta: ctx.meta });
      await emitFailed(ctx, p, adapter.key, adapter.isDemo, "Sem confirmação do tribunal; pode ter sido protocolada.", true);
      throw new ConflictError("Sem confirmação do tribunal: a petição PODE ter sido protocolada. Confira no sistema do tribunal antes de tentar de novo.");
    }
    if (err instanceof ConflictError || err instanceof ValidationError) {
      await db.petitionFiling.updateMany({ where: { id, organizationId: ctx.organizationId, status: "SUBMITTING" }, data: { status: "FAILED", error: err.message.slice(0, 300) } });
      await audit({ action: "petition.submit", result: "FAILURE", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, metadata: { adapter: adapter.key }, meta: ctx.meta });
      await emitFailed(ctx, p, adapter.key, adapter.isDemo, err.message);
      throw err;
    }
    logger.error("petition.submit_failed", { petitionId: id, adapter: adapter.key, error: err instanceof Error ? err.message : String(err) });
    await db.petitionFiling.updateMany({ where: { id, organizationId: ctx.organizationId, status: "SUBMITTING" }, data: { status: "FAILED", error: "O adaptador de peticionamento recusou ou não concluiu o envio. Tente novamente." } });
    await audit({ action: "petition.submit", result: "FAILURE", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, metadata: { adapter: adapter.key }, meta: ctx.meta });
    await emitFailed(ctx, p, adapter.key, adapter.isDemo, "O adaptador não concluiu o envio.");
    throw new ConflictError("O envio não foi concluído. A petição voltou para \"Falha no envio\" e pode ser reenviada.");
  }

  await db.$transaction(async (tx) => {
    const res = await tx.petitionFiling.updateMany({
      where: { id, organizationId: ctx.organizationId, status: "SUBMITTING" },
      data: { status: "SUBMITTED", protocol: receipt.protocol, receipt: receipt.receipt, submittedAt: new Date() },
    });
    if (res.count === 0) throw new ConflictError("A petição mudou de situação durante o envio.");
    await logCaseEvent(tx, ctx, p.caseId, {
      kind: "PETITION_SUBMITTED",
      title: adapter.isDemo ? `Petição enviada em DEMONSTRAÇÃO (sem protocolo real): ${p.title}` : `Petição protocolada: ${p.title}`,
      description: `Protocolo ${receipt.protocol}`,
    });
    await audit({ action: "petition.submit", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, metadata: { adapter: adapter.key, demo: adapter.isDemo, version: p.documentVersion, attachments: attachmentsForAdapter.length }, meta: ctx.meta }, tx);
  });
  if (!adapter.isDemo) await chargeCredits(ctx.organizationId, "petition.submit", { type: "petition", id, userId: ctx.userId });
  await emitWebhookEvent(ctx.organizationId, "petition.submitted", { petitionId: p.id, caseId: p.caseId, protocol: receipt.protocol, isDemo: adapter.isDemo, adapter: adapter.key });
  return { protocol: receipt.protocol, isDemo: adapter.isDemo };
}
