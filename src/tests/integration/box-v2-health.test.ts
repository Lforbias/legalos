import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ForbiddenError } from "@/lib/permissions/check";
import { acknowledgeAlert, computeOrgHealth, getSourceHealth, listAlerts, reconcileAlerts, runHealthCheck } from "@/server/judicial/health.service";
import { recordEvidence } from "@/server/judicial/evidence.service";
import { createMonitor } from "@/server/services/djen.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const MIN = 60_000;
const H = 60 * MIN;

describe("Box 2.0 — saúde por fonte e alertas", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  const now = new Date();

  beforeAll(async () => {
    A = await makeOrgWithOwner("hlth-A");
    B = await makeOrgWithOwner("hlth-B");
    assistant = await addMember(A.org.id, "ASSISTANT", "hlth-ass");
  });
  afterAll(async () => {
    const orgs = [A.org.id, B.org.id];
    await db.djenMonitor.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.courtConnection.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.syncRun.deleteMany({ where: { organizationId: { in: orgs } } });
  });

  const mon = async (label: string, oab: string, over: Record<string, unknown> = {}) => {
    const m = await createMonitor(A.ctx, { label, oabNumber: oab, oabUf: "BA" });
    if (Object.keys(over).length) await db.djenMonitor.update({ where: { id: m.id }, data: over });
    return m.id;
  };

  it("cada fonte tem a sua tolerância: DJEN 'em dia' às 20 min, 'atrasado' às 2 h, 'parado' às 7 h", async () => {
    const ok = await mon("Em dia", "91001", { lastStatus: "OK", lastSyncAt: new Date(now.getTime() - 20 * MIN), lastSuccessAt: new Date(now.getTime() - 20 * MIN), firstVerifiedAt: now });
    const late = await mon("Atrasada", "91002", { lastStatus: "OK", lastSyncAt: new Date(now.getTime() - 2 * H), lastSuccessAt: new Date(now.getTime() - 2 * H), firstVerifiedAt: now });
    const dead = await mon("Parada", "91003", { lastStatus: "OK", lastSyncAt: new Date(now.getTime() - 7 * H), lastSuccessAt: new Date(now.getTime() - 7 * H), firstVerifiedAt: now });
    const rows = await getSourceHealth(A.org.id, now);
    const by = (id: string) => rows.find((r) => r.id === id)!;
    expect(by(ok)).toMatchObject({ freshness: "OK", severity: "OK" });
    expect(by(late)).toMatchObject({ freshness: "LATE", severity: "WARNING" });
    expect(by(dead)).toMatchObject({ freshness: "CRITICAL", severity: "CRITICAL" });
    expect(by(dead).headline).toMatch(/^Parado/);
  });

  it("alerta uma vez, avisa só quem administra integrações, não repete e RESOLVE sozinho quando a fonte volta", async () => {
    const h = await computeOrgHealth(A.org.id, { now, includeJobs: false });
    expect(h.candidates.some((c) => c.code === "SOURCE_STALE" && c.severity === "CRITICAL")).toBe(true);
    const r1 = await reconcileAlerts(A.org.id, h.candidates, now);
    expect(r1.opened).toBeGreaterThanOrEqual(2);
    expect(r1.notified).toBeGreaterThanOrEqual(2);
    const notes = await db.notification.findMany({ where: { organizationId: A.org.id, kind: "MONITORING_ALERT" } });
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(notes.every((n) => n.userId !== assistant.ctx.userId)).toBe(true);
    expect(notes.every((n) => n.link === "/box/saude")).toBe(true);
    const r2 = await reconcileAlerts(A.org.id, (await computeOrgHealth(A.org.id, { now, includeJobs: false })).candidates, now);
    expect(r2).toMatchObject({ opened: 0, escalated: 0, notified: 0 }); // sem repetir aviso
    const alerts = await listAlerts(A.ctx);
    const dead = alerts.find((a) => a.code === "SOURCE_STALE" && a.severity === "CRITICAL")!;
    expect(dead.occurrences).toBeGreaterThanOrEqual(2);
    // a fonte parada volta a funcionar → o alerta é resolvido sozinho
    await db.djenMonitor.updateMany({ where: { organizationId: A.org.id, label: "Parada" }, data: { lastSuccessAt: now, lastSyncAt: now } });
    const r3 = await reconcileAlerts(A.org.id, (await computeOrgHealth(A.org.id, { now, includeJobs: false })).candidates, now);
    expect(r3.resolved).toBeGreaterThanOrEqual(1);
    expect((await listAlerts(A.ctx)).some((a) => a.id === dead.id)).toBe(false);
    expect((await listAlerts(A.ctx, { includeResolved: true })).find((a) => a.id === dead.id)).toMatchObject({ state: "RESOLVED" });
  });

  it("reaberto o problema, avisa de novo (novo ciclo), e a escalada de aviso para crítico também avisa", async () => {
    const id = await mon("Escala", "91004", { lastStatus: "OK", lastSyncAt: new Date(now.getTime() - 2 * H), lastSuccessAt: new Date(now.getTime() - 2 * H), firstVerifiedAt: now });
    const c1 = (await computeOrgHealth(A.org.id, { now, includeJobs: false })).candidates;
    await reconcileAlerts(A.org.id, c1, now);
    const before = await db.notification.count({ where: { organizationId: A.org.id, kind: "MONITORING_ALERT", title: { contains: "Escala" } } });
    expect(before).toBeGreaterThanOrEqual(1);
    await db.djenMonitor.update({ where: { id }, data: { lastSuccessAt: new Date(now.getTime() - 8 * H), lastSyncAt: new Date(now.getTime() - 8 * H) } });
    const r = await reconcileAlerts(A.org.id, (await computeOrgHealth(A.org.id, { now, includeJobs: false })).candidates, now);
    expect(r.escalated).toBeGreaterThanOrEqual(1);
    const a = (await listAlerts(A.ctx)).find((x) => x.code === "SOURCE_STALE" && x.sourceId === id)!;
    expect(a.severity).toBe("CRITICAL");
    expect(await db.notification.count({ where: { organizationId: A.org.id, kind: "MONITORING_ALERT", title: { contains: "Escala" } } })).toBeGreaterThan(before);
  });

  it("reconhecer um alerta exige permissão e não o apaga", async () => {
    const a = (await listAlerts(A.ctx)).find((x) => x.state === "OPEN")!;
    await expect(listAlerts(assistant.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(acknowledgeAlert(assistant.ctx, a.id)).rejects.toBeInstanceOf(ForbiddenError);
    await acknowledgeAlert(A.ctx, a.id);
    expect((await listAlerts(A.ctx)).find((x) => x.id === a.id)).toMatchObject({ state: "ACKNOWLEDGED" });
    await expect(acknowledgeAlert(A.ctx, a.id)).rejects.toThrow(/não encontrado|já tratado/i);
    await expect(acknowledgeAlert(B.ctx, a.id)).rejects.toThrow(/não encontrado|já tratado/i); // outro escritório
  });

  it("isolamento: o escritório B não vê alertas nem fontes do A", async () => {
    expect(await listAlerts(B.ctx)).toHaveLength(0);
    expect(await getSourceHealth(B.org.id, now)).toHaveLength(0);
  });

  it("conexão MNI: autenticação recusada vira 'precisa da sua ação', não 'falhando'", async () => {
    const c = await db.courtConnection.create({ data: { organizationId: A.org.id, label: "TRT5 PJe", jtr: "5.05", endpointUrl: "https://exemplo.invalid/mni", authMode: "PASSWORD", secretEnc: "x", enabled: true, lastSyncAt: now, lastStatus: "ERROR", lastMessage: "x", createdById: A.ctx.userId } });
    await recordEvidence({ organizationId: A.org.id, source: { kind: "MNI", id: c.id }, connectorKey: "pje-mni", courtCode: "5.05", operation: "listNotices", accessMethod: "MNI", environment: "SIMULATED", outcome: "FAILED", reasonCode: "AUTH_REJECTED", summary: "recusado" });
    const row = (await getSourceHealth(A.org.id, now)).find((r) => r.id === c.id)!;
    expect(row.needsAction).toMatch(/recusou o acesso/);
    expect(row.severity).toBe("WARNING");
    const codes = (await computeOrgHealth(A.org.id, { now, includeJobs: false })).candidates.filter((x) => x.sourceId === c.id).map((x) => x.code);
    expect(codes).toContain("SOURCE_NEEDS_ACTION");
    expect(codes).not.toContain("SOURCE_FAILING");
  });

  it("rotina agendada que não roda vira alerta do escritório que depende dela; 'criticidade' de rotina parada", async () => {
    await db.jobRun.deleteMany({ where: { job: "djen" } });
    const h = await computeOrgHealth(A.org.id, { now });
    expect(h.jobs.find((j) => j.key === "djen")).toMatchObject({ level: "LATE", lastOkAt: null });
    await db.jobRun.create({ data: { job: "djen", trigger: "CRON", status: "OK", startedAt: new Date(now.getTime() - 100 * MIN), finishedAt: new Date(now.getTime() - 99 * MIN) } });
    const h2 = await computeOrgHealth(A.org.id, { now });
    expect(h2.jobs.find((j) => j.key === "djen")).toMatchObject({ level: "STALLED" });
    expect(h2.candidates.some((c) => c.code === "JOB_LATE" && c.severity === "CRITICAL")).toBe(true);
    await db.jobRun.create({ data: { job: "djen", trigger: "CRON", status: "OK", startedAt: new Date(now.getTime() - 5 * MIN) } });
    expect((await computeOrgHealth(A.org.id, { now })).jobs.find((j) => j.key === "djen")!.level).toBe("OK");
    await db.jobRun.deleteMany({ where: { job: "djen" } });
  });

  it("verificação periódica só percorre escritórios com o Box 2.0 ligado (chave geral ou piloto) e não falha sem fontes", async () => {
    const saved = { all: process.env.LEGALOS_BOX_V2, pilot: process.env.LEGALOS_BOX_V2_ORGS };
    try {
      delete process.env.LEGALOS_BOX_V2;
      delete process.env.LEGALOS_BOX_V2_ORGS;
      // tudo desligado: nenhum escritório é verificado e ninguém recebe aviso novo (o Box antigo segue como era)
      expect(await runHealthCheck(undefined, { now, includeJobs: false })).toMatchObject({ orgs: 0, opened: 0, escalated: 0, resolved: 0, notified: 0 });
      // piloto: só o escritório listado entra, mesmo havendo outros escritórios com fontes no banco
      process.env.LEGALOS_BOX_V2_ORGS = A.org.id;
      expect((await runHealthCheck(undefined, { now, includeJobs: false })).orgs).toBe(1);
      // chave geral: todos os que têm fonte entram
      delete process.env.LEGALOS_BOX_V2_ORGS;
      process.env.LEGALOS_BOX_V2 = "1";
      expect((await runHealthCheck(undefined, { now, includeJobs: false })).orgs).toBeGreaterThanOrEqual(1);
    } finally {
      if (saved.all === undefined) delete process.env.LEGALOS_BOX_V2; else process.env.LEGALOS_BOX_V2 = saved.all;
      if (saved.pilot === undefined) delete process.env.LEGALOS_BOX_V2_ORGS; else process.env.LEGALOS_BOX_V2_ORGS = saved.pilot;
    }
    const none = await runHealthCheck(B.org.id, { now, includeJobs: false });
    expect(none).toMatchObject({ opened: 0, notified: 0 });
  });
});
