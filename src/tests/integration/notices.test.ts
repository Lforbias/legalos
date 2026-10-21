import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import type { NoticeInput } from "@/modules/inbox/schemas";
import { createCase } from "@/server/services/case.service";
import { createDeadline } from "@/server/services/deadline.service";
import {
  assignNotice, createNotice, deleteNotice, discardNotice, getNotice, linkNoticeCase, listNotices, markProcessed, noticeCounts, reopenNotice,
} from "@/server/services/notice.service";
import { createTask } from "@/server/services/task.service";
import { unreadCount } from "@/server/services/notification.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const cnj = (seq: string) => {
  const p = { sequence: seq, year: "2024", segment: "8", court: "26", origin: "0100" };
  return `${seq}-${computeCnjCheck(p)}.2024.8.26.0100`;
};
const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const notice = (o: Partial<NoticeInput> = {}): NoticeInput => ({
  source: "MANUAL", kind: "INTIMACAO", title: "Intimação de teste", content: "Fica a parte intimada para se manifestar no prazo de 15 dias.", caseNumber: "", court: "", publishedAt: "", receivedAt: "2030-03-01", caseId: "", ...o,
});
const taskIn = { title: "Providência", description: "", status: "TODO" as const, priority: "NORMAL" as const, dueDate: "", assigneeId: "", caseId: "", clientId: "" };

describe("central de intimações (Fase 4)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let lawyer2: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  let caseA: { id: string };

  beforeAll(async () => {
    A = await makeOrgWithOwner("f4-A");
    B = await makeOrgWithOwner("f4-B");
    lawyer = await addMember(A.org.id, "LAWYER", "f4-l1");
    lawyer2 = await addMember(A.org.id, "LAWYER", "f4-l2");
    assistant = await addMember(A.org.id, "ASSISTANT", "f4-as");
    finance = await addMember(A.org.id, "FINANCE", "f4-fin");
    caseA = await createCase(A.ctx, { ...caseBase, title: "Processo A", number: cnj("0004001") });
  });

  it("vincula automaticamente pelo número CNJ e registra na linha do tempo do processo", async () => {
    const n = await createNotice(lawyer.ctx, notice({ title: "Com número", caseNumber: cnj("0004001"), content: "Intimação do processo com número conhecido." }));
    expect(n.autoLinked).toBe(true);
    expect(n.caseId).toBe(caseA.id);
    const kinds = (await db.caseEvent.findMany({ where: { caseId: caseA.id } })).map((e) => e.kind);
    expect(kinds).toContain("NOTICE_LINKED");
  });

  it("não vincula a processo de outro escritório nem a número desconhecido", async () => {
    const cB = await createCase(B.ctx, { ...caseBase, number: cnj("0004002") });
    const n = await createNotice(lawyer.ctx, notice({ title: "Número de outro escritório", caseNumber: cnj("0004002"), content: "Texto diferente para número do escritório B." }));
    expect(n.caseId).toBeNull();
    await expect(createNotice(lawyer.ctx, notice({ caseId: cB.id, content: "Texto para vínculo forçado inválido." }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejeita número CNJ inválido e dados incompletos no servidor", async () => {
    await expect(createNotice(lawyer.ctx, notice({ caseNumber: "0001234-00.2024.8.26.0100" }))).rejects.toThrow();
    await expect(createNotice(lawyer.ctx, notice({ title: "x" }))).rejects.toThrow();
    await expect(createNotice(lawyer.ctx, notice({ content: "curto" }))).rejects.toThrow();
  });

  it("detecta duplicidade pelo teor (ignora acento/caixa), apenas dentro do escritório", async () => {
    const first = await createNotice(lawyer.ctx, notice({ title: "Original", content: "Intimação para MANIFESTAÇÃO sobre laudo pericial." }));
    const dup = await createNotice(lawyer2.ctx, notice({ title: "Repetida", content: "intimacao  para manifestacao sobre laudo pericial." }));
    expect(dup.duplicate).toBe(true);
    expect((await getNotice(lawyer.ctx, dup.id)).duplicateOf?.id).toBe(first.id);
    const other = await createNotice(B.ctx, notice({ title: "Em outro escritório", content: "Intimação para MANIFESTAÇÃO sobre laudo pericial." }));
    expect(other.duplicate).toBe(false);
    expect((await listNotices(lawyer.ctx, { duplicates: true })).items.map((i) => i.id)).toContain(dup.id);
  });

  it("distribui para membro ativo, notifica e muda a situação; recusa membro de outro escritório", async () => {
    const n = await createNotice(lawyer.ctx, notice({ title: "Para distribuir", content: "Conteúdo exclusivo para o teste de distribuição." }));
    const before = await unreadCount(lawyer2.ctx);
    await assignNotice(lawyer.ctx, n.id, { userId: lawyer2.user.id });
    const g = await getNotice(lawyer.ctx, n.id);
    expect(g.status).toBe("DISTRIBUTED");
    expect(g.assigneeId).toBe(lawyer2.user.id);
    expect(await unreadCount(lawyer2.ctx)).toBe(before + 1);
    // membro sem acesso à caixa (Assistente) não pode receber distribuição
    await expect(assignNotice(lawyer.ctx, n.id, { userId: assistant.user.id })).rejects.toThrow();
    await expect(assignNotice(lawyer.ctx, n.id, { userId: B.owner.id })).rejects.toThrow();
  });

  it("cria tarefa e prazo (rascunho) a partir da intimação, com a origem registrada", async () => {
    const n = await createNotice(lawyer.ctx, notice({ title: "Gera providências", content: "Prazo de 5 dias para juntar documentos. Texto único.", caseId: caseA.id }));
    const t = await createTask(lawyer.ctx, { ...taskIn, caseId: caseA.id }, { sourceNoticeId: n.id });
    const d = await createDeadline(lawyer.ctx, { caseId: caseA.id, title: "Juntar documentos", kind: "", startDate: "", days: "", countType: "", dueDate: "2030-04-10", internalDueDate: "", responsibleId: "", notes: "", calculationNote: "" }, { sourceNoticeId: n.id });
    expect(d.status).toBe("DRAFT");
    const g = await getNotice(lawyer.ctx, n.id);
    expect(g.tasks.map((x) => x.id)).toEqual([t.id]);
    expect(g.deadlines.map((x) => x.id)).toEqual([d.id]);
    // intimação com providências não pode ser descartada nem excluída
    await expect(discardNotice(lawyer.ctx, n.id, { reason: "engano" })).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteNotice(lawyer.ctx, n.id)).rejects.toThrow();
    await markProcessed(lawyer.ctx, n.id);
    expect((await getNotice(lawyer.ctx, n.id)).status).toBe("PROCESSED");
  });

  it("não aceita intimação de origem de outro escritório em tarefa/prazo", async () => {
    const nB = await createNotice(B.ctx, notice({ title: "Do B", content: "Conteúdo do escritório B para teste de origem." }));
    await expect(createTask(A.ctx, taskIn, { sourceNoticeId: nB.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("descarta com motivo, reabre e controla concorrência no encerramento", async () => {
    const n = await createNotice(lawyer.ctx, notice({ title: "Para descartar", content: "Conteúdo para descarte com motivo." }));
    await expect(discardNotice(lawyer.ctx, n.id, { reason: "" })).rejects.toThrow();
    await discardNotice(lawyer.ctx, n.id, { reason: "Não é do escritório" });
    const d = await getNotice(lawyer.ctx, n.id);
    expect(d.status).toBe("DISCARDED");
    expect(d.discardReason).toBe("Não é do escritório");
    await expect(markProcessed(lawyer.ctx, n.id)).rejects.toBeInstanceOf(ConflictError);
    await reopenNotice(lawyer.ctx, n.id);
    expect((await getNotice(lawyer.ctx, n.id)).status).toBe("NEW");

    const m = await createNotice(lawyer.ctx, notice({ title: "Concorrência", content: "Conteúdo para teste de concorrência." }));
    const r = await Promise.allSettled([markProcessed(lawyer.ctx, m.id), markProcessed(A.ctx, m.id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("isola entre escritórios", async () => {
    const nB = await createNotice(B.ctx, notice({ title: "Segredo B", content: "Conteúdo confidencial do escritório B." }));
    await expect(getNotice(A.ctx, nB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(markProcessed(A.ctx, nB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(assignNotice(A.ctx, nB.id, { userId: A.owner.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteNotice(A.ctx, nB.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listNotices(A.ctx, { status: "NEW" })).items.map((i) => i.id)).not.toContain(nB.id);
    const cA = await noticeCounts(A.ctx);
    const cB = await noticeCounts(B.ctx);
    expect(cA.NEW).not.toBe(cB.NEW + 999);
  });

  it("respeita o sigilo do processo vinculado", async () => {
    const secret = await createCase(lawyer.ctx, { ...caseBase, title: "Sigiloso", confidential: true, number: cnj("0004003") });
    const n = await createNotice(lawyer.ctx, notice({ title: "Em processo sigiloso", caseNumber: cnj("0004003"), content: "Conteúdo de processo sigiloso do escritório." }));
    expect(n.caseId).toBe(secret.id);
    await expect(getNotice(lawyer2.ctx, n.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listNotices(lawyer2.ctx)).items.map((i) => i.id)).not.toContain(n.id);
    await expect(linkNoticeCase(lawyer2.ctx, n.id, secret.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listNotices(A.ctx)).items.map((i) => i.id)).toContain(n.id);
  });

  it("exige permissão: Financeiro e Assistente não acessam; auditoria registrada", async () => {
    await expect(listNotices(finance.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createNotice(finance.ctx, notice())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listNotices(assistant.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    const n = await createNotice(lawyer2.ctx, notice({ title: "Pelo advogado", content: "Conteúdo registrado pelo segundo advogado." }));
    await markProcessed(lawyer2.ctx, n.id);
    expect(await db.auditLog.count({ where: { organizationId: A.org.id, resourceId: n.id } })).toBe(2);
  });
});
