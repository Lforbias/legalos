import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ForbiddenError, NotFoundError, ConflictError } from "@/lib/permissions/check";
import { listCaseAutos, setDocumentBookmark } from "@/server/services/autos.service";
import { uploadDocument } from "@/server/services/document.service";
import { createRule, runWorkflows } from "@/server/services/workflow.service";
import { getTask, changeTaskStatus } from "@/server/services/task.service";
import { saveTaskStage, setTaskStage } from "@/server/services/task-stage.service";
import { auditImportedTasks } from "@/server/services/import-audit.service";
import { makeOrgWithOwner, addMember } from "./helpers";

describe("BOX: autos, regras e etapas", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let caseId: string;
  beforeAll(async () => {
    A = await makeOrgWithOwner("box-op-A"); B = await makeOrgWithOwner("box-op-B");
    lawyer = await addMember(A.org.id, "LAWYER", "box-op-law");
    caseId = (await db.case.create({ data: { organizationId: A.org.id, title: "Autos teste", court: "TJBA" } })).id;
  });
  it("favoritos pessoais são idempotentes, isolados por usuário e escritório", async () => {
    const d = await uploadDocument(A.ctx, { caseId }, { name: "sentenca.pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
    await setDocumentBookmark(A.ctx, d.id, true); await setDocumentBookmark(A.ctx, d.id, true);
    expect((await listCaseAutos(A.ctx, caseId, { favorites: true })).items.map(x => x.id)).toEqual([d.id]);
    expect((await listCaseAutos(lawyer.ctx, caseId, { favorites: true })).total).toBe(0);
    await expect(setDocumentBookmark(B.ctx, d.id, true)).rejects.toBeInstanceOf(NotFoundError);
    await setDocumentBookmark(A.ctx, d.id, false);
    expect((await listCaseAutos(A.ctx, caseId, { favorites: true })).total).toBe(0);
  });
  it("índice respeita sigilo e pesquisa nome, descrição e texto extraído", async () => {
    const secret = await db.case.create({ data: { organizationId: A.org.id, title: "Sigilo", confidential: true } });
    await expect(listCaseAutos(lawyer.ctx, secret.id)).rejects.toBeInstanceOf(NotFoundError);
    const d = await uploadDocument(A.ctx, { caseId }, { name: "anexo.pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") }, { description: "prova ocupacional" });
    await db.documentText.create({ data: { organizationId: A.org.id, documentId: d.id, version: 1, status: "EXTRACTED", content: "palavraexclusiva", searchText: "palavraexclusiva" } });
    expect((await listCaseAutos(A.ctx, caseId, { q: "OCUPACIONAL" })).items[0]?.id).toBe(d.id);
    expect((await listCaseAutos(A.ctx, caseId, { q: "palavraexclusiva" })).items[0]?.id).toBe(d.id);
  });
  it("etapas preservam status-base, conclusão e isolamento; seleção padrão limpa etapa", async () => {
    const stage = await saveTaskStage(A.ctx, null, { name: "Aguardando protocolo", status: "WAITING", position: 1, active: true });
    const done = await saveTaskStage(A.ctx, null, { name: "Protocolada", status: "DONE", position: 2, active: true });
    const t = await db.task.create({ data: { organizationId: A.org.id, title: "Protocolar" } });
    await setTaskStage(A.ctx, t.id, stage.id);
    expect((await getTask(A.ctx, t.id)).status).toBe("WAITING");
    await expect(saveTaskStage(lawyer.ctx, null, { name: "Sem acesso", status: "TODO", position: 0, active: true })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setTaskStage(B.ctx, t.id, stage.id)).rejects.toBeInstanceOf(NotFoundError);
    await setTaskStage(A.ctx, t.id, done.id);
    expect((await getTask(A.ctx, t.id)).completedAt).not.toBeNull();
    await changeTaskStatus(A.ctx, t.id, "TODO");
    expect((await getTask(A.ctx, t.id)).stageId).toBeNull();
    expect((await getTask(A.ctx, t.id)).completedAt).toBeNull();
    await expect(saveTaskStage(A.ctx, stage.id, { name: stage.name, status: "DONE", position: 1, active: true })).rejects.toBeInstanceOf(ConflictError);
  });
  const rule = (extra: object = {}) => ({ name: "Regra condicional", trigger: "NOTICE_RECEIVED", taskTitle: "Revisar {{gatilho}}", taskDescription: "", dueDays: "1", priority: "NORMAL", assigneeMode: "TRIGGER_USER", assigneeId: "", active: true, ...extra });
  const notice = (extra: object = {}) => db.courtNotice.create({ data: { organizationId: A.org.id, title: "Decisão urgente", content: "cumprir", contentHash: randomUUID(), court: "TJBA", caseId, receivedAt: new Date(), ...extra } });
  it("condições E/OU distribuem, etiquetam e criam tarefa uma vez por origem", async () => {
    const r = await createRule(A.ctx, rule({ noticeAssigneeId: lawyer.user.id, noticeTags: "urgente", conditions: { mode: "ALL", items: [{ field: "court", operator: "EQUALS", value: "TJBA" }] } }));
    const n = await notice();
    const src = { type: "notice", id: n.id, noticeId: n.id, caseId, userId: A.owner.id, label: n.title, baseDate: "2026-10-23" };
    await runWorkflows(A.ctx, "NOTICE_RECEIVED", src); await runWorkflows(A.ctx, "NOTICE_RECEIVED", src);
    const after = await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.assigneeId).toBe(lawyer.user.id); expect(after.tags).toContain("urgente");
    expect(await db.workflowRun.count({ where: { ruleId: r.id, sourceId: n.id, status: "CREATED" } })).toBe(1);
    const no = await notice({ court: "TJSP" });
    await runWorkflows(A.ctx, "NOTICE_RECEIVED", { ...src, id: no.id, noticeId: no.id });
    expect((await db.workflowRun.findFirstOrThrow({ where: { ruleId: r.id, sourceId: no.id } })).status).toBe("SKIPPED");
    await db.workflowRule.update({ where: { id: r.id }, data: { active: false } });
  });
  it("falha nas etiquetas desfaz distribuição e tarefa na mesma transação", async () => {
    const r = await createRule(A.ctx, rule({ noticeAssigneeId: lawyer.user.id, noticeTags: "extra" }));
    const n = await notice({ tags: Array.from({ length: 10 }, (_, i) => `tag-${i}`) });
    await runWorkflows(A.ctx, "NOTICE_RECEIVED", { type: "notice", id: n.id, noticeId: n.id, caseId, userId: A.owner.id, label: n.title, baseDate: "2026-10-23" });
    expect((await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } })).assigneeId).toBeNull();
    expect(await db.task.count({ where: { sourceNoticeId: n.id } })).toBe(0);
    expect((await db.workflowRun.findFirstOrThrow({ where: { ruleId: r.id, sourceId: n.id } })).status).toBe("FAILED");
    await db.workflowRule.update({ where: { id: r.id }, data: { active: false } });
  });
  it("auditoria encontra indícios sem alterar tarefas ou incluir outro escritório", async () => {
    const t = await db.task.create({ data: { organizationId: A.org.id, title: "Conferir legado", status: "TODO", description: "Tarefa 'concluída' em '24 de Janeiro' por 'Equipe'." } });
    await db.importMap.create({ data: { organizationId: A.org.id, source: "astrea", entity: "task", externalId: randomUUID(), internalId: t.id } });
    const result = await auditImportedTasks(A.ctx);
    expect(result.readOnly).toBe(true); expect(result.candidates.map(x => x.id)).toContain(t.id);
    expect((await auditImportedTasks(B.ctx)).candidateCount).toBe(0);
    expect((await getTask(A.ctx, t.id)).status).toBe("TODO");
  });
});
