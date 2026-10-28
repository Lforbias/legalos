import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { createCaseSchema } from "@/modules/cases/schemas";
import { EMPTY_TASK } from "@/modules/tasks/schemas";
import { createCase, getCase, listCases, renameCaseDepartment, updateCase } from "@/server/services/case.service";
import { apiListCases } from "@/server/services/public-api.service";
import { addTaskComment, createTask, getTask } from "@/server/services/task.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const base = createCaseSchema.parse({ number: "", legacyNumber: "", title: "Benefício administrativo", area: "Previdenciário", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE", phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" });
const cnj = () => { const p = { sequence: "0000008", year: "2026", segment: "8", court: "26", origin: "0100" }; return `${p.sequence}-${computeCnjCheck(p)}.2026.8.26.0100`; };

describe("rotina do escritório: natureza, departamentos e colaboração", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let b: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let colleague: Awaited<ReturnType<typeof addMember>>;
  beforeAll(async () => { a = await makeOrgWithOwner("rotina-a"); b = await makeOrgWithOwner("rotina-b"); colleague = await addMember(a.org.id, "LAWYER", "colega"); });

  it("cria caso sem CNJ e encaminha pela área ao departamento do próprio escritório", async () => {
    const c = await createCase(a.ctx, base);
    const other = await createCase(b.ctx, base);
    expect(c.nature).toBe("CASE");
    expect(c.departmentId).toBeTruthy();
    expect(c.departmentId).not.toBe(other.departmentId);
    expect((await getCase(a.ctx, c.id)).department?.name).toBe("Previdenciário");
  });

  it("mantém natureza administrativa em edição feita por cliente antigo da API", async () => {
    const c = await createCase(a.ctx, { ...base, nature: "ADMINISTRATIVE", legacyNumber: "INSS-1234" });
    await updateCase(a.ctx, c.id, { ...base, title: "Benefício revisado", legacyNumber: "INSS-1234" });
    expect((await getCase(a.ctx, c.id)).nature).toBe("ADMINISTRATIVE");
  });

  it("judicializa o mesmo caso preservando tarefa, comentários e vínculo", async () => {
    const c = await createCase(a.ctx, { ...base, nature: "ADMINISTRATIVE" });
    const task = await createTask(a.ctx, { ...EMPTY_TASK, title: "Cobrar documentos", caseId: c.id });
    await addTaskComment(a.ctx, task.id, { body: "Cliente entregará amanhã." });
    await updateCase(a.ctx, c.id, { ...base, nature: "JUDICIAL", number: cnj() });
    expect((await getCase(a.ctx, c.id)).nature).toBe("JUDICIAL");
    expect((await getTask(a.ctx, task.id)).comments).toHaveLength(1);
    expect((await getTask(a.ctx, task.id)).caseId).toBe(c.id);
  });

  it("rejeita CNJ em caso administrativo e departamento de outro escritório", async () => {
    await expect(createCase(a.ctx, { ...base, nature: "ADMINISTRATIVE", number: cnj() })).rejects.toBeInstanceOf(ValidationError);
    const foreign = await createCase(b.ctx, { ...base, area: "Cível" });
    await expect(createCase(a.ctx, { ...base, departmentId: foreign.departmentId! })).rejects.toBeInstanceOf(ValidationError);
  });

  it("reencaminha ao mudar a área e permite nome personalizado com permissão de gestão", async () => {
    const c = await createCase(a.ctx, base);
    await updateCase(a.ctx, c.id, { ...base, area: "Cível" });
    const updated = await getCase(a.ctx, c.id);
    expect(updated.departmentId).not.toBe(c.departmentId);
    await renameCaseDepartment(a.ctx, updated.departmentId!, "Núcleo cível");
    await expect(renameCaseDepartment(colleague.ctx, updated.departmentId!, "Outro")).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listCases(a.ctx, { departmentId: updated.departmentId!, nature: "CASE" })).items.map(x => x.id)).toContain(c.id);
    const api = await apiListCases(a.ctx, { departmentId: updated.departmentId!, nature: "CASE" });
    expect(api.data.find(x => x.id === c.id)?.departmentName).toBe("Núcleo cível");
  });

  it("comenta, menciona e remarca atomicamente, registrando o histórico", async () => {
    const t = await createTask(a.ctx, { ...EMPTY_TASK, title: "Cobrar cliente", dueDate: "2026-10-28" });
    await addTaskComment(a.ctx, t.id, { body: `@${colleague.user.name} Cliente pagará amanhã.`, reschedule: true, dueDate: "2026-10-29", expectedUpdatedAt: t.updatedAt.toISOString() });
    const saved = await getTask(a.ctx, t.id);
    expect(saved.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-29");
    expect(saved.comments[0]?.mentionedIds).toContain(colleague.user.id);
    expect(await db.notification.count({ where: { userId: colleague.user.id, kind: "task.mention", link: `/tarefas/${t.id}` } })).toBe(1);
    expect(await db.taskEvent.count({ where: { taskId: t.id, detail: { contains: "Vencimento:" } } })).toBe(1);
    await expect(addTaskComment(a.ctx, t.id, { body: "Comentário obsoleto", reschedule: true, dueDate: "2026-10-30", expectedUpdatedAt: t.updatedAt.toISOString() })).rejects.toBeInstanceOf(ConflictError);
    expect((await getTask(a.ctx, t.id)).comments).toHaveLength(1);
  });

  it("não notifica nem grava menção a colega sem acesso ao caso sigiloso", async () => {
    const c = await createCase(a.ctx, { ...base, confidential: true });
    const t = await createTask(a.ctx, { ...EMPTY_TASK, title: "Informação restrita", caseId: c.id });
    await addTaskComment(a.ctx, t.id, { body: `@${colleague.user.name} Assunto sigiloso.` });
    expect((await getTask(a.ctx, t.id)).comments[0]?.mentionedIds).toEqual([]);
    expect(await db.notification.count({ where: { userId: colleague.user.id, link: `/tarefas/${t.id}` } })).toBe(0);
  });
});
