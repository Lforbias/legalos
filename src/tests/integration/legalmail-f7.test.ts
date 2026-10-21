import { describe, expect, it, beforeAll } from "vitest";
import { db } from "@/lib/db/client";
import { ForbiddenError } from "@/lib/permissions/check";
import { classifySource, getMonitoringOverview, runMonitoringCheck, STALE_HOURS } from "@/server/services/monitoring.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const H = 3_600_000;

describe("3.0-F7 — saúde do monitoramento de intimações", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  const now = new Date();

  beforeAll(async () => {
    A = await makeOrgWithOwner("l3f7-a");
    B = await makeOrgWithOwner("l3f7-b");
    assistant = await addMember(A.org.id, "ASSISTANT", "l3f7-ass");
  });

  it("classifica as fontes", () => {
    expect(classifySource({ enabled: false, lastSyncAt: null, lastStatus: null }, now)).toBe("OFF");
    expect(classifySource({ enabled: true, lastSyncAt: null, lastStatus: null }, now)).toBe("NEVER");
    expect(classifySource({ enabled: true, lastSyncAt: now, lastStatus: "ERROR" }, now)).toBe("ERROR");
    expect(classifySource({ enabled: true, lastSyncAt: new Date(now.getTime() - (STALE_HOURS + 1) * H), lastStatus: "OK" }, now)).toBe("STALE");
    expect(classifySource({ enabled: true, lastSyncAt: new Date(now.getTime() - H), lastStatus: "OK" }, now)).toBe("OK");
  });

  it("painel exige integrations:manage e só mostra o próprio escritório", async () => {
    await db.djenMonitor.create({ data: { organizationId: A.org.id, label: "OAB A", oabNumber: "1234", oabUf: "BA", enabled: true, lastSyncAt: now, lastStatus: "OK", createdById: A.ctx.userId } });
    await db.djenMonitor.create({ data: { organizationId: B.org.id, label: "OAB B", oabNumber: "9999", oabUf: "SP", enabled: true, lastSyncAt: now, lastStatus: "ERROR", createdById: B.ctx.userId } });
    await expect(getMonitoringOverview(assistant.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    const o = await getMonitoringOverview(A.ctx, now);
    expect(o.sources.map((s) => s.label)).toEqual(["OAB A"]);
    expect(o.problems).toBe(0);
    expect(o.importedByDay).toHaveLength(7);
  });

  it("alerta falha e parada, sem duplicar, e só para quem administra integrações", async () => {
    await db.djenMonitor.create({ data: { organizationId: A.org.id, label: "Falhou", oabNumber: "55", oabUf: "BA", enabled: true, lastSyncAt: now, lastStatus: "ERROR", lastMessage: "x", createdById: A.ctx.userId } });
    await db.djenMonitor.create({ data: { organizationId: A.org.id, label: "Parou", oabNumber: "56", oabUf: "BA", enabled: true, lastSyncAt: new Date(now.getTime() - 50 * H), lastStatus: "OK", createdById: A.ctx.userId } });
    await db.djenMonitor.create({ data: { organizationId: A.org.id, label: "Desligada", oabNumber: "57", oabUf: "BA", enabled: false, lastSyncAt: null, lastStatus: null, createdById: A.ctx.userId } });
    const r1 = await runMonitoringCheck(A.org.id, now);
    expect(r1.alerts).toBeGreaterThanOrEqual(2);
    const mine = await db.notification.findMany({ where: { organizationId: A.org.id, kind: "MONITORING_ALERT" } });
    expect(mine.some((n) => n.title.includes("Falhou"))).toBe(true);
    expect(mine.some((n) => n.title.includes("Parou"))).toBe(true);
    expect(mine.some((n) => n.title.includes("Desligada"))).toBe(false);
    expect(mine.every((n) => n.userId !== assistant.ctx.userId)).toBe(true);
    const r2 = await runMonitoringCheck(A.org.id, now);
    expect(r2.alerts).toBe(0);
    expect(await db.notification.count({ where: { organizationId: A.org.id, kind: "MONITORING_ALERT" } })).toBe(mine.length);
    const o = await getMonitoringOverview(A.ctx, now);
    expect(o.problems).toBe(2);
  });

  it("conta intimações importadas por dia (ignora manuais e apagadas)", async () => {
    const mk = (source: "IMPORTED" | "MANUAL", extra: object = {}) => db.courtNotice.create({ data: { organizationId: A.org.id, source, title: "t", content: "c", receivedAt: now, contentHash: `h-${Math.random()}`, ...extra } });
    await mk("IMPORTED"); await mk("IMPORTED"); await mk("MANUAL"); await mk("IMPORTED", { deletedAt: now });
    const o = await getMonitoringOverview(A.ctx, new Date());
    expect(o.importedTotal).toBe(2);
    expect(o.importedByDay.at(-1)?.count).toBe(2);
    expect((await getMonitoringOverview(B.ctx, new Date())).importedTotal).toBe(0);
  });
});
