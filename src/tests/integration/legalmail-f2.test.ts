import { beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { db } from "@/lib/db/client";
import type { CreateCaseInput } from "@/modules/cases/schemas";
import type { TaskInput } from "@/modules/tasks/schemas";
import { addCaseMember, createCase } from "@/server/services/case.service";
import { addTaskComment, changeTaskStatus, createTask, listTasks, updateTask } from "@/server/services/task.service";
import {
  addTaskAttachment, deleteTaskAttachment, deleteTaskLabel, deleteTaskType, getTaskAttachmentForDownload, getTaskClassification, listTaskAttachments, listTaskEvents,
  listTaskLabels, listTaskTypes, pointsReport, saveTaskLabel, saveTaskType, setTaskClassification,
} from "@/server/services/task-extras.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const task = (o: Partial<TaskInput> = {}): TaskInput => ({ title: "Protocolar petição", description: "", status: "TODO", priority: "NORMAL", dueDate: "", assigneeId: "", caseId: "", clientId: "", ...o });
const caseBase: CreateCaseInput = {
  number: "", legacyNumber: "", title: "Ação sigilosa", area: "Cível", court: "TJBA", courtUnit: "", courtState: "", subject: "", claimValue: "",
  status: "ACTIVE", phase: "", distributedAt: "", confidential: true, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF",
};
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

describe("3.0-F2 — Tarefas 2.0", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let lawyer2: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;

  beforeAll(async () => {
    A = await makeOrgWithOwner("l3f2-a");
    B = await makeOrgWithOwner("l3f2-b");
    lawyer = await addMember(A.org.id, "LAWYER", "l3f2-adv");
    lawyer2 = await addMember(A.org.id, "LAWYER", "l3f2-adv2");
    finance = await addMember(A.org.id, "FINANCE", "l3f2-fin");
  });

  it("tipos e etiquetas: só quem gerencia o escritório cria; nomes únicos; isolamento entre escritórios", async () => {
    await expect(saveTaskType(lawyer.ctx, null, { name: "Audiência", points: 5 })).rejects.toBeInstanceOf(ForbiddenError);
    await saveTaskType(A.ctx, null, { name: "Audiência", points: 5 });
    await expect(saveTaskType(A.ctx, null, { name: "audiência", points: 1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveTaskType(A.ctx, null, { name: "X", points: 1 })).rejects.toThrow();
    await expect(saveTaskType(A.ctx, null, { name: "Muito", points: 1000 })).rejects.toThrow();
    await saveTaskType(B.ctx, null, { name: "Audiência", points: 9 }); // mesmo nome em outro escritório
    await saveTaskLabel(A.ctx, null, { name: "Urgente cliente", color: "red" });
    await expect(saveTaskLabel(A.ctx, null, { name: "URGENTE CLIENTE", color: "blue" })).rejects.toBeInstanceOf(ValidationError);
    expect((await listTaskTypes(A.ctx)).map((t) => t.name)).toEqual(["Audiência"]);
    expect((await listTaskTypes(lawyer.ctx)).length).toBe(1); // ler é permitido
    const typeB = (await listTaskTypes(B.ctx))[0]!;
    await expect(saveTaskType(A.ctx, typeB.id, { name: "Invadido", points: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTaskType(A.ctx, typeB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("classificação: tipo + etiquetas na tarefa, com histórico e validação de pertencimento", async () => {
    const type = (await listTaskTypes(A.ctx))[0]!;
    const label = (await listTaskLabels(A.ctx))[0]!;
    const t = await createTask(lawyer.ctx, task({ title: "Preparar audiência" }));
    await setTaskClassification(lawyer.ctx, t.id, { typeId: type.id, labelIds: [label.id] });
    const cls = await getTaskClassification(lawyer.ctx, t.id);
    expect(cls.type?.name).toBe("Audiência");
    expect(cls.labels.map((l) => l.name)).toEqual(["Urgente cliente"]);
    const typeB = (await listTaskTypes(B.ctx))[0]!;
    await expect(setTaskClassification(lawyer.ctx, t.id, { typeId: typeB.id, labelIds: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(setTaskClassification(finance.ctx, t.id, { typeId: "", labelIds: [] })).rejects.toBeInstanceOf(ForbiddenError);
    const events = (await listTaskEvents(lawyer.ctx, t.id)).map((e) => e.detail);
    expect(events.some((d) => d.startsWith("Tipo:") && d.includes("Audiência"))).toBe(true);
    expect(events.some((d) => d.startsWith("Etiquetas:") && d.includes("Urgente cliente"))).toBe(true);
    // filtro por etiqueta e por tipo
    expect((await listTasks(lawyer.ctx, { labelId: label.id })).items.map((i) => i.id)).toEqual([t.id]);
    expect((await listTasks(lawyer.ctx, { typeId: type.id })).items.map((i) => i.id)).toEqual([t.id]);
    // excluir a etiqueta a retira da tarefa; excluir o tipo deixa a tarefa sem tipo
    await deleteTaskLabel(A.ctx, label.id);
    expect((await getTaskClassification(lawyer.ctx, t.id)).labels).toEqual([]);
  });

  it("histórico: criação, mudanças de campos e de situação ficam registradas com autor", async () => {
    const t = await createTask(lawyer.ctx, task({ title: "Tarefa com histórico" }));
    await updateTask(lawyer.ctx, t.id, task({ title: "Tarefa com histórico", priority: "HIGH", dueDate: "2030-05-02", assigneeId: lawyer2.user.id }));
    await changeTaskStatus(lawyer.ctx, t.id, "IN_PROGRESS");
    const ev = await listTaskEvents(lawyer.ctx, t.id);
    const texts = ev.map((e) => e.detail);
    expect(texts).toContain("Tarefa criada");
    expect(texts.some((x) => x.startsWith("Prioridade:") && x.includes("Alta"))).toBe(true);
    expect(texts.some((x) => x.startsWith("Vencimento:") && x.includes("02/05/2030"))).toBe(true);
    expect(texts.some((x) => x.startsWith("Responsável:"))).toBe(true);
    expect(texts.some((x) => x.startsWith("Situação:") && x.includes("Em andamento"))).toBe(true);
    expect(ev.every((e) => e.userName.length > 0)).toBe(true);
    await expect(listTaskEvents(B.ctx, t.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("menções: notifica só membros do escritório citados pelo nome completo", async () => {
    const t = await createTask(lawyer.ctx, task({ title: "Revisar minuta" }));
    const nm = (await db.user.findUniqueOrThrow({ where: { id: lawyer2.user.id } })).name;
    await addTaskComment(lawyer.ctx, t.id, { body: `Pode revisar, @${nm}?` });
    const c = await db.taskComment.findFirstOrThrow({ where: { taskId: t.id } });
    expect(c.mentionedIds).toEqual([lawyer2.user.id]);
    const n = await db.notification.findMany({ where: { userId: lawyer2.user.id, kind: "task.mention" } });
    expect(n.length).toBe(1);
    expect(n[0]!.link).toBe(`/tarefas/${t.id}`);
    // citar a si mesmo ou alguém de fora não notifica
    const outsider = (await db.user.findUniqueOrThrow({ where: { id: B.owner.id } })).name;
    await addTaskComment(lawyer.ctx, t.id, { body: `@${outsider} e @${(await db.user.findUniqueOrThrow({ where: { id: lawyer.user.id } })).name}` });
    expect((await db.notification.findMany({ where: { userId: B.owner.id, kind: "task.mention" } })).length).toBe(0);
    expect((await db.notification.findMany({ where: { userId: lawyer.user.id, kind: "task.mention" } })).length).toBe(0);
  });

  it("anexos: valida tipo/conteúdo, baixa só quem pode ver a tarefa e registra no histórico", async () => {
    const t = await createTask(lawyer.ctx, task({ title: "Tarefa com anexo" }));
    await addTaskAttachment(lawyer.ctx, t.id, { name: "Comprovante.pdf", buffer: PDF });
    const list = await listTaskAttachments(lawyer.ctx, t.id);
    expect(list.map((a) => a.name)).toEqual(["Comprovante.pdf"]);
    await expect(addTaskAttachment(lawyer.ctx, t.id, { name: "virus.exe", buffer: Buffer.from("MZ") })).rejects.toBeInstanceOf(ValidationError);
    await expect(addTaskAttachment(lawyer.ctx, t.id, { name: "falso.pdf", buffer: Buffer.from("isto não é pdf") })).rejects.toBeInstanceOf(ValidationError);
    await expect(addTaskAttachment(finance.ctx, t.id, { name: "x.pdf", buffer: PDF })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getTaskAttachmentForDownload(B.ctx, list[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getTaskAttachmentForDownload(lawyer2.ctx, list[0]!.id)).mimeType).toBe("application/pdf");
    // sigilo: tarefa em processo sigiloso não vaza o anexo
    const secret = await createCase(lawyer.ctx, caseBase);
    await addCaseMember(lawyer.ctx, secret.id, lawyer.user.id, "RESPONSIBLE");
    const ts = await createTask(lawyer.ctx, task({ title: "Sigilosa", caseId: secret.id }));
    await addTaskAttachment(lawyer.ctx, ts.id, { name: "secreto.pdf", buffer: PDF });
    const sid = (await listTaskAttachments(lawyer.ctx, ts.id))[0]!.id;
    await expect(getTaskAttachmentForDownload(lawyer2.ctx, sid)).rejects.toBeInstanceOf(NotFoundError);
    await deleteTaskAttachment(lawyer.ctx, list[0]!.id);
    expect(await listTaskAttachments(lawyer.ctx, t.id)).toEqual([]);
    expect((await listTaskEvents(lawyer.ctx, t.id)).map((e) => e.detail)).toEqual(expect.arrayContaining(["Anexo adicionado: Comprovante.pdf", "Anexo removido: Comprovante.pdf"]));
  });

  it("pontuação: soma os pontos das tarefas concluídas com tipo, por responsável, no período", async () => {
    const t1 = await saveTaskType(A.ctx, null, { name: "Petição simples", points: 3 }).then(async () => (await listTaskTypes(A.ctx)).find((x) => x.name === "Petição simples")!);
    const mk = async (assigneeId: string, done: boolean) => {
      const t = await createTask(lawyer.ctx, task({ title: `Pontuada ${assigneeId.slice(0, 4)}`, assigneeId }));
      await setTaskClassification(lawyer.ctx, t.id, { typeId: t1.id, labelIds: [] });
      if (done) await changeTaskStatus(lawyer.ctx, t.id, "DONE");
    };
    await mk(lawyer2.user.id, true);
    await mk(lawyer2.user.id, true);
    await mk(lawyer.user.id, true);
    await mk(lawyer.user.id, false); // aberta não conta
    const from = new Date(Date.now() - 3600_000);
    const to = new Date(Date.now() + 3600_000);
    const rep = await pointsReport(lawyer.ctx, from, to);
    const mine2 = rep.find((r) => r.userId === lawyer2.user.id)!;
    expect(mine2.points).toBe(6);
    expect(mine2.tasks).toBe(2);
    expect(rep.find((r) => r.userId === lawyer.user.id)!.points).toBe(3);
    expect(rep[0]!.points).toBeGreaterThanOrEqual(rep[rep.length - 1]!.points);
    expect((await pointsReport(B.ctx, from, to)).length).toBe(0);
  });
});
