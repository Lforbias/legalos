import { beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { formatMinutes, parseDuration } from "@/modules/timesheet/schemas";
import { createCase } from "@/server/services/case.service";
import { createTask } from "@/server/services/task.service";
import { deleteTime, listMyTime, logTime, teamWorkload } from "@/server/services/team.service";
import { addMember, makeOrgWithOwner } from "./helpers";

describe("duração", () => {
  it("interpreta formatos comuns e rejeita inválidos", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("1,5")).toBe(90);
    expect(parseDuration("45min")).toBe(45);
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("25")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(formatMinutes(90)).toBe("1h30");
  });
});

describe("equipe e produtividade", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let lawyer2: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  const caseInput = { number: "", legacyNumber: "", title: "Caso", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };

  beforeAll(async () => {
    A = await makeOrgWithOwner("team-A");
    B = await makeOrgWithOwner("team-B");
    lawyer = await addMember(A.org.id, "LAWYER", "tm-l1");
    lawyer2 = await addMember(A.org.id, "LAWYER", "tm-l2");
    finance = await addMember(A.org.id, "FINANCE", "tm-fin");
  });

  it("registra e exclui horas próprias; outro usuário não consegue excluir", async () => {
    const e = await logTime(lawyer.ctx, { date: "2030-02-01", duration: "1:30", description: "Estudo do caso", caseId: "" });
    expect(e.minutes).toBe(90);
    await expect(deleteTime(lawyer2.ctx, e.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTime(B.ctx, e.id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteTime(lawyer.ctx, e.id);
    await expect(deleteTime(lawyer.ctx, e.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recusa duração inválida, processo de outro escritório e perfil sem permissão", async () => {
    await expect(logTime(lawyer.ctx, { date: "2030-02-01", duration: "30h", description: "Atividade", caseId: "" })).rejects.toThrow();
    const cB = await createCase(B.ctx, caseInput);
    await expect(logTime(lawyer.ctx, { date: "2030-02-01", duration: "1", description: "Atividade", caseId: cB.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(logTime(finance.ctx, { date: "2030-02-01", duration: "1", description: "Atividade", caseId: "" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lista só as horas do próprio usuário", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await logTime(lawyer2.ctx, { date: today, duration: "2", description: "Audiência de teste", caseId: "" });
    expect((await listMyTime(lawyer.ctx)).every((e) => e.userId === lawyer.user.id)).toBe(true);
    expect((await listMyTime(lawyer2.ctx)).length).toBeGreaterThanOrEqual(1);
  });

  it("carga de trabalho: só com permissão, por escritório, com contagens reais e sigilo", async () => {
    await expect(teamWorkload(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await createTask(lawyer.ctx, { title: "Tarefa de carga", description: "", status: "TODO", priority: "NORMAL", dueDate: "2020-01-01", assigneeId: lawyer.user.id, caseId: "", clientId: "" });
    const secret = await createCase(lawyer.ctx, { ...caseInput, title: "Sigiloso", confidential: true });
    await createTask(lawyer.ctx, { title: "Tarefa sigilosa", description: "", status: "TODO", priority: "NORMAL", dueDate: "", assigneeId: lawyer.user.id, caseId: secret.id, clientId: "" });
    const w = await teamWorkload(A.ctx);
    const row = w.members.find((m) => m.userId === lawyer.user.id)!;
    expect(row.openTasks).toBe(2); // o titular administra o escritório e vê a tarefa do processo sigiloso
    expect(row.overdueTasks).toBe(1);
    expect(w.members.some((m) => m.userId === B.owner.id)).toBe(false);
    const wB = await teamWorkload(B.ctx);
    expect(wB.members.every((m) => m.userId !== lawyer.user.id)).toBe(true);
  });
});
