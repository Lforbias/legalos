import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { PETITION_STATUS_KEYS, canSubmitAgain, isDefiniteFailure, isLegacyUncertain, statusAfterDelivery, type AttemptOutcome, type FilingEnvironment } from "@/lib/judicial/petition-state";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { getPetitioningAdapter, registerPetitioningAdapter, SubmissionUncertainError, type FilingTarget } from "@/lib/petitioning/adapter";
import { onlyDigits } from "@/lib/validation/br-documents";
import { mniAdapter } from "./mni-petition.service";
import { getConnector } from "@/lib/judicial/catalog";
import { recordEvidence } from "@/server/judicial/evidence.service";
import { assertFilingAllowed } from "@/server/judicial/filing-gate";
import { getObjectStream } from "@/lib/storage/local-storage";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, caseVisibility, logCaseEvent } from "./case.service";
import { isUniqueViolation } from "./db-errors";
import { userNames } from "./members";
import { notify } from "./notification.service";
import { assertCredits, chargeCredits } from "./credit.service";
import { emitWebhookEvent } from "./webhook.service";

export const PETITION_STATUSES = PETITION_STATUS_KEYS as readonly (typeof PETITION_STATUS_KEYS)[number][];
/** Webhook de falha de protocolo (best-effort: nunca derruba o fluxo). Sem dados sensíveis: só ids e o motivo curto. */
function emitFailed(ctx: TenantContext, p: { id: string; caseId: string }, adapterKey: string, isDemo: boolean, reason: string, uncertain = false) {
  return emitWebhookEvent(ctx.organizationId, "petition.failed", { petitionId: p.id, caseId: p.caseId, adapter: adapterKey, isDemo, uncertain, reason: reason.slice(0, 200) });
}
export const STUCK_SUBMITTING_MS = 10 * 60_000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
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
      select: { id: true, title: true, kind: true, status: true, isDemo: true, filingEnvironment: true, protocol: true, updatedAt: true, documentVersion: true, case: { select: { id: true, title: true, number: true } } },
    }),
    db.petitionFiling.count({ where }),
  ]);
  return { items, total, truncated: total > items.length };
}

export async function getPetition(ctx: TenantContext, id: string) {
  assertCan(ctx, "petitions:read");
  const p = await loadPetition(ctx, id);
  const attachments = (await loadAttachments(ctx, p.id)).map((a) => ({ ...a, stale: a.document.deletedAt !== null || a.document.currentVersion !== a.documentVersion }));
  const [attempts, officialReceipt] = await Promise.all([
    db.petitionAttempt.findMany({ where: { petitionId: p.id, organizationId: ctx.organizationId }, orderBy: { attemptNo: "desc" }, take: 20 }),
    db.petitionReceipt.findFirst({ where: { petitionId: p.id, organizationId: ctx.organizationId } }),
  ]);
  const names = await userNames(ctx, [p.authorId, p.reviewerId, p.submittedById, officialReceipt?.recordedById ?? null]);
  return { petition: p, names, stale: p.document.currentVersion !== p.documentVersion, attachments, attempts, officialReceipt };
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
  if (p.status === "FAILED" && isLegacyUncertain(p.error)) throw new ConflictError("Não há certeza de que o tribunal não recebeu esta petição. Confira no tribunal e registre o resultado antes de cancelar.");
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

const UNCERTAIN_TEXT = (detail: string) => `ATENÇÃO: não recebemos confirmação do tribunal e a petição PODE ter sido protocolada. Confira no sistema do tribunal ANTES de registrar o resultado. Não reenviamos às cegas. (${detail.slice(0, 200)})`;

async function lastAttemptOutcome(petitionId: string): Promise<AttemptOutcome | null> {
  const a = await db.petitionAttempt.findFirst({ where: { petitionId }, orderBy: { attemptNo: "desc" }, select: { outcome: true } });
  return (a?.outcome as AttemptOutcome | undefined) ?? null;
}

/** Um envio que ficou "Enviando" por tempo demais (queda do processo) NÃO é reenviado: vira "estado desconhecido" para uma pessoa conferir. */
async function markInterrupted(organizationId: string, petitionId: string, userId: string | null, caseId: string, title: string, now = new Date()): Promise<boolean> {
  const moved = await db.$transaction(async (tx) => {
    const res = await tx.petitionFiling.updateMany({ where: { id: petitionId, organizationId, status: "SUBMITTING", updatedAt: { lt: new Date(now.getTime() - STUCK_SUBMITTING_MS) } }, data: { status: "UNKNOWN", unknownSince: now, error: UNCERTAIN_TEXT("o envio foi interrompido sem resposta") } });
    if (res.count === 0) return false;
    await tx.petitionAttempt.updateMany({ where: { petitionId, outcome: "STARTED" }, data: { outcome: "UNCERTAIN", errorCode: "INTERRUPTED", errorMessage: "O envio ficou sem resposta (processo interrompido).", finishedAt: now } });
    await tx.caseEvent.create({ data: { organizationId, caseId, source: "AUTOMATIC", kind: "PETITION_UNKNOWN", title: `Petição em estado desconhecido: ${title}`, description: "O envio ficou sem resposta. Confira no tribunal antes de qualquer reenvio." } });
    await audit({ action: "petition.interrupted", result: "FAILURE", organizationId, userId, resourceType: "petition", resourceId: petitionId, metadata: { uncertain: true }, meta: undefined }, tx);
    return true;
  });
  if (moved && userId) await notify({ organizationId, userId, kind: "petition.unknown", title: "Petição em estado desconhecido: confira no tribunal", body: title.slice(0, 200), link: `/peticoes/${petitionId}`, dedupeKey: `petition.unknown:${petitionId}` }).catch(() => undefined);
  return moved;
}

/** Rotina do agendador: envios "presos" viram estado desconhecido (nunca reenvio automático). */
export async function recoverStuckSubmissions(now = new Date()): Promise<number> {
  const stuck = await db.petitionFiling.findMany({ where: { status: "SUBMITTING", deletedAt: null, updatedAt: { lt: new Date(now.getTime() - STUCK_SUBMITTING_MS) } }, take: 50, select: { id: true, organizationId: true, caseId: true, title: true, submittedById: true } });
  let n = 0;
  for (const p of stuck) if (await markInterrupted(p.organizationId, p.id, p.submittedById, p.caseId, p.title, now)) n++;
  return n;
}

/** Evidência de funcionamento do protocolo (não bloqueia o fluxo). Teste simulado não prova nada; só homologação ou produção contam. */
async function recordFilingEvidence(ctx: TenantContext, target: FilingTarget, outcome: "PASSED" | "FAILED" | "INCONCLUSIVE", reasonCode: string | null, petitionId: string) {
  try {
    await recordEvidence({
      organizationId: ctx.organizationId, connectorKey: target.connectorKey, courtCode: target.courtCode, operation: "submitFiling", accessMethod: getConnector(target.connectorKey)?.accessMethod ?? "MNI",
      environment: target.environment, outcome, reasonCode, summary: outcome === "PASSED" ? "O tribunal aceitou o protocolo." : outcome === "FAILED" ? "O tribunal recusou o protocolo." : "Sem prova oficial do protocolo.", details: { petitionId }, checkedById: ctx.userId,
    });
  } catch { /* evidência é best-effort */ }
}

/**
 * `confirmCase`: obrigatório em adaptador REAL — o usuário digita o número do processo para confirmar o protocolo (ato irreversível).
 *
 * Estados (veja lib/judicial/petition-state.ts): o resultado só é "Protocolada com confirmação oficial" com recibo de tribunal REAL;
 * demonstração, simulação e homologação ficam como "Enviada" (teste). Sem resposta do tribunal = "Estado desconhecido", que nunca é reenviado às cegas.
 * Protocolo real em conector sem homologação neste tribunal é recusado ANTES de reservar o envio.
 */
export async function submitPetition(ctx: TenantContext, id: string, opts: { confirmCase?: string; post?: unknown } = {}) {
  assertCan(ctx, "petitions:approve");
  let p = await loadPetition(ctx, id);
  if (p.status === "SUBMITTING" && p.updatedAt.getTime() < Date.now() - STUCK_SUBMITTING_MS) {
    if (await markInterrupted(ctx.organizationId, p.id, ctx.userId, p.caseId, p.title)) p = await loadPetition(ctx, id);
  }
  const again = canSubmitAgain({ status: p.status, lastAttempt: await lastAttemptOutcome(p.id), error: p.error });
  if (!again.ok) throw new ConflictError(again.reason);
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

  // Destino e homologação, ANTES de reservar: adaptador real que não informa o destino, ou conector sem homologação neste tribunal, não protocola.
  let target: FilingTarget | null = null;
  if (!adapter.isDemo) {
    if (!adapter.describeTarget) throw new ConflictError("Este conector não informa o tribunal e o ambiente do protocolo; por segurança o protocolo real está bloqueado.");
    target = await adapter.describeTarget(submission, { ctx, caseId: p.caseId, post: opts.post });
    await assertFilingAllowed(ctx.organizationId, target);
  }
  const environment: FilingEnvironment = adapter.isDemo ? "DEMO" : target!.environment;
  const manifestSha = sha256(JSON.stringify({ main: version.sha256, attachments: attachmentsForAdapter.map((a) => [a.sha256, a.classification]) }));

  // Reserva atômica + registro da tentativa. Só `APPROVED` ou `FAILED` (que não seja dúvida de legado) saem para envio; um índice único
  // impede duas tentativas abertas da mesma petição.
  const attempt = await db.$transaction(async (tx) => {
    const claim = await tx.petitionFiling.updateMany({
      where: {
        id,
        organizationId: ctx.organizationId,
        deletedAt: null,
        OR: [{ status: "APPROVED" }, { status: "FAILED", OR: [{ error: null }, { NOT: { error: { startsWith: "ATENÇÃO: não recebemos confirmação" } } }] }],
      },
      data: { status: "SUBMITTING", adapter: adapter.key, isDemo: adapter.isDemo, filingEnvironment: environment, submittedById: ctx.userId, error: null, attemptCount: { increment: 1 } },
    });
    if (claim.count === 0) throw new ConflictError("A petição não está aprovada para envio (ou já está sendo enviada).");
    const n = (await tx.petitionFiling.findUniqueOrThrow({ where: { id }, select: { attemptCount: true } })).attemptCount;
    return tx.petitionAttempt.create({ data: { organizationId: ctx.organizationId, petitionId: id, attemptNo: n, adapter: adapter.key, environment, manifestSha256: manifestSha, idempotencyKey: sha256(`${id}:${manifestSha}`), startedById: ctx.userId } });
  }).catch((e) => {
    if (isUniqueViolation(e)) throw new ConflictError("A petição já está sendo enviada.");
    throw e;
  });

  const finishAttempt = (outcome: AttemptOutcome, errorCode: string | null, errorMessage: string | null) =>
    db.petitionAttempt.updateMany({ where: { id: attempt.id, outcome: "STARTED" }, data: { outcome, errorCode, errorMessage: errorMessage?.slice(0, 300) ?? null, finishedAt: new Date() } });

  let receipt: Awaited<ReturnType<typeof adapter.submit>>;
  try {
    const files = adapter.isDemo
      ? { main: Buffer.alloc(0), attachments: [] as Buffer[] }
      : { main: await readStored(version.storageKey), attachments: await Promise.all(atts.map((a) => readStored(attVersions.find((x) => x.documentId === a.documentId && x.version === a.documentVersion)!.storageKey))) };
    receipt = await adapter.submit(submission, { ctx, caseId: p.caseId, files, post: opts.post });
  } catch (err) {
    const uncertain = err instanceof SubmissionUncertainError || !isDefiniteFailure(err, adapter.isDemo);
    const detail = err instanceof Error ? err.message : String(err);
    if (uncertain) {
      logger.error("petition.submit_uncertain", { petitionId: id, adapter: adapter.key, error: detail });
      await db.$transaction(async (tx) => {
        await tx.petitionFiling.updateMany({ where: { id, organizationId: ctx.organizationId, status: "SUBMITTING" }, data: { status: "UNKNOWN", unknownSince: new Date(), error: UNCERTAIN_TEXT(err instanceof SubmissionUncertainError ? detail : "falha inesperada no envio") } });
        await tx.petitionAttempt.updateMany({ where: { id: attempt.id, outcome: "STARTED" }, data: { outcome: "UNCERTAIN", errorCode: "NO_CONFIRMATION", errorMessage: (err instanceof SubmissionUncertainError ? detail : "Falha inesperada no envio.").slice(0, 300), finishedAt: new Date() } });
      });
      await audit({ action: "petition.submit", result: "FAILURE", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, metadata: { adapter: adapter.key, uncertain: true, attempt: attempt.attemptNo }, meta: ctx.meta });
      await emitFailed(ctx, p, adapter.key, adapter.isDemo, "Sem confirmação do tribunal; pode ter sido protocolada.", true);
      throw new ConflictError("Sem confirmação do tribunal: a petição PODE ter sido protocolada. Confira no tribunal e registre o resultado; não reenviamos às cegas.");
    }
    const refusal = err instanceof ConflictError || err instanceof ValidationError;
    await db.petitionFiling.updateMany({ where: { id, organizationId: ctx.organizationId, status: "SUBMITTING" }, data: { status: "FAILED", error: refusal ? (err as Error).message.slice(0, 300) : "O adaptador de peticionamento recusou ou não concluiu o envio. Tente novamente." } });
    await finishAttempt("REJECTED", refusal ? "REFUSED" : "ADAPTER_ERROR", refusal ? (err as Error).message : "Falha do adaptador.");
    if (target) await recordFilingEvidence(ctx, target, "FAILED", "REFUSED", id);
    await audit({ action: "petition.submit", result: "FAILURE", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, metadata: { adapter: adapter.key, attempt: attempt.attemptNo }, meta: ctx.meta });
    await emitFailed(ctx, p, adapter.key, adapter.isDemo, refusal ? (err as Error).message : "O adaptador não concluiu o envio.");
    if (refusal) throw err;
    logger.error("petition.submit_failed", { petitionId: id, adapter: adapter.key, error: detail });
    throw new ConflictError("O envio não foi concluído. A petição voltou para \"Falha no envio\" e pode ser reenviada.");
  }

  // O tribunal respondeu. O ambiente de MENOR confiança prevalece: destino de teste nunca vira protocolo oficial por conta do que o adaptador diz.
  const finalEnv: FilingEnvironment = adapter.isDemo ? "DEMO" : target!.environment !== "PRODUCTION" ? target!.environment : (receipt.environment ?? "PRODUCTION");
  const finalStatus = adapter.isDemo ? "SUBMITTED" : statusAfterDelivery({ environment: finalEnv, protocol: receipt.protocol, officialReceipt: receipt.officialReceipt === true });
  const now = new Date();
  await db.$transaction(async (tx) => {
    const res = await tx.petitionFiling.updateMany({
      where: { id, organizationId: ctx.organizationId, status: "SUBMITTING" },
      data: { status: finalStatus, filingEnvironment: finalEnv, protocol: receipt.protocol, receipt: receipt.receipt, submittedAt: now, confirmedAt: finalStatus === "FILED_CONFIRMED" ? now : null, ...(finalStatus === "AWAITING_CONFIRMATION" ? { unknownSince: now } : {}) },
    });
    if (res.count === 0) throw new ConflictError("A petição mudou de situação durante o envio.");
    await tx.petitionAttempt.update({ where: { id: attempt.id }, data: finalStatus === "AWAITING_CONFIRMATION" ? { outcome: "UNCERTAIN", errorCode: "NO_OFFICIAL_RECEIPT", errorMessage: "O tribunal respondeu sem o recibo oficial.", finishedAt: now } : { outcome: "CONFIRMED", finishedAt: now } });
    if (finalStatus === "FILED_CONFIRMED") {
      await tx.petitionReceipt.create({ data: { organizationId: ctx.organizationId, petitionId: id, attemptId: attempt.id, source: "OFFICIAL_RESPONSE", environment: "PRODUCTION", protocol: receipt.protocol, receiptText: receipt.receipt, receiptSha256: sha256(receipt.receipt), filedAt: receipt.filedAt ?? null, recordedById: ctx.userId } });
    }
    await logCaseEvent(tx, ctx, p.caseId, {
      kind: "PETITION_SUBMITTED",
      title:
        finalStatus === "FILED_CONFIRMED" ? `Petição protocolada com confirmação oficial: ${p.title}`
        : finalStatus === "AWAITING_CONFIRMATION" ? `Petição enviada, aguardando confirmação oficial: ${p.title}`
        : finalEnv === "DEMO" ? `Petição enviada em DEMONSTRAÇÃO (sem protocolo real): ${p.title}`
        : `Petição enviada em ambiente de TESTE (sem efeito no processo real): ${p.title}`,
      description: `Protocolo ${receipt.protocol}`,
    });
    await audit({ action: "petition.submit", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, metadata: { adapter: adapter.key, demo: adapter.isDemo, environment: finalEnv, status: finalStatus, version: p.documentVersion, attachments: attachmentsForAdapter.length, attempt: attempt.attemptNo }, meta: ctx.meta }, tx);
  });
  if (target) await recordFilingEvidence(ctx, { ...target, environment: finalEnv === "DEMO" ? target.environment : finalEnv }, finalStatus === "FILED_CONFIRMED" || (finalStatus === "SUBMITTED" && finalEnv === "HOMOLOGATION") ? "PASSED" : finalStatus === "SUBMITTED" ? "PASSED" : "INCONCLUSIVE", finalStatus === "AWAITING_CONFIRMATION" ? "NO_OFFICIAL_RECEIPT" : null, id);
  if (!adapter.isDemo) await chargeCredits(ctx.organizationId, "petition.submit", { type: "petition", id, userId: ctx.userId });
  await emitWebhookEvent(ctx.organizationId, "petition.submitted", { petitionId: p.id, caseId: p.caseId, protocol: receipt.protocol, isDemo: adapter.isDemo, adapter: adapter.key, status: finalStatus, environment: finalEnv, officiallyFiled: finalStatus === "FILED_CONFIRMED" });
  return { protocol: receipt.protocol, isDemo: adapter.isDemo, status: finalStatus, environment: finalEnv, officiallyFiled: finalStatus === "FILED_CONFIRMED" };
}

// ------------------------------------------------------------------------------------------------ conferência (uma pessoa registra o resultado)

export type ReconcileInput =
  | { outcome: "FILED"; protocol: string; receiptDocumentId: string; filedAt?: Date | null; note?: string | null }
  | { outcome: "NOT_FILED"; note: string };

const PROTOCOL_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,59}$/;

/**
 * Registra o resultado de uma conferência no tribunal.
 *  - FILED: a petição foi protocolada (por este sistema sem confirmação, ou por fora no portal do tribunal). Exige o NÚMERO do protocolo e o RECIBO
 *    (um documento do processo): sem recibo, não há "confirmação oficial".
 *  - NOT_FILED: conferido no tribunal que NADA foi protocolado. Só então a petição volta a poder ser enviada.
 */
export async function reconcilePetition(ctx: TenantContext, id: string, input: ReconcileInput) {
  assertCan(ctx, "petitions:approve");
  const p = await loadPetition(ctx, id);
  const legacyDoubt = p.status === "FAILED" && isLegacyUncertain(p.error);
  const now = new Date();

  if (input.outcome === "NOT_FILED") {
    const note = input.note.trim();
    if (note.length < 10) throw new ValidationError("Explique como conferiu.", { note: ["Descreva onde conferiu (mínimo de 10 caracteres)."] });
    if (note.length > 1000) throw new ValidationError("Texto muito longo.", { note: ["Máximo de 1000 caracteres."] });
    if (!(["UNKNOWN", "AWAITING_CONFIRMATION"].includes(p.status) || legacyDoubt)) throw new ConflictError("Só petições em dúvida podem ser conferidas desta forma.");
    const who = (await userNames(ctx, [ctx.userId])).get(ctx.userId) ?? "uma pessoa do escritório";
    await db.$transaction(async (tx) => {
      const res = await tx.petitionFiling.updateMany({ where: { id, organizationId: ctx.organizationId, status: { in: ["UNKNOWN", "AWAITING_CONFIRMATION", "FAILED"] }, deletedAt: null }, data: { status: "FAILED", unknownSince: null, error: `Conferido no tribunal por ${who} em ${now.toISOString().slice(0, 10)}: nada foi protocolado. ${note}`.slice(0, 500) } });
      if (res.count === 0) throw new ConflictError("A petição mudou de situação. Recarregue a página.");
      await tx.petitionAttempt.updateMany({ where: { petitionId: id, outcome: { in: ["UNCERTAIN", "STARTED"] } }, data: { outcome: "ABORTED", resolution: "NOT_FILED", resolvedById: ctx.userId, resolvedAt: now } });
      await logCaseEvent(tx, ctx, p.caseId, { kind: "PETITION_RECONCILED", title: `Petição conferida no tribunal: não foi protocolada (${p.title})`, description: note });
      await audit({ action: "petition.reconcile_not_filed", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, metadata: { from: p.status }, meta: ctx.meta }, tx);
    });
    return { status: "FAILED" as const };
  }

  const protocol = input.protocol.trim();
  if (!PROTOCOL_RE.test(protocol)) throw new ValidationError("Número de protocolo inválido.", { protocol: ["Informe o número do protocolo como aparece no recibo do tribunal."] });
  if (!["UNKNOWN", "AWAITING_CONFIRMATION", "APPROVED", "FAILED"].includes(p.status)) throw new ConflictError("Esta petição não está em uma situação que permita registrar o protocolo.");
  assertCan(ctx, "documents:read");
  const receiptDoc = await db.document.findFirst({ where: { id: input.receiptDocumentId, organizationId: ctx.organizationId, deletedAt: null, caseId: p.caseId }, select: { id: true, name: true, currentVersion: true } });
  if (!receiptDoc) throw new ValidationError("Recibo inválido.", { receiptDocumentId: ["Anexe o recibo do tribunal aos documentos deste processo e escolha-o aqui."] });
  const note = input.note?.trim() || null;
  if (note && note.length > 1000) throw new ValidationError("Texto muito longo.", { note: ["Máximo de 1000 caracteres."] });
  const who = (await userNames(ctx, [ctx.userId])).get(ctx.userId) ?? "uma pessoa do escritório";
  const receiptText = `Protocolo ${protocol} registrado por ${who} em ${now.toISOString().slice(0, 10)} com o recibo do tribunal anexado: ${receiptDoc.name} (versão ${receiptDoc.currentVersion}).`;
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.petitionFiling.updateMany({
        where: { id, organizationId: ctx.organizationId, status: { in: ["UNKNOWN", "AWAITING_CONFIRMATION", "APPROVED", "FAILED"] }, deletedAt: null },
        data: { status: "FILED_CONFIRMED", filingEnvironment: "PRODUCTION", adapter: p.adapter ?? "manual", protocol, receipt: receiptText, submittedAt: input.filedAt ?? now, confirmedAt: now, unknownSince: null, scheduledFor: null, scheduleNote: null, error: null, ...(p.submittedById ? {} : { submittedById: ctx.userId }) },
      });
      if (res.count === 0) throw new ConflictError("A petição mudou de situação. Recarregue a página.");
      const lastAttempt = await tx.petitionAttempt.findFirst({ where: { petitionId: id }, orderBy: { attemptNo: "desc" }, select: { id: true } });
      await tx.petitionAttempt.updateMany({ where: { petitionId: id, outcome: { in: ["UNCERTAIN", "STARTED"] } }, data: { outcome: "CONFIRMED", resolution: "FILED", resolvedById: ctx.userId, resolvedAt: now } });
      await tx.petitionReceipt.create({ data: { organizationId: ctx.organizationId, petitionId: id, attemptId: lastAttempt?.id ?? null, source: "MANUAL_ATTESTATION", environment: "PRODUCTION", protocol, receiptText, receiptSha256: sha256(receiptText), receiptDocumentId: receiptDoc.id, filedAt: input.filedAt ?? null, recordedById: ctx.userId, note } });
      await logCaseEvent(tx, ctx, p.caseId, { kind: "PETITION_SUBMITTED", title: `Petição protocolada, confirmada por ${who} com o recibo do tribunal: ${p.title}`, description: `Protocolo ${protocol}` });
      await audit({ action: "petition.reconcile_filed", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: id, metadata: { from: p.status, receiptDocumentId: receiptDoc.id }, meta: ctx.meta }, tx);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("Esta petição já tem um recibo registrado.");
    throw e;
  }
  await emitWebhookEvent(ctx.organizationId, "petition.submitted", { petitionId: p.id, caseId: p.caseId, protocol, isDemo: false, adapter: "manual", status: "FILED_CONFIRMED", environment: "PRODUCTION", officiallyFiled: true, confirmedManually: true });
  return { status: "FILED_CONFIRMED" as const, protocol };
}
