import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { zonedToUtc } from "@/lib/dates/zoned";
import { getOfficeOverview } from "@/server/services/office-overview.service";
import { getDashboard } from "@/server/services/dashboard.service";
import { makeOrgWithOwner } from "./helpers";

describe("Visão geral de gestão", () => {
  it("mede trabalho do escritório, carteira e saldos reais, excluindo cancelados, removidos e outro escritório", async () => {
    const a = await makeOrgWithOwner("gestao"), b = await makeOrgWithOwner("fora");
    const today = todayYmd(a.ctx.timezone), yesterday = ymdToDate(addDays(today, -1));
    const c = await db.case.create({ data: { organizationId: a.org.id, title: "Carteira ativa" } });
    await db.case.create({ data: { organizationId: a.org.id, title: "Acervo", archivedAt: new Date() } });
    await db.case.create({ data: { organizationId: b.org.id, title: "Outro escritório" } });
    await db.task.createMany({ data: [
      { organizationId: a.org.id, title: "Aberta sem responsável", dueDate: yesterday },
      { organizationId: a.org.id, title: "Em trabalho", status: "IN_PROGRESS", assigneeId: a.owner.id, dueDate: ymdToDate(today) },
      { organizationId: a.org.id, title: "Concluída", status: "DONE", completedAt: new Date(), dueDate: yesterday },
      { organizationId: a.org.id, title: "Cancelada", status: "CANCELED", dueDate: yesterday },
      { organizationId: a.org.id, title: "Removida", deletedAt: new Date(), dueDate: yesterday },
      { organizationId: b.org.id, title: "Outra organização", dueDate: yesterday },
    ] });
    await db.deadline.createMany({ data: [
      { organizationId: a.org.id, caseId: c.id, title: "Vencido", status: "VALIDATED", validatedById: a.owner.id, validatedAt: new Date(), dueDate: yesterday },
      { organizationId: a.org.id, caseId: c.id, title: "Hoje rascunho", dueDate: ymdToDate(today) },
      { organizationId: a.org.id, caseId: c.id, title: "Cumprido", status: "FULFILLED", validatedAt: new Date(), validatedById: a.owner.id, fulfilledAt: new Date(), dueDate: yesterday },
    ] });
    await db.agendaEvent.createMany({ data: [
      { organizationId: a.org.id, title: "No primeiro minuto", startsAt: zonedToUtc(today, "00:00", a.ctx.timezone) },
      { organizationId: a.org.id, title: "Fora da janela", startsAt: zonedToUtc(addDays(today, 7), "00:00", a.ctx.timezone) },
      { organizationId: b.org.id, title: "Não mostrar", startsAt: zonedToUtc(today, "10:00", a.ctx.timezone) },
    ] });
    await db.financeEntry.createMany({ data: [
      { organizationId: a.org.id, kind: "RECEIVABLE", status: "PARTIAL", description: "Parcial", amount: "100.00", paidAmount: "25.00", dueDate: yesterday, issueDate: yesterday },
      { organizationId: a.org.id, kind: "RECEIVABLE", status: "CANCELED", canceledAt: new Date(), description: "Cancelado", amount: "900.00", dueDate: yesterday, issueDate: yesterday },
      { organizationId: b.org.id, kind: "RECEIVABLE", description: "Outro", amount: "999.00", dueDate: yesterday, issueDate: yesterday },
    ] });
    const d = await getOfficeOverview(a.ctx);
    expect(d.tasks).toMatchObject({ open: 2, overdue: 1, unassigned: 1, completedMonth: 1, todo: 1, inProgress: 1 });
    expect(d.deadlines).toMatchObject({ open: 2, overdue: 1, today: 1, draft: 1 });
    expect(d.deadlines?.items.map(x => x.title)).toEqual(["Vencido", "Hoje rascunho"]);
    expect(d.agenda?.map(x => x.title)).toEqual(["No primeiro minuto"]);
    expect(d.portfolio?.statuses).toEqual([{ status: "ACTIVE", count: 1 }]);
    expect(d.portfolio?.unassigned).toBe(1);
    expect(d.finance).toMatchObject({ receivableOpen: "75.00", receivableOverdue: "75.00", receivedThisMonth: "0.00" });
    expect(d.team?.find(x => x.id === a.owner.id)).toMatchObject({ open: 1, overdue: 0 });
    expect((await getDashboard(a.ctx)).legal.activeCases).toBe(1);
  });

  it("oculta módulos sem permissão e não inclui processos sigilosos nem seus filhos", async () => {
    const a = await makeOrgWithOwner("sigilo");
    const today = ymdToDate(todayYmd(a.ctx.timezone));
    const c = await db.case.create({ data: { organizationId: a.org.id, title: "Sigiloso", confidential: true } });
    await db.task.create({ data: { organizationId: a.org.id, caseId: c.id, title: "Não vazar" } });
    await db.deadline.create({ data: { organizationId: a.org.id, caseId: c.id, title: "Não vazar", dueDate: today } });
    const limited = { ...a.ctx, isOwner: false, permissions: new Set(["tasks:read", "cases:read", "deadlines:read"] as const) };
    const d = await getOfficeOverview(limited);
    expect(d.portfolio?.statuses).toEqual([]);
    expect(d.tasks?.open).toBe(0);
    expect(d.deadlines?.open).toBe(0);
    expect(d.finance).toBeNull(); expect(d.clients).toBeNull(); expect(d.team).toBeNull(); expect(d.notices).toBeNull();
    const empty = await getOfficeOverview({ ...limited, permissions: new Set() });
    expect(empty.tasks).toBeNull(); expect(empty.deadlines).toBeNull(); expect(empty.agenda).toBeNull(); expect(empty.portfolio).toBeNull();
  });
});
