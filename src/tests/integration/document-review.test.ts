import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { createCaseSchema } from "@/modules/cases/schemas";
import { createCase } from "@/server/services/case.service";
import { uploadDocument, addDocumentVersion } from "@/server/services/document.service";
import { requestDocumentReview, decideDocumentReview, listDocumentReviews } from "@/server/services/document-review.service";
import { addMember, makeOrgWithOwner } from "./helpers";

vi.unmock("@/lib/box-retirement");

const base = createCaseSchema.parse({ number: "", legacyNumber: "", title: "Revisão jurídica", area: "Cível", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE", phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" });
describe("revisão editorial independente do Box", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let b: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let reviewer: Awaited<ReturnType<typeof addMember>>;
  beforeAll(async () => { a = await makeOrgWithOwner("review"); b = await makeOrgWithOwner("foreign-review"); reviewer = await addMember(a.org.id, "LAWYER", "reviewer"); });
  async function document(confidential = false) {
    const c = await createCase(a.ctx, { ...base, confidential });
    return uploadDocument(a.ctx, { caseId: c.id }, { name: "minuta.txt", buffer: Buffer.from("Minuta para conferência") });
  }
  it("solicita e aprova com histórico e auditoria, sem habilitar protocolo", async () => {
    const d = await document();
    const r = await requestDocumentReview(a.ctx, d.id, 1);
    await decideDocumentReview(reviewer.ctx, r.id, "APPROVED", "Conferido");
    expect((await listDocumentReviews(a.ctx, d.id))[0]).toMatchObject({ status: "APPROVED", version: 1, reviewedById: reviewer.user.id, note: "Conferido" });
    expect(await db.auditLog.count({ where: { resourceId: d.id, action: { startsWith: "document.review." } } })).toBe(2);
    expect(await db.petitionFiling.count({ where: { documentId: d.id } })).toBe(0);
    await expect(decideDocumentReview(reviewer.ctx, r.id, "APPROVED", "")).rejects.toBeInstanceOf(ConflictError);
  });
  it("impede autorrevisão, duplicidade e pedido com versão antiga", async () => {
    const d = await document(); const r = await requestDocumentReview(a.ctx, d.id, 1);
    await expect(decideDocumentReview(a.ctx, r.id, "APPROVED", "")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requestDocumentReview(a.ctx, d.id, 1)).rejects.toBeInstanceOf(ConflictError);
    await expect(requestDocumentReview(a.ctx, d.id, 2)).rejects.toBeInstanceOf(ConflictError);
  });
  it("exige justificativa para ajustes e permite nova rodada", async () => {
    const d = await document(); const r = await requestDocumentReview(a.ctx, d.id, 1);
    await expect(decideDocumentReview(reviewer.ctx, r.id, "CHANGES_REQUESTED", " ")).rejects.toBeInstanceOf(ValidationError);
    await decideDocumentReview(reviewer.ctx, r.id, "CHANGES_REQUESTED", "Revisar pedidos");
    await requestDocumentReview(a.ctx, d.id, 1);
    expect(await listDocumentReviews(a.ctx, d.id)).toHaveLength(2);
  });
  it("nova versão encerra revisão pendente e não herda aprovação", async () => {
    const d = await document(); const r = await requestDocumentReview(a.ctx, d.id, 1);
    await addDocumentVersion(a.ctx, d.id, { name: "minuta.txt", buffer: Buffer.from("Minuta alterada") });
    expect((await listDocumentReviews(a.ctx, d.id))[0]?.status).toBe("SUPERSEDED");
    await expect(decideDocumentReview(reviewer.ctx, r.id, "APPROVED", "")).rejects.toBeInstanceOf(ConflictError);
    const next = await requestDocumentReview(a.ctx, d.id, 2);
    await decideDocumentReview(reviewer.ctx, next.id, "APPROVED", "");
    await addDocumentVersion(a.ctx, d.id, { name: "minuta.txt", buffer: Buffer.from("Terceira versão") });
    expect((await listDocumentReviews(a.ctx, d.id)).find(r => r.status === "APPROVED")?.version).toBe(2);
  });
  it("respeita escritório, sigilo e permissão de escrita", async () => {
    const d = await document(true); const r = await requestDocumentReview(a.ctx, d.id, 1);
    await expect(requestDocumentReview(b.ctx, d.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    await expect(decideDocumentReview(b.ctx, r.id, "APPROVED", "")).rejects.toBeInstanceOf(NotFoundError);
    expect((await listDocumentReviews(reviewer.ctx)).some(item => item.documentId === d.id)).toBe(false);
    await expect(decideDocumentReview(reviewer.ctx, r.id, "APPROVED", "")).rejects.toThrow();
    await expect(requestDocumentReview({ ...a.ctx, permissions: new Set(["documents:read", "cases:read"]) }, d.id, 1)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("serializa duas solicitações simultâneas", async () => {
    const d = await document();
    const results = await Promise.allSettled([requestDocumentReview(a.ctx, d.id, 1), requestDocumentReview(a.ctx, d.id, 1)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.documentReview.count({ where: { documentId: d.id, status: "IN_REVIEW" } })).toBe(1);
  });
});
