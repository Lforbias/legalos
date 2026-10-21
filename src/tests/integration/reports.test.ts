import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { availableReports, casesReport, deadlinesReport, exportReport, financeReport, noticesReport, resolvePeriod, teamReport } from "@/server/services/report.service";
import { addMember, makeOrgWithOwner } from "./helpers";

describe("relatórios e BI", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  let today: string;
  const d = (n: number) => addDays(today, n);
  const at = (ymd: string) => ymdToDate(ymd);

  beforeAll(async () => {
    A = await makeOrgWithOwner("rel-A");
    B = await makeOrgWithOwner("rel-B");
    lawyer = await addMember(A.org.id, "LAWYER", "rel-law");
    finance = await addMember(A.org.id, "FINANCE", "rel-fin");
    assistant = await addMember(A.org.id, "ASSISTANT", "rel-ass");
    today = todayYmd(A.ctx.timezone);
    const org = A.org.id;
    const open = await db.case.create({ data: { organizationId: org, title: "Aberto", area: "Trabalhista", court: "TRT5" } });
    const secret = await db.case.create({ data: { organizationId: org, title: "Sigiloso", confidential: true, area: "Família", court: "TJBA" } });
    await db.case.create({ data: { organizationId: org, title: "Encerrado", status: "CLOSED", area: "Trabalhista" } });

    const mk = (caseId: string, title: string, due: string, status: "DRAFT" | "VALIDATED" | "FULFILLED" | "CANCELED", fulfilled?: string) =>
      db.deadline.create({ data: { organizationId: org, caseId, title, dueDate: at(due), status, responsibleId: A.ctx.userId, ...(status === "VALIDATED" || status === "FULFILLED" ? { validatedAt: new Date(), validatedById: A.ctx.userId } : {}), fulfilledAt: fulfilled ? new Date(`${fulfilled}T15:00:00Z`) : null } });
    await mk(open.id, "No prazo", d(-10), "FULFILLED", d(-12));
    await mk(open.id, "Atrasado cumprido", d(-8), "FULFILLED", d(-5));
    await mk(open.id, "Vencido aberto", d(-3), "VALIDATED");
    await mk(open.id, "Futuro", d(5), "DRAFT");
    await mk(open.id, "Cancelado", d(-2), "CANCELED");
    await mk(secret.id, "Do sigiloso", d(-4), "FULFILLED", d(-4));

    const notice = (title: string, recv: string, status: "NEW" | "PROCESSED", extra: Record<string, unknown> = {}) =>
      db.courtNotice.create({ data: { organizationId: org, title, content: `Conteúdo ${title} com texto suficiente`, contentHash: `h-${title}`, receivedAt: at(recv), status, kind: "INTIMACAO", ...extra } });
    const created = new Date(Date.now() - 48 * 3_600_000);
    await notice("Tratada 1", d(-6), "PROCESSED", { createdAt: created, processedAt: new Date(created.getTime() + 4 * 3_600_000) });
    await notice("Tratada 2", d(-5), "PROCESSED", { createdAt: created, processedAt: new Date(created.getTime() + 8 * 3_600_000) });
    await notice("Nova antiga", d(-10), "NEW");
    await notice("Nova recente", d(0), "NEW");
    await notice("Do sigiloso", d(-2), "NEW", { caseId: secret.id });

    await db.task.create({ data: { organizationId: org, title: "Feita", status: "DONE", completedAt: new Date(), assigneeId: lawyer.ctx.userId, createdById: A.ctx.userId } });
    await db.task.create({ data: { organizationId: org, title: "Atrasada", status: "TODO", dueDate: at(d(-2)), assigneeId: lawyer.ctx.userId, createdById: A.ctx.userId } });
    await db.timeEntry.create({ data: { organizationId: org, userId: lawyer.ctx.userId, entryDate: at(d(-1)), minutes: 90, description: "Estudo" } });

    const cat = await db.financeCategory.create({ data: { organizationId: org, name: "Honorários" } });
    const cli = await db.client.create({ data: { organizationId: org, type: "PERSON", name: "Cliente Pagador" } });
    const acc = await db.financeAccount.create({ data: { organizationId: org, name: "Caixa" } });
    const entry = (kind: "RECEIVABLE" | "PAYABLE", amount: string, paid: string, due: string, extra: Record<string, unknown> = {}) =>
      db.financeEntry.create({ data: { organizationId: org, kind, description: `Lanç ${amount}`, amount, paidAmount: paid, issueDate: at(d(-60)), dueDate: at(due), status: paid === "0" ? "OPEN" : paid === amount ? "PAID" : "PARTIAL", categoryId: cat.id, clientId: cli.id, accountId: acc.id, ...extra } });
    const e1 = await entry("RECEIVABLE", "1000.00", "600.00", d(-1));
    await db.financePayment.create({ data: { organizationId: org, entryId: e1.id, accountId: acc.id, amount: "600.00", paidOn: at(d(-1)) } });
    const e2 = await entry("PAYABLE", "200.00", "200.00", d(-1));
    await db.financePayment.create({ data: { organizationId: org, entryId: e2.id, accountId: acc.id, amount: "200.00", paidOn: at(d(-1)) } });
    const e3 = await entry("RECEIVABLE", "500.00", "0", d(-40));
    expect(e3.id).toBeTruthy();
    const eSecret = await entry("RECEIVABLE", "7777.00", "7777.00", d(-1), { caseId: secret.id });
    await db.financePayment.create({ data: { organizationId: org, entryId: eSecret.id, accountId: acc.id, amount: "7777.00", paidOn: at(d(-1)) } });
    const rev = await entry("RECEIVABLE", "300.00", "0", d(-1));
    await db.financePayment.create({ data: { organizationId: org, entryId: rev.id, accountId: acc.id, amount: "300.00", paidOn: at(d(-1)), reversedAt: new Date(), reversalReason: "Lançamento duplicado" } });

    await db.case.create({ data: { organizationId: B.org.id, title: "B" } });
  });

  const P = () => resolvePeriod(A.ctx, d(-30), d(30));

  it("período: validações, padrão de 90 dias e meses cobertos", () => {
    expect(() => resolvePeriod(A.ctx, "2026-02-01", "2026-01-01")).toThrow(ValidationError);
    expect(() => resolvePeriod(A.ctx, "nada", "2026-01-01")).toThrow(ValidationError);
    expect(() => resolvePeriod(A.ctx, "2025-01-01", "2026-12-31")).toThrow(/longo/);
    const p = resolvePeriod(A.ctx);
    expect(p.to).toBe(today);
    expect(p.from).toBe(addDays(today, -89));
    expect(p.months.length).toBeGreaterThanOrEqual(3);
    expect(p.toInstant.getTime()).toBeGreaterThan(p.fromInstant.getTime());
  });

  it("prazos: contagens e taxa de cumprimento conferem; cancelado fora da conta", async () => {
    const { data } = await deadlinesReport(A.ctx, P());
    expect(data.total).toBe(5); // 3 + futuro + sigiloso (dono vê); cancelado fora
    expect(data.onTime).toBe(2);
    expect(data.late).toBe(1);
    expect(data.openOverdue).toBe(1);
    expect(data.openOnSchedule).toBe(1);
    expect(data.draft).toBe(1);
    expect(data.canceled).toBe(1);
    expect(data.complianceRate).toBe(50);
    expect(data.byResponsible[0]!.total).toBe(5);
  });

  it("sigilo: advogado sem vínculo não vê prazo, intimação nem processo sigilosos", async () => {
    const dl = await deadlinesReport(lawyer.ctx, P());
    expect(dl.data.total).toBe(4);
    expect(dl.data.onTime).toBe(1);
    const nt = await noticesReport(lawyer.ctx, P());
    expect(nt.data.total).toBe(4);
    const cs = await casesReport(lawyer.ctx, P());
    expect(cs.data.visibleTotal).toBe(2);
    expect(cs.data.byArea.map((a) => a.label)).not.toContain("Família");
    expect(cs.table.rows.some((r) => String(r[1]) === "Sigiloso")).toBe(false);
  });

  it("intimações: tratadas, tempo médio/mediana, antigas sem distribuir", async () => {
    const { data } = await noticesReport(A.ctx, P());
    expect(data.total).toBe(5);
    expect(data.processed).toBe(2);
    expect(data.avgHoursToProcess).toBe(6);
    expect(data.medianHoursToProcess).toBe(6);
    expect(data.stale).toBe(1); // só "Nova antiga" (-10 dias, NEW)
  });

  it("processos: carteira por situação e área", async () => {
    const { data } = await casesReport(A.ctx, P());
    expect(data.visibleTotal).toBe(3);
    expect(data.byStatus.ACTIVE).toBe(2);
    expect(data.byStatus.CLOSED).toBe(1);
    expect(data.byArea.find((a) => a.label === "Trabalhista")?.count).toBe(2);
    expect(data.createdInPeriod).toBe(3);
  });

  it("equipe: tarefas, horas e prazos cumpridos por membro", async () => {
    const { data } = await teamReport(A.ctx, P());
    const l = data.members.find((m) => m.name === lawyer.user.name)!;
    expect(l.tasksDone).toBe(1);
    expect(l.tasksOpen).toBe(1);
    expect(l.tasksOverdue).toBe(1);
    expect(l.hours).toBe(1.5);
    const o = data.members.find((m) => m.name === A.owner.name)!;
    expect(o.deadlinesFulfilled).toBe(3);
  });

  it("financeiro: recebido/pago, estorno ignorado, atraso por faixa e sigilo", async () => {
    const owner = await financeReport(A.ctx, P());
    expect(owner.data.received).toBe("8377.00"); // 600 + 7777 (dono vê o sigiloso)
    expect(owner.data.paid).toBe("200.00");
    const fin = await financeReport(finance.ctx, P());
    expect(fin.data.received).toBe("600.00");
    expect(fin.data.net).toBe("400.00");
    expect(fin.data.receivableOverdue).toBe("1200.00"); // 400 restante do e1 + 500 (e3) + 300 (estorno volta a ficar em aberto)
    expect(fin.data.aging.find((a) => a.label === "31 a 60 dias")?.amount).toBe("500.00");
    expect(fin.data.aging.find((a) => a.label === "1 a 30 dias")?.amount).toBe("700.00");
    expect(fin.data.incomeByCategory[0]).toEqual({ label: "Honorários", amount: "600.00" });
    expect(fin.data.topClients[0]).toEqual({ label: "Cliente Pagador", amount: "600.00" });
    expect(JSON.stringify(fin.table.rows)).not.toContain("7777");
  });

  it("permissões: cada relatório exige reports:read e a permissão do módulo", async () => {
    expect(availableReports(finance.ctx).sort()).toEqual(["financeiro", "processos"]);
    expect(availableReports(assistant.ctx)).toEqual([]);
    expect(availableReports(A.ctx).sort()).toEqual(["equipe", "financeiro", "intimacoes", "prazos", "processos"]);
    await expect(deadlinesReport(finance.ctx, P())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(financeReport(lawyer.ctx, P())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(teamReport(lawyer.ctx, P())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(casesReport(assistant.ctx, P())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportReport(assistant.ctx, "processos", P())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("isolamento: outro escritório não enxerga nada de A", async () => {
    const pb = resolvePeriod(B.ctx, d(-30), d(30));
    expect((await casesReport(B.ctx, pb)).data.visibleTotal).toBe(1);
    expect((await deadlinesReport(B.ctx, pb)).data.total).toBe(0);
    expect((await noticesReport(B.ctx, pb)).data.total).toBe(0);
    expect((await financeReport(B.ctx, pb)).data.received).toBe("0.00");
  });

  it("exportação gera a tabela e audita sem conteúdo", async () => {
    const r = await exportReport(A.ctx, "prazos", P());
    expect(r.table.headers[0]).toBe("Prazo");
    expect(r.table.rows).toHaveLength(6);
    const log = await db.auditLog.findFirst({ where: { organizationId: A.org.id, action: "report.export" }, orderBy: { createdAt: "desc" } });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log!.metadata)).toContain("prazos");
    expect(JSON.stringify(log!.metadata)).not.toContain("Do sigiloso");
  });
});
