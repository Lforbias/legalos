import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { SyncBusyError, createMonitor, runDjenAll, syncDjen } from "@/server/services/djen.service";
import { createCase } from "@/server/services/case.service";
import { loadEvidence, recordEvidence } from "@/server/judicial/evidence.service";
import { addProfessional, ensureProfessional, listProfessionals } from "@/server/judicial/professional.service";
import { finishRun, heartbeat, recoverInterruptedRuns, startRun } from "@/server/judicial/sync-engine";
import { djenItem, djenPage } from "../fixtures/djen-samples";
import { addMember, makeOrgWithOwner } from "./helpers";

const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TRT5", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const cnj = `0007654-${computeCnjCheck({ sequence: "0007654", year: "2024", segment: "5", court: "05", origin: "0001" })}.2024.5.05.0001`;
const digits = cnj.replace(/\D/g, "");
const ok = (items: unknown[], count?: number) => async () => ({ status: 200, body: djenPage(items, count) });
const pageOf = (u: string) => Number(new URL(u).searchParams.get("pagina"));

describe("Box 2.0 — motor de sincronização (respostas SIMULADAS só nos testes)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let monA = "";

  beforeAll(async () => {
    A = await makeOrgWithOwner("bx2-A");
    B = await makeOrgWithOwner("bx2-B");
    lawyer = await addMember(A.org.id, "LAWYER", "bx2-law");
    monA = (await createMonitor(A.ctx, { label: "Dra. Teste", oabNumber: "77001", oabUf: "BA" })).id;
  });

  // Não deixa monitoramentos ligados no banco compartilhado: outros testes (agendador, plataforma) varrem todos os escritórios.
  afterAll(async () => {
    const orgs = [A.org.id, B.org.id];
    await db.djenMonitor.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.syncRun.deleteMany({ where: { organizationId: { in: orgs } } });
    // evidência de plataforma (sem escritório) criada por este arquivo não pode vazar para os outros testes do banco compartilhado
    await db.connectorEvidence.deleteMany({ where: { organizationId: null, summary: "evidência global" } });
  });

  it("cadastro do monitoramento cria a identidade profissional (idempotente, sem duplicar a OAB)", async () => {
    const m = await db.djenMonitor.findUniqueOrThrow({ where: { id: monA } });
    expect(m.professionalId).not.toBeNull();
    const again = await ensureProfessional(A.org.id, { name: "Outro nome", oabNumber: "077001", oabUf: "ba" });
    expect(again).toEqual({ id: m.professionalId, created: false });
    await expect(addProfessional(A.ctx, { name: "Dra. Teste", oabNumber: "77001", oabUf: "BA" })).rejects.toBeInstanceOf(ValidationError);
    await expect(addProfessional(lawyer.ctx, { name: "Fulana", oabNumber: "5", oabUf: "BA" })).rejects.toBeInstanceOf(ForbiddenError);
    await addProfessional(A.ctx, { name: "Colega", oabNumber: "77002", oabUf: "SP", notifyEmail: "colega@example.test" });
    await expect(addProfessional(A.ctx, { name: "Colega 2", oabNumber: "77003", oabUf: "SP", notifyEmail: "inválido" })).rejects.toBeInstanceOf(ValidationError);
    expect((await listProfessionals(A.ctx)).map((p) => p.oabNumber).sort()).toEqual(["77001", "77002"]);
    expect(await listProfessionals(B.ctx)).toHaveLength(0);
  });

  it("captura grava origem, identificador oficial, evidência e histórico — sem dar ciência oficial", async () => {
    await createCase(A.ctx, { ...caseBase, number: cnj });
    const items = [djenItem({ id: 7001, numero_processo: digits, tipoDocumento: "Sentença" }), djenItem({ id: 7002, numero_processo: "00000000000000000000" }), djenItem({ id: 7003, texto: "Sem número de processo." }), djenItem({ id: 7004, ativo: false })];
    const r = await syncDjen(A.ctx, monA, { http: ok(items), pauseMs: 0, days: 5 });
    expect(r).toMatchObject({ found: 4, imported: 3, cancelled: 1, alreadyKnown: 0, complete: true, pages: 1 });
    const rows = await db.courtNotice.findMany({ where: { organizationId: A.org.id, externalKey: { in: ["djen:7001", "djen:7002", "djen:7003"] } }, orderBy: { externalKey: "asc" } });
    expect(rows.map((n) => n.caseMatchState)).toEqual(["LINKED", "NO_CNJ", "NO_CNJ"]);
    for (const n of rows) {
      expect(n).toMatchObject({ originKind: "DJEN_PUBLICATION", sourceSystem: "djen", officialAckState: "NOT_APPLICABLE", officialAckAt: null, firstViewedAt: null });
      expect(n.officialId).toBe(n.externalKey!.slice(5));
      expect(n.capturedAt).not.toBeNull();
      expect(n.syncRunId).toBe(r.runId);
      expect(n.professionalId).not.toBeNull();
    }
    // a captura grava UM evento de captura; a vinculação automática ao processo (CNJ) aparece à parte, no histórico
    const all = await db.noticeEvent.findMany({ where: { noticeId: rows[0]!.id }, orderBy: { createdAt: "asc" } });
    expect(all.map((e) => e.kind).sort()).toEqual(["CAPTURED", "LINKED"]);
    const ev = all.filter((e) => e.kind === "CAPTURED");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "CAPTURED", runId: r.runId });
    expect(JSON.stringify(ev[0]!.data)).toMatch(/rawHash/);
    expect(JSON.stringify(ev[0]!.data)).not.toMatch(/laudo|Sem número/); // evidência não carrega o texto da publicação
    const run = await db.syncRun.findUniqueOrThrow({ where: { id: r.runId } });
    expect(run).toMatchObject({ status: "SUCCEEDED", createdCount: 3, fetched: 4, pages: 1, coverage: "CAPTURE_PROVEN" });
    const m = await db.djenMonitor.findUniqueOrThrow({ where: { id: monA } });
    expect(m).toMatchObject({ lastStatus: "OK", checkpoint: null });
    expect(m.lastSuccessAt).not.toBeNull();
    expect(m.lastCaptureAt).not.toBeNull();
    // resposta simulada NUNCA vira "verificado em produção"
    expect(m.firstVerifiedAt).toBeNull();
  });

  it("evidência de transporte simulado não prova nada; só a de produção conta", async () => {
    const all = await loadEvidence(A.org.id, { connectorKey: "djen" });
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((e) => e.environment === "SIMULATED")).toBe(true);
    expect(all.map((e) => e.operation).sort()).toEqual(expect.arrayContaining(["checkAvailability", "listNotices"]));
    const r = await syncDjen(A.ctx, monA, { http: ok([]), pauseMs: 0, days: 1, evidenceEnvironment: "PRODUCTION" });
    expect(r.complete).toBe(true);
    const m = await db.djenMonitor.findUniqueOrThrow({ where: { id: monA } });
    expect(m.firstVerifiedAt).not.toBeNull();
    const first = m.firstVerifiedAt;
    await syncDjen(A.ctx, monA, { http: ok([]), pauseMs: 0, days: 1, evidenceEnvironment: "PRODUCTION" });
    expect((await db.djenMonitor.findUniqueOrThrow({ where: { id: monA } })).firstVerifiedAt).toEqual(first);
  });

  it("reprocessar a mesma janela não duplica nada (idempotência por fonte + id oficial)", async () => {
    const before = await db.courtNotice.count({ where: { organizationId: A.org.id } });
    const items = [djenItem({ id: 7001, numero_processo: digits, tipoDocumento: "Sentença" }), djenItem({ id: 7003, texto: "Sem número de processo." })];
    const r = await syncDjen(A.ctx, monA, { http: ok(items), pauseMs: 0, days: 5 });
    expect(r).toMatchObject({ imported: 0, alreadyKnown: 2 });
    expect(await db.courtNotice.count({ where: { organizationId: A.org.id } })).toBe(before);
  });

  it("o mesmo identificador oficial em outro escritório é outra comunicação (sem colapsar entre clientes)", async () => {
    const monB = (await createMonitor(B.ctx, { label: "Dr. B", oabNumber: "88001", oabUf: "SP" })).id;
    const r = await syncDjen(B.ctx, monB, { http: ok([djenItem({ id: 7001, texto: "Outra publicação do escritório B." })]), pauseMs: 0, days: 3 });
    expect(r.imported).toBe(1);
    expect(await db.courtNotice.count({ where: { organizationId: B.org.id, externalKey: "djen:7001" } })).toBe(1);
    expect(await db.courtNotice.count({ where: { organizationId: A.org.id, externalKey: "djen:7001" } })).toBe(1);
  });

  it("contagem menor que a informada pela fonte = leitura PARCIAL: a janela não avança e nada fica 'ok' em falso", async () => {
    const mon = (await createMonitor(A.ctx, { label: "Parcial", oabNumber: "77010", oabUf: "BA" })).id;
    const r = await syncDjen(A.ctx, mon, { http: ok([djenItem({ id: 7101 }), djenItem({ id: 7102, texto: "Segunda publicação parcial." })], 5), pauseMs: 0 });
    expect(r).toMatchObject({ complete: false, coverage: "PARTIAL_SYNC", imported: 2, reportedTotal: 5 });
    const m = await db.djenMonitor.findUniqueOrThrow({ where: { id: mon } });
    expect(m).toMatchObject({ lastStatus: "PARTIAL", lastWindowEnd: null, lastSuccessAt: null });
    expect(m.lastMessage).toMatch(/informou 5/);
    const run = await db.syncRun.findUniqueOrThrow({ where: { id: r.runId } });
    expect(run).toMatchObject({ status: "PARTIAL", errorCode: "COUNT_MISMATCH" });
    const ev = await db.connectorEvidence.findFirstOrThrow({ where: { organizationId: A.org.id, sourceId: mon, operation: "listNotices" } });
    expect(ev.outcome).toBe("INCONCLUSIVE");
    // a próxima execução relê a janela e, agora completa, avança
    const r2 = await syncDjen(A.ctx, mon, { http: ok([djenItem({ id: 7101 }), djenItem({ id: 7102, texto: "Segunda publicação parcial." })]), pauseMs: 0 });
    expect(r2.complete).toBe(true);
    expect((await db.djenMonitor.findUniqueOrThrow({ where: { id: mon } })).lastWindowEnd).not.toBeNull();
  });

  it("checkpoint por página: se a página 2 falha, a próxima execução retoma da página 2 e nada é duplicado", async () => {
    const mon = (await createMonitor(A.ctx, { label: "Paginado", oabNumber: "77020", oabUf: "BA" })).id;
    const full = Array.from({ length: 50 }, (_, i) => djenItem({ id: 8000 + i, texto: `Publicação paginada número ${i}.` }));
    const tail = [djenItem({ id: 8100, texto: "Última publicação da página dois." })];
    const failing = async (u: string) => (pageOf(u) === 1 ? { status: 200, body: djenPage(full, 51) } : { status: 503, body: "" });
    await expect(syncDjen(A.ctx, mon, { http: failing, pauseMs: 0 })).rejects.toBeInstanceOf(ConflictError);
    const mid = await db.djenMonitor.findUniqueOrThrow({ where: { id: mon } });
    expect(mid).toMatchObject({ lastStatus: "ERROR", lastWindowEnd: null });
    expect(mid.checkpoint).toMatchObject({ nextPage: 2, created: 50 });
    const failedRun = await db.syncRun.findFirstOrThrow({ where: { sourceId: mon }, orderBy: { startedAt: "desc" } });
    expect(failedRun).toMatchObject({ status: "FAILED", errorCode: "UNAVAILABLE", createdCount: 50 });
    const pages: number[] = [];
    const resume = async (u: string) => (pages.push(pageOf(u)), { status: 200, body: djenPage(tail, 51) });
    const r = await syncDjen(A.ctx, mon, { http: resume, pauseMs: 0 });
    expect(pages).toEqual([2]); // não releu a página 1
    expect(r).toMatchObject({ complete: true, imported: 51, reportedTotal: 51 }); // contagem acumulada da execução retomada
    expect(await db.courtNotice.count({ where: { organizationId: A.org.id, OR: [{ externalKey: { startsWith: "djen:80" } }, { externalKey: "djen:8100" }] } })).toBe(51);
    const m = await db.djenMonitor.findUniqueOrThrow({ where: { id: mon } });
    expect(m).toMatchObject({ lastStatus: "OK", checkpoint: null });
    expect(m.lastWindowEnd).not.toBeNull();
  });

  it("falha deixa evidência FAILED com o motivo e nunca marca a fonte como operacional", async () => {
    const mon = (await createMonitor(A.ctx, { label: "Bloqueado", oabNumber: "77030", oabUf: "BA" })).id;
    await expect(syncDjen(A.ctx, mon, { http: async () => ({ status: 403, body: "Request blocked: country" }), pauseMs: 0 })).rejects.toThrow(/Brasil/);
    const evs = await db.connectorEvidence.findMany({ where: { sourceId: mon }, orderBy: { checkedAt: "asc" } });
    expect(evs.map((e) => `${e.operation}:${e.outcome}:${e.reasonCode}`).sort()).toEqual(["checkAvailability:FAILED:GEO_BLOCKED", "listNotices:FAILED:GEO_BLOCKED"]);
    const m = await db.djenMonitor.findUniqueOrThrow({ where: { id: mon } });
    expect(m).toMatchObject({ lastStatus: "ERROR", lastSuccessAt: null, firstVerifiedAt: null });
  });

  it("trava: duas sincronizações simultâneas da mesma OAB não rodam juntas", async () => {
    const mon = (await createMonitor(A.ctx, { label: "Trava", oabNumber: "77040", oabUf: "BA" })).id;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const inside = new Promise<void>((r) => (entered = r));
    const slow = async () => {
      entered();
      await gate;
      return { status: 200, body: djenPage([djenItem({ id: 8500, texto: "Publicação da sincronização lenta." })]) };
    };
    const first = syncDjen(A.ctx, mon, { http: slow, pauseMs: 0 });
    await inside;
    await expect(syncDjen(A.ctx, mon, { http: ok([]), pauseMs: 0 })).rejects.toBeInstanceOf(SyncBusyError);
    const during = await db.djenMonitor.findUniqueOrThrow({ where: { id: mon } });
    expect(during.lastStatus).toBeNull(); // a trava não é falha da fonte
    release();
    expect((await first).imported).toBe(1);
    const again = await syncDjen(A.ctx, mon, { http: ok([]), pauseMs: 0 });
    expect(again.complete).toBe(true);
    expect(await db.syncRun.count({ where: { sourceId: mon, status: "RUNNING" } })).toBe(0);
  });

  it("execução sem sinal de vida é marcada INTERRUPTED e libera a fonte", async () => {
    const mon = (await createMonitor(A.ctx, { label: "Travada", oabNumber: "77050", oabUf: "BA" })).id;
    const src = { kind: "DJEN" as const, id: mon, organizationId: A.org.id };
    const t0 = new Date(Date.now() - 30 * 60_000);
    const stale = await startRun(src, "CRON", {}, t0);
    expect(stale.locked).toBe(false);
    expect((await startRun(src, "CRON", {}, new Date(t0.getTime() + 60_000))).locked).toBe(true); // ainda dentro do prazo do sinal de vida
    expect(await recoverInterruptedRuns(new Date(), src)).toBe(1);
    const row = await db.syncRun.findUniqueOrThrow({ where: { id: (stale as { run: { id: string } }).run.id } });
    expect(row).toMatchObject({ status: "INTERRUPTED", errorCode: "INTERRUPTED" });
    const next = await startRun(src, "CRON");
    expect(next.locked).toBe(false);
    if (!next.locked) {
      await heartbeat(next.run.id, { counters: { pages: 1, fetched: 3 } });
      await finishRun(next.run.id, "SUCCEEDED", { counters: { created: 2 }, coverage: "QUERY_COMPLETED" });
      expect(await db.syncRun.findUniqueOrThrow({ where: { id: next.run.id } })).toMatchObject({ status: "SUCCEEDED", pages: 1, fetched: 3, createdCount: 2 });
    }
  });

  it("execução automática distingue ok, parcial, ocupada e falha", async () => {
    const mon = (await createMonitor(A.ctx, { label: "Cron", oabNumber: "77060", oabUf: "BA" })).id;
    const src = { kind: "DJEN" as const, id: mon, organizationId: A.org.id };
    expect((await startRun(src, "MANUAL")).locked).toBe(false); // alguém já está sincronizando esta OAB
    const r = await runDjenAll({ http: ok([]), pauseMs: 0 });
    expect(r.busy).toBeGreaterThanOrEqual(1);
    expect(r.total).toBeGreaterThanOrEqual(r.ok + r.busy + r.failed + r.partial);
    await db.syncRun.updateMany({ where: { sourceId: mon, status: "RUNNING" }, data: { status: "FAILED", finishedAt: new Date() } });
  });

  it("evidência: cada escritório só enxerga a própria; a global (da plataforma) é visível a todos", async () => {
    await recordEvidence({ organizationId: B.org.id, connectorKey: "djen", operation: "listNotices", accessMethod: "PUBLIC", outcome: "PASSED", summary: "evidência do escritório B", environment: "HOMOLOGATION" });
    await recordEvidence({ organizationId: null, connectorKey: "djen", operation: "checkAvailability", accessMethod: "PUBLIC", outcome: "PASSED", summary: "evidência global", environment: "HOMOLOGATION" });
    const a = await loadEvidence(A.org.id);
    expect(a.some((e) => e.environment === "HOMOLOGATION" && e.operation === "listNotices")).toBe(false);
    expect(a.some((e) => e.operation === "checkAvailability" && e.environment === "HOMOLOGATION")).toBe(true);
    const b = await loadEvidence(B.org.id);
    expect(b.some((e) => e.environment === "HOMOLOGATION" && e.operation === "listNotices")).toBe(true);
    const onlyOne = await loadEvidence(A.org.id, { sourceId: monA });
    expect(onlyOne.every((e) => e.sourceId === monA || e.sourceId === null)).toBe(true);
  });
});
