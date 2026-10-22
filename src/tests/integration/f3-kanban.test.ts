import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { createCase } from "@/server/services/case.service";
import { addColumn, archiveBoard, createBoard, createCard, deleteCard, deleteColumn, getBoard, listBoards, listCardEvents, moveCard, renameBoard, shiftColumn, updateCard } from "@/server/services/kanban.service";
import { deletePackage, ensureSeedPackages, listPackages, listRunsForCase, runPackage, savePackage } from "@/server/services/workflow-package.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const base = { number: "", legacyNumber: "", title: "Caso", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };

describe("2.0-F3 — Kanban e pacotes de tarefas", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let client: Awaited<ReturnType<typeof addMember>>;
  let boardId: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("f3-a");
    B = await makeOrgWithOwner("f3-b");
    lawyer = await addMember(A.org.id, "LAWYER", "f3-adv");
    client = await addMember(A.org.id, "CLIENT", "f3-cli");
    boardId = await createBoard(A.ctx, "Contratos e novos casos");
  });

  it("quadro nasce com 3 colunas; só quem administra cria; nome único; isolado por escritório", async () => {
    const g = await getBoard(A.ctx, boardId);
    expect(g.columns.map((c) => c.name)).toEqual(["A fazer", "Em andamento", "Concluído"]);
    expect(g.columns.find((c) => c.isDone)?.name).toBe("Concluído");
    await expect(createBoard(lawyer.ctx, "Outro")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createBoard(A.ctx, "contratos e novos CASOS")).rejects.toBeInstanceOf(ValidationError);
    await expect(getBoard(B.ctx, boardId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listBoards(B.ctx)).length).toBe(0);
    await expect(getBoard(client.ctx, boardId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cartão: cria, move (fecha na coluna de concluído), registra histórico e valida vínculos", async () => {
    const g = await getBoard(A.ctx, boardId);
    const [todo, doing, done] = g.columns as [typeof g.columns[number], typeof g.columns[number], typeof g.columns[number]];
    const c = await createCard(lawyer.ctx, boardId, { title: "Montar contrato do Fulano", assigneeId: lawyer.ctx.userId, dueDate: "2026-11-10" });
    expect(c.columnId).toBe(todo.id);
    await expect(createCard(lawyer.ctx, boardId, { title: "x" })).rejects.toThrow();
    await expect(createCard(lawyer.ctx, boardId, { title: "Responsável de fora", assigneeId: B.ctx.userId })).rejects.toBeInstanceOf(ValidationError);
    await expect(createCard(client.ctx, boardId, { title: "Cliente não pode" })).rejects.toBeInstanceOf(ForbiddenError);
    await moveCard(lawyer.ctx, c.id, doing.id);
    expect((await getBoard(A.ctx, boardId)).cards.find((x) => x.id === c.id)?.closedAt).toBeNull();
    await moveCard(lawyer.ctx, c.id, done.id);
    expect((await getBoard(A.ctx, boardId)).cards.find((x) => x.id === c.id)).toBeUndefined(); // encerrados saem por padrão
    const withClosed = await getBoard(A.ctx, boardId, { includeClosed: true });
    expect(withClosed.cards.find((x) => x.id === c.id)?.closedAt).not.toBeNull();
    await moveCard(lawyer.ctx, c.id, todo.id); // reabrir
    expect((await getBoard(A.ctx, boardId)).cards.find((x) => x.id === c.id)?.closedAt).toBeNull();
    await updateCard(lawyer.ctx, c.id, { title: "Montar contrato do Fulano (v2)", dueDate: "2026-11-12" });
    const ev = await listCardEvents(A.ctx, c.id);
    expect(ev.map((e) => e.kind)).toContain("created");
    expect(ev.filter((e) => e.kind === "moved")).toHaveLength(3);
    expect(ev.some((e) => e.kind === "updated" && e.text.includes("prazo"))).toBe(true);
    // coluna de outro quadro é recusada
    const other = await createBoard(A.ctx, "Outro quadro");
    const oc = (await getBoard(A.ctx, other)).columns[0]!;
    await expect(moveCard(lawyer.ctx, c.id, oc.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("filtros por mês e responsável", async () => {
    const id = await createBoard(A.ctx, "Filtros");
    await createCard(A.ctx, id, { title: "Prazo em novembro", dueDate: "2026-11-05", assigneeId: A.ctx.userId });
    await createCard(A.ctx, id, { title: "Prazo em dezembro", dueDate: "2026-12-05", assigneeId: lawyer.ctx.userId });
    await createCard(A.ctx, id, { title: "Sem prazo nenhum" });
    expect((await getBoard(A.ctx, id)).cards).toHaveLength(3);
    expect((await getBoard(A.ctx, id, { month: "2026-11" })).cards.map((c) => c.title)).toEqual(["Prazo em novembro"]);
    expect((await getBoard(A.ctx, id, { assigneeId: lawyer.ctx.userId })).cards.map((c) => c.title)).toEqual(["Prazo em dezembro"]);
    expect((await getBoard(A.ctx, id, { q: "sem prazo" })).cards).toHaveLength(1);
    await expect(getBoard(A.ctx, id, { month: "novembro" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("cartão de processo sigiloso some para quem não vê o processo", async () => {
    const c = await createCase(A.ctx, { ...base, title: "Sigiloso F3", confidential: true });
    const id = await createBoard(A.ctx, "Sigilo");
    const card = await createCard(A.ctx, id, { title: "Cartão do sigiloso", caseId: c.id });
    await createCard(A.ctx, id, { title: "Cartão livre" });
    expect((await getBoard(A.ctx, id)).cards).toHaveLength(2);
    expect((await getBoard(lawyer.ctx, id)).cards.map((x) => x.title)).toEqual(["Cartão livre"]);
    await expect(moveCard(lawyer.ctx, card.id, (await getBoard(A.ctx, id)).columns[1]!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createCard(lawyer.ctx, id, { title: "Vínculo proibido", caseId: c.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("colunas: limite, ordem, e só exclui vazia e não a última", async () => {
    const id = await createBoard(A.ctx, "Colunas");
    await addColumn(A.ctx, id, "Revisão");
    let g = await getBoard(A.ctx, id);
    expect(g.columns.map((c) => c.name)).toEqual(["A fazer", "Em andamento", "Concluído", "Revisão"]);
    await shiftColumn(A.ctx, g.columns[3]!.id, -1);
    g = await getBoard(A.ctx, id);
    expect(g.columns.map((c) => c.name)).toEqual(["A fazer", "Em andamento", "Revisão", "Concluído"]);
    const card = await createCard(A.ctx, id, { title: "Ocupa a primeira", columnId: g.columns[0]!.id });
    await expect(deleteColumn(A.ctx, g.columns[0]!.id)).rejects.toBeInstanceOf(ConflictError);
    await deleteCard(A.ctx, card.id);
    await deleteColumn(A.ctx, g.columns[2]!.id); // "Revisão", vazia
    await expect(addColumn(lawyer.ctx, id, "Proibida")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("renomear e arquivar quadro", async () => {
    const id = await createBoard(A.ctx, "Para arquivar");
    await renameBoard(A.ctx, id, "Arquivável");
    await archiveBoard(A.ctx, id);
    await expect(getBoard(A.ctx, id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listBoards(A.ctx)).some((b) => b.id === id)).toBe(false);
    await createBoard(A.ctx, "Arquivável"); // nome liberado depois de arquivar
  });

  it("pacotes: 3 modelos iniciais, sem duplicar, isolados por escritório", async () => {
    await ensureSeedPackages(A.org.id);
    await ensureSeedPackages(A.org.id);
    const list = await listPackages(A.ctx);
    expect(list.map((p) => p.name)).toEqual(["Contrato novo", "Encerramento com acordo", "Encerramento por condenação"]);
    expect(list[0]!.steps.length).toBe(6);
    expect((await listPackages(B.ctx)).length).toBe(3);
    expect(await db.workflowPackage.count({ where: { organizationId: A.org.id } })).toBe(3);
  });

  it("executar pacote cria as tarefas com prazos, exige respostas, evita repetir e cria cartão", async () => {
    const c = await createCase(A.ctx, { ...base, title: "Caso do pacote" });
    const acordo = (await listPackages(A.ctx)).find((p) => p.name === "Encerramento com acordo")!;
    const asks = acordo.steps.filter((s) => s.ask);
    await expect(runPackage(lawyer.ctx, acordo.id, { caseId: c.id, baseDate: "2026-11-02" })).rejects.toBeInstanceOf(ValidationError);
    await expect(runPackage(lawyer.ctx, acordo.id, { baseDate: "2026-11-02" })).rejects.toBeInstanceOf(ValidationError);
    const answers = Object.fromEntries(asks.map((s) => [s.id, "R$ 10.000,00"]));
    const bid = await createBoard(A.ctx, "Encerramentos");
    const r = await runPackage(lawyer.ctx, acordo.id, { caseId: c.id, baseDate: "2026-11-02", answers, boardId: bid });
    expect(r.created).toBe(acordo.steps.length);
    expect(r.failed).toEqual([]);
    const tasks = await db.task.findMany({ where: { caseId: c.id }, orderBy: { dueDate: "asc" } });
    expect(tasks).toHaveLength(acordo.steps.length);
    expect(tasks[0]!.dueDate?.toISOString().slice(0, 10)).toBe("2026-11-03"); // base + 1
    expect(tasks.some((t) => t.description?.includes("R$ 10.000,00"))).toBe(true);
    expect((await getBoard(A.ctx, bid)).cards[0]?.title).toBe("Encerramento com acordo — Caso do pacote");
    await expect(runPackage(lawyer.ctx, acordo.id, { caseId: c.id, baseDate: "2026-11-02", answers })).rejects.toBeInstanceOf(ConflictError);
    const again = await runPackage(lawyer.ctx, acordo.id, { caseId: c.id, baseDate: "2026-11-02", answers, force: true });
    expect(again.created).toBe(acordo.steps.length);
    expect((await listRunsForCase(A.ctx, c.id)).length).toBe(2);
    await expect(runPackage(client.ctx, acordo.id, { caseId: c.id, baseDate: "2026-11-02", answers, force: true })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("editar, desativar e excluir pacote", async () => {
    const id = await savePackage(A.ctx, null, { name: "Meu pacote", steps: [{ title: "Primeira tarefa", dueDays: 0 }, { title: "Segunda tarefa", dueDays: 5, priority: "HIGH", assigneeId: lawyer.ctx.userId }] });
    await expect(savePackage(lawyer.ctx, null, { name: "Proibido", steps: [{ title: "Tarefa qualquer", dueDays: 1 }] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(savePackage(A.ctx, null, { name: "Vazio", steps: [] })).rejects.toThrow();
    await expect(savePackage(A.ctx, null, { name: "Prazo absurdo", steps: [{ title: "Tarefa qualquer", dueDays: 9999 }] })).rejects.toThrow();
    await savePackage(A.ctx, id, { name: "Meu pacote 2", active: true, steps: [{ title: "Só uma tarefa agora", dueDays: 2 }] });
    const p = (await listPackages(A.ctx)).find((x) => x.id === id)!;
    expect(p.name).toBe("Meu pacote 2");
    expect(p.steps).toHaveLength(1);
    await savePackage(A.ctx, id, { name: "Meu pacote 2", active: false, steps: [{ title: "Só uma tarefa agora", dueDays: 2 }] });
    const c = await createCase(A.ctx, { ...base, title: "Caso inativo" });
    await expect(runPackage(A.ctx, id, { caseId: c.id, baseDate: "2026-11-02" })).rejects.toBeInstanceOf(ConflictError);
    await deletePackage(A.ctx, id);
    expect((await listPackages(A.ctx)).some((x) => x.id === id)).toBe(false);
    await expect(runPackage(A.ctx, id, { caseId: c.id, baseDate: "2026-11-02" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
