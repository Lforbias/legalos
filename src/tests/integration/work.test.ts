import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { addDays, todayYmd } from "@/lib/dates/ymd";
import type { CreateCaseInput } from "@/modules/cases/schemas";
import type { DeadlineInput } from "@/modules/deadlines/schemas";
import type { EventInput } from "@/modules/agenda/schemas";
import type { TaskInput } from "@/modules/tasks/schemas";
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from "@/server/services/agenda.service";
import { createCase } from "@/server/services/case.service";
import {
  calculateAuxiliary, cancelDeadline, createDeadline, fulfillDeadline, getDeadline, listDeadlines, updateDeadline, validateDeadline,
} from "@/server/services/deadline.service";
import { listNotifications, markAllRead, markRead, syncDueNotifications, unreadCount } from "@/server/services/notification.service";
import { addTaskComment, changeTaskStatus, createTask, deleteTask, getTask, listTasks, updateTask } from "@/server/services/task.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const caseBase: CreateCaseInput = {
  number: "", legacyNumber: "", title: "Caso", area: "Cível", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "",
  status: "ACTIVE", phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF",
};
const task = (o: Partial<TaskInput> = {}): TaskInput => ({ title: "Protocolar petição", description: "", status: "TODO", priority: "NORMAL", dueDate: "", assigneeId: "", caseId: "", clientId: "", ...o });
const dl = (caseId: string, o: Partial<DeadlineInput> = {}): DeadlineInput => ({
  caseId, title: "Contestação", kind: "Contestação", startDate: "", days: "", countType: "", dueDate: "2030-03-15", internalDueDate: "", responsibleId: "", notes: "", calculationNote: "", ...o,
});
const ev = (o: Partial<EventInput> = {}): EventInput => ({ title: "Audiência de instrução", kind: "HEARING", date: "2030-05-10", allDay: false, startTime: "14:30", endTime: "16:00", location: "", description: "", caseId: "", clientId: "", ...o });

describe("tarefas, prazos, agenda e notificações (Fase 3)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let lawyer2: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  let caseA: { id: string };
  let secret: { id: string };

  beforeAll(async () => {
    A = await makeOrgWithOwner("fase3-A");
    B = await makeOrgWithOwner("fase3-B");
    lawyer = await addMember(A.org.id, "LAWYER", "f3-lawyer");
    lawyer2 = await addMember(A.org.id, "LAWYER", "f3-lawyer2");
    assistant = await addMember(A.org.id, "ASSISTANT", "f3-assist");
    finance = await addMember(A.org.id, "FINANCE", "f3-fin");
    caseA = await createCase(A.ctx, { ...caseBase, title: "Processo A" });
    secret = await createCase(lawyer.ctx, { ...caseBase, title: "Sigiloso", confidential: true });
  });

  describe("tarefas", () => {
    it("cria, edita, conclui (completedAt), comenta e exclui logicamente", async () => {
      const t = await createTask(lawyer.ctx, task({ caseId: caseA.id, assigneeId: lawyer2.user.id, dueDate: "2030-01-10" }));
      expect(t.dueDate?.toISOString().slice(0, 10)).toBe("2030-01-10");
      await updateTask(lawyer.ctx, t.id, task({ title: "Protocolar recurso", caseId: caseA.id, assigneeId: lawyer2.user.id, priority: "HIGH" }));
      await changeTaskStatus(lawyer2.ctx, t.id, "DONE");
      const done = await getTask(lawyer.ctx, t.id);
      expect(done.status).toBe("DONE");
      expect(done.completedAt).not.toBeNull();
      expect(done.title).toBe("Protocolar recurso");
      await changeTaskStatus(lawyer.ctx, t.id, "TODO");
      expect((await getTask(lawyer.ctx, t.id)).completedAt).toBeNull();
      await addTaskComment(lawyer.ctx, t.id, { body: "Ver minuta anexa." });
      expect((await getTask(lawyer.ctx, t.id)).comments).toHaveLength(1);
      await deleteTask(lawyer.ctx, t.id);
      await expect(getTask(lawyer.ctx, t.id)).rejects.toBeInstanceOf(NotFoundError);
      expect(await db.auditLog.count({ where: { organizationId: A.org.id, resourceId: t.id } })).toBeGreaterThanOrEqual(4);
    });

    it("notifica o responsável na atribuição (sem notificar a si mesmo) e nos comentários", async () => {
      const before = await unreadCount(lawyer2.ctx);
      const t = await createTask(lawyer.ctx, task({ title: "Tarefa atribuída", assigneeId: lawyer2.user.id }));
      expect(await unreadCount(lawyer2.ctx)).toBe(before + 1);
      const selfBefore = await unreadCount(lawyer.ctx);
      await createTask(lawyer.ctx, task({ title: "Para mim", assigneeId: lawyer.user.id }));
      expect(await unreadCount(lawyer.ctx)).toBe(selfBefore);
      await addTaskComment(lawyer.ctx, t.id, { body: "Atenção ao prazo" });
      expect(await unreadCount(lawyer2.ctx)).toBe(before + 2);
    });

    it("recusa responsável de outro escritório, processo/cliente inexistentes e título curto", async () => {
      await expect(createTask(A.ctx, task({ assigneeId: B.owner.id }))).rejects.toBeInstanceOf(ValidationError);
      await expect(createTask(A.ctx, task({ caseId: (await createCase(B.ctx, caseBase)).id }))).rejects.toBeInstanceOf(NotFoundError);
      await expect(createTask(A.ctx, task({ title: "x" }))).rejects.toThrow();
    });

    it("isola entre escritórios e respeita o sigilo do processo", async () => {
      const tB = await createTask(B.ctx, task({ title: "Tarefa do escritório B" }));
      await expect(getTask(A.ctx, tB.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(changeTaskStatus(A.ctx, tB.id, "DONE")).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteTask(A.ctx, tB.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listTasks(A.ctx, { includeClosed: true })).items.map((i) => i.id)).not.toContain(tB.id);

      const tSecret = await createTask(lawyer.ctx, task({ title: "Tarefa em processo sigiloso", caseId: secret.id }));
      await expect(getTask(lawyer2.ctx, tSecret.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listTasks(lawyer2.ctx)).items.map((i) => i.id)).not.toContain(tSecret.id);
      await expect(createTask(lawyer2.ctx, task({ caseId: secret.id }))).rejects.toBeInstanceOf(NotFoundError);
      expect((await listTasks(lawyer.ctx)).items.map((i) => i.id)).toContain(tSecret.id);
      expect((await listTasks(A.ctx)).items.map((i) => i.id)).toContain(tSecret.id); // dono administra o escritório
    });

    it("exige permissão: perfil Financeiro não vê nem cria tarefas", async () => {
      await expect(listTasks(finance.ctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createTask(finance.ctx, task())).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("filtra atrasadas e por responsável", async () => {
      const yesterday = addDays(todayYmd("America/Sao_Paulo"), -2);
      const late = await createTask(lawyer.ctx, task({ title: "Atrasada de teste", dueDate: yesterday, assigneeId: assistant.user.id }));
      const r = await listTasks(lawyer.ctx, { overdue: true, assigneeId: assistant.user.id });
      expect(r.items.map((i) => i.id)).toContain(late.id);
      expect((await listTasks(lawyer.ctx, { assigneeId: lawyer2.user.id, overdue: true })).items.map((i) => i.id)).not.toContain(late.id);
    });
  });

  describe("prazos", () => {
    it("nasce como rascunho, só vale após validação humana por quem tem permissão", async () => {
      const d = await createDeadline(lawyer.ctx, dl(caseA.id, { responsibleId: lawyer2.user.id }));
      expect(d.status).toBe("DRAFT");
      expect(d.validatedAt).toBeNull();
      await expect(validateDeadline(assistant.ctx, d.id)).rejects.toBeInstanceOf(ForbiddenError); // assistente não tem deadlines:validate
      await validateDeadline(lawyer.ctx, d.id);
      const v = await getDeadline(lawyer.ctx, d.id);
      expect(v.status).toBe("VALIDATED");
      expect(v.validatedById).toBe(lawyer.user.id);
      expect(v.validatedAt).not.toBeNull();
      await expect(validateDeadline(lawyer.ctx, d.id)).rejects.toBeInstanceOf(ConflictError);
      await fulfillDeadline(lawyer.ctx, d.id);
      expect((await getDeadline(lawyer.ctx, d.id)).status).toBe("FULFILLED");
      await expect(cancelDeadline(lawyer.ctx, d.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(updateDeadline(lawyer.ctx, d.id, dl(caseA.id))).rejects.toBeInstanceOf(ConflictError);
    });

    it("assistente pode ver, mas não cadastrar prazos", async () => {
      await expect(createDeadline(assistant.ctx, dl(caseA.id))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listDeadlines(assistant.ctx)).resolves.toBeTruthy();
    });

    it("cumprir exige prazo validado", async () => {
      const d = await createDeadline(lawyer.ctx, dl(caseA.id, { title: "Ainda rascunho" }));
      await expect(fulfillDeadline(lawyer.ctx, d.id)).rejects.toBeInstanceOf(ConflictError);
      await cancelDeadline(lawyer.ctx, d.id);
      expect((await getDeadline(lawyer.ctx, d.id)).status).toBe("CANCELED");
    });

    it("alterar a data de um prazo validado desfaz a validação", async () => {
      const d = await createDeadline(lawyer.ctx, dl(caseA.id, { title: "Revalidar" }));
      await validateDeadline(lawyer.ctx, d.id);
      const same = await updateDeadline(lawyer.ctx, d.id, dl(caseA.id, { title: "Revalidar (título novo)" }));
      expect(same.revalidate).toBe(false);
      expect((await getDeadline(lawyer.ctx, d.id)).status).toBe("VALIDATED");
      const changed = await updateDeadline(lawyer.ctx, d.id, dl(caseA.id, { title: "Revalidar", dueDate: "2030-03-20" }));
      expect(changed.revalidate).toBe(true);
      const after = await getDeadline(lawyer.ctx, d.id);
      expect(after.status).toBe("DRAFT");
      expect(after.validatedAt).toBeNull();
      expect(after.validatedById).toBeNull();
    });

    it("valida entradas no servidor: prazo interno posterior à data fatal e dias sem contagem", async () => {
      await expect(createDeadline(lawyer.ctx, dl(caseA.id, { internalDueDate: "2030-04-01" }))).rejects.toThrow();
      await expect(createDeadline(lawyer.ctx, dl(caseA.id, { days: "15" }))).rejects.toThrow();
    });

    it("isola entre escritórios e respeita sigilo do processo", async () => {
      const caseB = await createCase(B.ctx, caseBase);
      await expect(createDeadline(A.ctx, dl(caseB.id))).rejects.toBeInstanceOf(NotFoundError);
      const dB = await createDeadline(B.ctx, dl(caseB.id));
      await expect(getDeadline(A.ctx, dB.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(validateDeadline(A.ctx, dB.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listDeadlines(A.ctx, { includeClosed: true })).items.map((i) => i.id)).not.toContain(dB.id);

      const dSecret = await createDeadline(lawyer.ctx, dl(secret.id, { title: "Prazo sigiloso" }));
      await expect(getDeadline(lawyer2.ctx, dSecret.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listDeadlines(lawyer2.ctx)).items.map((i) => i.id)).not.toContain(dSecret.id);
      await expect(createDeadline(lawyer2.ctx, dl(secret.id))).rejects.toBeInstanceOf(NotFoundError);
    });

    it("registra evento na linha do tempo do processo e auditoria", async () => {
      const d = await createDeadline(lawyer.ctx, dl(caseA.id, { title: "Prazo com histórico" }));
      await validateDeadline(lawyer.ctx, d.id);
      const kinds = (await db.caseEvent.findMany({ where: { caseId: caseA.id } })).map((e) => e.kind);
      expect(kinds).toContain("DEADLINE_CREATED");
      expect(kinds).toContain("DEADLINE_VALIDATE");
      expect(await db.auditLog.count({ where: { action: "deadline.validate", resourceId: d.id } })).toBe(1);
    });

    it("calculadora auxiliar (dias úteis) retorna sugestão com memória do cálculo", () => {
      // publicação em 06/05/2030 (segunda) + 5 dias úteis → 07, 08, 09, 10 e 13/05
      const r = calculateAuxiliary(lawyer.ctx, { startDate: "2030-05-06", days: "5", countType: "BUSINESS" });
      expect(r.dueDate).toBe("2030-05-13");
      expect(r.note.length).toBeGreaterThan(10);
      // o recesso forense (20/12 a 20/01) suspende a contagem: 5 dias úteis a partir de 02/01 terminam após 20/01
      expect(calculateAuxiliary(lawyer.ctx, { startDate: "2030-01-02", days: "5", countType: "BUSINESS" }).dueDate > "2030-01-20").toBe(true);
      expect(() => calculateAuxiliary(lawyer.ctx, { startDate: "2030-13-02", days: "5", countType: "BUSINESS" })).toThrow();
    });

    it("validação concorrente: apenas uma das chamadas tem sucesso", async () => {
      const d = await createDeadline(lawyer.ctx, dl(caseA.id, { title: "Concorrência" }));
      const results = await Promise.allSettled([validateDeadline(lawyer.ctx, d.id), validateDeadline(A.ctx, d.id)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });
  });

  describe("agenda", () => {
    it("converte horário local do escritório para UTC e de volta", async () => {
      const e = await createEvent(lawyer.ctx, ev({ title: "Audiência local" }));
      expect(e.startsAt.toISOString()).toBe("2030-05-10T17:30:00.000Z"); // São Paulo = UTC-3
      const g = await getEvent(lawyer.ctx, e.id);
      expect(g.date).toBe("2030-05-10");
      expect(g.startTime).toBe("14:30");
      expect(g.endTime).toBe("16:00");
    });

    it("lista por período no fuso do escritório (fim do dia local incluso)", async () => {
      const late = await createEvent(lawyer.ctx, ev({ title: "Quase meia-noite", date: "2030-06-01", startTime: "23:30", endTime: "" }));
      const day = await listEvents(lawyer.ctx, "2030-06-01", "2030-06-01");
      expect(day.map((x) => x.id)).toContain(late.id);
      const next = await listEvents(lawyer.ctx, "2030-06-02", "2030-06-02");
      expect(next.map((x) => x.id)).not.toContain(late.id);
    });

    it("evento de dia inteiro, edição e exclusão lógica", async () => {
      const e = await createEvent(lawyer.ctx, ev({ title: "Dia inteiro", date: "2030-07-01", allDay: true, startTime: "", endTime: "" }));
      await updateEvent(lawyer.ctx, e.id, ev({ title: "Dia inteiro (editado)", date: "2030-07-02", allDay: true, startTime: "", endTime: "" }));
      expect((await getEvent(lawyer.ctx, e.id)).date).toBe("2030-07-02");
      await deleteEvent(lawyer.ctx, e.id);
      await expect(getEvent(lawyer.ctx, e.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejeita horário final anterior ao inicial e exige hora quando não é dia inteiro", async () => {
      await expect(createEvent(lawyer.ctx, ev({ startTime: "15:00", endTime: "14:00" }))).rejects.toThrow();
      await expect(createEvent(lawyer.ctx, ev({ startTime: "" }))).rejects.toThrow();
    });

    it("isola entre escritórios, respeita sigilo e exige permissão de escrita", async () => {
      const eB = await createEvent(B.ctx, ev({ title: "Evento B" }));
      await expect(getEvent(A.ctx, eB.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteEvent(A.ctx, eB.id)).rejects.toBeInstanceOf(NotFoundError);
      const eSecret = await createEvent(lawyer.ctx, ev({ title: "Evento sigiloso", caseId: secret.id }));
      await expect(getEvent(lawyer2.ctx, eSecret.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listEvents(lawyer2.ctx, "2030-05-01", "2030-05-31")).map((x) => x.id)).not.toContain(eSecret.id);
      await expect(createEvent(finance.ctx, ev())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listEvents(finance.ctx, "2030-05-01", "2030-05-31")).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("notificações", () => {
    it("gera avisos de prazos e tarefas vencendo, sem duplicar, e só para o responsável", async () => {
      const C = await makeOrgWithOwner("fase3-C");
      const today = todayYmd("America/Sao_Paulo");
      const cs = await createCase(C.ctx, caseBase);
      const d = await createDeadline(C.ctx, dl(cs.id, { title: "Vence hoje", dueDate: today, responsibleId: C.owner.id }));
      await createDeadline(C.ctx, dl(cs.id, { title: "Longe", dueDate: addDays(today, 30), responsibleId: C.owner.id }));
      await createTask(C.ctx, task({ title: "Atrasada", dueDate: addDays(today, -1), assigneeId: C.owner.id }));
      const n1 = await syncDueNotifications(C.ctx, new Date(), true);
      expect(n1).toBe(2);
      expect(await syncDueNotifications(C.ctx, new Date(), true)).toBe(0); // idempotente
      const list = await listNotifications(C.ctx);
      expect(list.some((n) => n.link === `/prazos/${d.id}` && n.kind === "deadline.today")).toBe(true);
      expect(list.every((n) => !n.link || n.link.startsWith("/"))).toBe(true);
    });

    it("marcar como lida respeita o dono; notificação de outro usuário é 'não encontrada'", async () => {
      const t = await createTask(lawyer.ctx, task({ title: "Para notificar", assigneeId: assistant.user.id }));
      const mine = (await listNotifications(assistant.ctx)).find((n) => n.link === `/tarefas/${t.id}`)!;
      await expect(markRead(lawyer2.ctx, mine.id)).rejects.toBeInstanceOf(NotFoundError);
      await markRead(assistant.ctx, mine.id);
      expect((await listNotifications(assistant.ctx)).find((n) => n.id === mine.id)?.readAt).not.toBeNull();
      await markAllRead(assistant.ctx);
      expect(await unreadCount(assistant.ctx)).toBe(0);
    });
  });
});
