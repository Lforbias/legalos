import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { alertCounts, alertItems, availableAlertTabs, getIndicators } from "@/server/services/insights.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const DAY = 86_400_000;

describe("2.0-F2 — indicadores e central de alertas", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let fin: Awaited<ReturnType<typeof addMember>>;
  let asst: Awaited<ReturnType<typeof addMember>>;
  let publicCase: string;
  let secretCase: string;
  let stale: string;
  let clientId: string;
  const today = todayYmd("America/Sao_Paulo");
  const d = (n: number) => ymdToDate(addDays(today, n));

  beforeAll(async () => {
    A = await makeOrgWithOwner("ins-a");
    B = await makeOrgWithOwner("ins-b");
    fin = await addMember(A.org.id, "FINANCE", "ins-fin");
    asst = await addMember(A.org.id, "ASSISTANT", "ins-asst");
    const org = A.org.id;
    clientId = (await db.client.create({ data: { organizationId: org, type: "PERSON", name: "Cliente Indicador" } })).id;
    publicCase = (await db.case.create({ data: { organizationId: org, title: "Processo público", createdById: A.owner.id } })).id;
    secretCase = (await db.case.create({ data: { organizationId: org, title: "Processo sigiloso", confidential: true, createdById: A.owner.id } })).id;
    stale = (await db.case.create({ data: { organizationId: org, title: "Processo parado", createdById: A.owner.id, createdAt: new Date(Date.now() - 200 * DAY) } })).id;
    for (const c of [publicCase, secretCase, stale]) await db.caseParty.create({ data: { organizationId: org, caseId: c, clientId, role: "PLAINTIFF", name: "Cliente Indicador", isOurClient: true } });
    await db.caseEvent.create({ data: { organizationId: org, caseId: publicCase, source: "INTERNAL", kind: "NOTE", title: "Andamento recente", occurredAt: new Date(Date.now() - 3 * DAY) } });
    await db.caseEvent.create({ data: { organizationId: org, caseId: secretCase, source: "INTERNAL", kind: "NOTE", title: "Andamento sigiloso", occurredAt: new Date(Date.now() - 3 * DAY) } });
    await db.caseEvent.create({ data: { organizationId: org, caseId: stale, source: "INTERNAL", kind: "NOTE", title: "Andamento antigo", occurredAt: new Date(Date.now() - 150 * DAY) } });
    await db.task.create({ data: { organizationId: org, title: "Tarefa atrasada", dueDate: d(-3), assigneeId: A.owner.id } });
    await db.task.create({ data: { organizationId: org, title: "Tarefa de hoje", dueDate: d(0), assigneeId: A.owner.id } });
    await db.task.create({ data: { organizationId: org, title: "Tarefa futura", dueDate: d(10) } });
    await db.task.create({ data: { organizationId: org, title: "Tarefa feita", dueDate: d(-9), status: "DONE" } });
    await db.deadline.create({ data: { organizationId: org, caseId: publicCase, title: "Prazo vencido", dueDate: d(-2), responsibleId: A.owner.id, status: "VALIDATED", validatedById: A.owner.id, validatedAt: new Date() } });
    await db.deadline.create({ data: { organizationId: org, caseId: publicCase, title: "Prazo em 5 dias", dueDate: d(5), responsibleId: A.owner.id, status: "VALIDATED", validatedById: A.owner.id, validatedAt: new Date() } });
    await db.deadline.create({ data: { organizationId: org, caseId: secretCase, title: "Prazo do sigiloso", dueDate: d(-1), status: "VALIDATED", validatedById: A.owner.id, validatedAt: new Date() } });
    await db.financeEntry.create({ data: { organizationId: org, kind: "RECEIVABLE", description: "Honorário vencido", amount: "1000.00", paidAmount: "250.00", status: "PARTIAL", issueDate: d(-40), dueDate: d(-10) } });
    await db.financeEntry.create({ data: { organizationId: org, kind: "PAYABLE", description: "Conta vencida", amount: "300.00", issueDate: d(-40), dueDate: d(-5) } });
    await db.financeEntry.create({ data: { organizationId: org, kind: "RECEIVABLE", description: "Honorário pago", amount: "500.00", paidAmount: "500.00", status: "PAID", issueDate: d(-40), dueDate: d(-10) } });
    await db.courtNotice.create({ data: { organizationId: org, title: "Intimação velha", content: "x", receivedAt: d(-5), contentHash: "h-ins-1" } });
    await db.courtNotice.create({ data: { organizationId: org, title: "Intimação de hoje", content: "y", receivedAt: d(0), contentHash: "h-ins-2" } });
    await db.agendaEvent.create({ data: { organizationId: org, title: "Audiência amanhã", startsAt: new Date(Date.now() + DAY), kind: "HEARING" } });
    await db.agendaEvent.create({ data: { organizationId: org, title: "Audiência longe", startsAt: new Date(Date.now() + 20 * DAY), kind: "HEARING" } });
    await db.djenMonitor.create({ data: { organizationId: org, label: "OAB teste", oabNumber: "999", oabUf: "BA", lastStatus: "ERROR", lastMessage: "Falhou", lastSyncAt: new Date(), createdById: A.owner.id } });
    // outro escritório: nada disso pode aparecer
    await db.task.create({ data: { organizationId: B.org.id, title: "Tarefa do outro escritório", dueDate: d(-30) } });
    await db.case.create({ data: { organizationId: B.org.id, title: "Processo do outro", createdById: B.owner.id } });
  });
  afterAll(async () => {
    await db.djenMonitor.deleteMany({ where: { organizationId: A.org.id } });
  });

  it("indicadores do dono: atrasados por tipo, só dados reais e do próprio escritório", async () => {
    const i = await getIndicators(A.ctx);
    const row = (k: string) => i.overdue.find((o) => o.key === k)!;
    expect(row("tasks").count).toBe(1);
    expect(row("deadlines").count).toBe(2); // vencido + do sigiloso (o dono vê tudo)
    expect(row("receivable").count).toBe(1);
    expect(row("receivable").amount).toBeCloseTo(750);
    expect(row("payable").count).toBe(1);
    expect(row("payable").amount).toBeCloseTo(300);
    expect(row("notices").count).toBe(1); // só a recebida há mais de 2 dias
  });

  it("movimentação 7/30/60/90 e evolução da carteira", async () => {
    const i = await getIndicators(A.ctx);
    expect(i.movement!.total).toBe(3);
    const w = Object.fromEntries(i.movement!.windows.map((x) => [x.days, x.withMovement]));
    expect(w).toEqual({ 7: 2, 30: 2, 60: 2, 90: 2 });
    expect(i.movement!.windows.find((x) => x.days === 90)!.without).toBe(1);
    const ev = i.evolution!;
    expect(ev.months).toHaveLength(12);
    expect(ev.months.at(-1)!.cases).toBe(2); // criados agora
    expect(ev.months.at(-1)!.casesTotal).toBe(3);
    expect(ev.byStatus.find((s) => s.status === "ACTIVE")!.count).toBe(3);
  });

  it("processos por cliente e números pessoais", async () => {
    const i = await getIndicators(A.ctx);
    expect(i.perClient).toEqual([{ id: clientId, name: "Cliente Indicador", cases: 3 }]);
    expect(i.mine.tasksOpen).toBe(2);
    expect(i.mine.tasksOverdue).toBe(1);
    expect(i.mine.deadlinesOpen).toBe(2);
    expect(i.mine.deadlinesOverdue).toBe(1);
    expect(i.mine.deadlinesNext7).toBe(1);
  });

  it("processo sigiloso some para quem não participa; cada bloco respeita a permissão", async () => {
    const f = await getIndicators(fin.ctx); // FINANCE: processos, clientes e financeiro; sem tarefas/prazos/caixa
    expect(f.overdue.map((o) => o.key).sort()).toEqual(["payable", "receivable"]);
    expect(f.movement!.total).toBe(2); // sem o sigiloso
    expect(f.mine.tasksOpen).toBeNull();
    const a = await getIndicators(asst.ctx); // ASSISTANT: sem financeiro
    expect(a.overdue.map((o) => o.key).sort()).toEqual(["deadlines", "tasks"]);
    expect(a.overdue.find((o) => o.key === "deadlines")!.count).toBe(1);
  });

  it("central de alertas: abas por permissão, contadores e itens corretos", async () => {
    expect(availableAlertTabs(A.ctx).map((t) => t.key)).toEqual(["publicacoes", "andamentos", "processos", "tarefas", "prazos", "agenda", "financeiro", "integracao", "aniversarios"]);
    expect(availableAlertTabs(fin.ctx).map((t) => t.key)).toEqual(["andamentos", "processos", "financeiro", "aniversarios"]);
    const c = await alertCounts(A.ctx);
    expect(c).toMatchObject({ publicacoes: 2, andamentos: 2, processos: 1, tarefas: 2, prazos: 3, agenda: 1, financeiro: 2, integracao: 1 });
    const tk = await alertItems(A.ctx, "tarefas");
    expect(tk.map((t) => t.title)).toEqual(["Tarefa atrasada", "Tarefa de hoje"]);
    expect(tk[0]!.href).toMatch(/^\/tarefas\//);
    expect((await alertItems(A.ctx, "processos")).map((p) => p.title)).toEqual(["Processo parado"]);
    expect((await alertItems(A.ctx, "integracao"))[0]!.title).toContain("DJEN");
    expect((await alertItems(A.ctx, "financeiro")).every((f) => f.href.startsWith("/financeiro/lancamentos/"))).toBe(true);
  });

  it("alertas respeitam sigilo, permissão e isolamento entre escritórios", async () => {
    const and = await alertItems(fin.ctx, "andamentos");
    expect(and.map((x) => x.title)).toEqual(["Andamento recente"]);
    expect(await alertItems(fin.ctx, "tarefas")).toEqual([]); // sem permissão
    expect(await alertItems(asst.ctx, "financeiro")).toEqual([]);
    const cB = await alertCounts(B.ctx);
    expect(cB.tarefas).toBe(1);
    expect((await alertItems(B.ctx, "tarefas")).map((t) => t.title)).toEqual(["Tarefa do outro escritório"]);
    expect((await alertItems(B.ctx, "processos")).length).toBe(0);
  });
});
