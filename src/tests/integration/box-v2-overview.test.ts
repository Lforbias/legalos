import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { getBoxCases } from "@/server/judicial/box-cases.service";
import { checkSource, startPublicMonitoring } from "@/server/judicial/onboarding.service";
import { getBoxOverview, getSetupState } from "@/server/judicial/overview.service";
import { addProfessional } from "@/server/judicial/professional.service";
import { createCase } from "@/server/services/case.service";
import { syncDjen } from "@/server/services/djen.service";
import { djenItem, djenPage } from "../fixtures/djen-samples";
import { addMember, makeOrgWithOwner } from "./helpers";

const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TRT5", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const mkCnj = (seq: string) => `${seq}-${computeCnjCheck({ sequence: seq, year: "2024", segment: "5", court: "05", origin: "0001" })}.2024.5.05.0001`;
const digitsOf = (cnj: string) => cnj.replace(/\D/g, "");
const ok = (items: unknown[]) => async () => ({ status: 200, body: djenPage(items) });

describe("Box 2.0 — Visão Geral, Processos e assistente (dados reais, sigilo e honestidade)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  const open = mkCnj("0010001");
  const secret = mkCnj("0010002");
  const unknown = mkCnj("0010003");
    let openCaseId = "";

  beforeAll(async () => {
    A = await makeOrgWithOwner("ov-A");
    B = await makeOrgWithOwner("ov-B");
    lawyer = await addMember(A.org.id, "LAWYER", "ov-law");
    assistant = await addMember(A.org.id, "ASSISTANT", "ov-ass");
  });
  afterAll(async () => {
    const orgs = [A.org.id, B.org.id];
    await db.djenMonitor.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.syncRun.deleteMany({ where: { organizationId: { in: orgs } } });
  });

  it("assistente: o passo avança só com fatos (advogado → monitoramento → consulta REAL concluída)", async () => {
    expect((await getSetupState(A.org.id)).step).toBe("PROFESSIONAL");
    const prof = await addProfessional(A.ctx, { name: "Dra. Ana", oabNumber: "81001", oabUf: "BA", notifyEmail: "ana@example.test" });
    expect(await getSetupState(A.org.id)).toMatchObject({ step: "MONITORING", professionals: 1, monitors: 0 });

    // consulta com transporte simulado: roda, mas não conta como verificação real
    const sim = await startPublicMonitoring(A.ctx, prof.id, { djen: { http: ok([djenItem({ id: 8101, numero_processo: digitsOf(open) })]), pauseMs: 0 } });
    expect(sim).toMatchObject({ tone: "success", title: "Consulta concluída" });
    expect(sim.monitorId).toBeTruthy();
    expect(await getSetupState(A.org.id)).toMatchObject({ step: "FIRST_CHECK", monitors: 1, verifiedMonitors: 0 });

    // reutiliza o mesmo monitoramento (nunca duplica a OAB) e agora com consulta de produção
    const real = await startPublicMonitoring(A.ctx, prof.id, { djen: { http: ok([djenItem({ id: 8101, numero_processo: digitsOf(open) })]), pauseMs: 0, evidenceEnvironment: "PRODUCTION" } });
    expect(real.monitorId).toBe(sim.monitorId);
    expect(await db.djenMonitor.count({ where: { organizationId: A.org.id } })).toBe(1);
    expect(await getSetupState(A.org.id)).toMatchObject({ step: "DONE", verifiedMonitors: 1 });
    expect(real.detail).toMatch(/que o LegalOS já tinha/);
  });

  it("assistente: monitoramento desligado é religado; profissional inexistente, de outro escritório ou sem permissão é recusado", async () => {
    const m = await db.djenMonitor.findFirstOrThrow({ where: { organizationId: A.org.id } });
    await db.djenMonitor.update({ where: { id: m.id }, data: { enabled: false } });
    const prof = await db.professionalIdentity.findFirstOrThrow({ where: { organizationId: A.org.id } });
    await startPublicMonitoring(A.ctx, prof.id, { djen: { http: ok([]), pauseMs: 0 } });
    expect((await db.djenMonitor.findUniqueOrThrow({ where: { id: m.id } })).enabled).toBe(true);

    await expect(startPublicMonitoring(B.ctx, prof.id, { djen: { http: ok([]), pauseMs: 0 } })).rejects.toBeInstanceOf(NotFoundError);
    await expect(startPublicMonitoring(A.ctx, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
    await expect(startPublicMonitoring(lawyer.ctx, prof.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("assistente: se o DJEN recusa a consulta, o resultado é erro explicado em português simples (e nada vira 'ok')", async () => {
    const prof = await addProfessional(A.ctx, { name: "Dr. Bloqueado", oabNumber: "81002", oabUf: "SP" });
    const out = await startPublicMonitoring(A.ctx, prof.id, { djen: { http: async () => ({ status: 403, body: "block access from your country" }), pauseMs: 0, evidenceEnvironment: "PRODUCTION" } });
    expect(out).toMatchObject({ tone: "error", title: "A consulta não foi concluída" });
    expect(out.detail).toMatch(/servidor do LegalOS/);
    expect(out.detail).not.toMatch(/403|HTTP|SOAP|endpoint/i);
    const m = await db.djenMonitor.findUniqueOrThrow({ where: { id: out.monitorId! } });
    expect(m).toMatchObject({ lastStatus: "ERROR", firstVerifiedAt: null });
    expect((await getSetupState(A.org.id)).verifiedMonitors).toBe(1); // continua só o da Dra. Ana

    const slow = await startPublicMonitoring(A.ctx, prof.id, { djen: { http: async () => ({ status: 503, body: "" }), pauseMs: 0, evidenceEnvironment: "PRODUCTION" } });
    expect(slow.detail).toMatch(/fora do ar ou muito lento/);
    expect(slow.detail).toMatch(/tenta de novo sozinho/);
  });

  it("consultar agora: resultado explicado, com permissão de escrita da Caixa", async () => {
    const m = await db.djenMonitor.findFirstOrThrow({ where: { organizationId: A.org.id, oabNumber: "81001" } });
    const r = await checkSource(A.ctx, "DJEN", m.id, { djen: { http: ok([djenItem({ id: 8102 })]), pauseMs: 0 } });
    expect(r).toMatchObject({ tone: "success", title: "Consulta concluída" });
    expect(r.detail).toMatch(/1 publicação\(ões\)/);
    await expect(checkSource(assistant.ctx, "DJEN", m.id, { djen: { http: ok([]), pauseMs: 0 } })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("visão geral: contagens reais, estados separados (capturada ≠ vista ≠ ciência oficial) e sigilo respeitado", async () => {
    openCaseId = (await createCase(A.ctx, { ...caseBase, number: open, title: "Processo aberto" })).id;
    await createCase(A.ctx, { ...caseBase, number: secret, title: "Processo sigiloso", confidential: true });
    const m = await db.djenMonitor.findFirstOrThrow({ where: { organizationId: A.org.id, oabNumber: "81001" } });
    await syncDjen(A.ctx, m.id, {
      http: ok([
        djenItem({ id: 8201, numero_processo: digitsOf(open), texto: "Intimação do processo aberto, com prazo para manifestação." }),
        djenItem({ id: 8202, numero_processo: digitsOf(secret), texto: "Intimação do processo sigiloso, conteúdo reservado ao advogado do caso." }),
        djenItem({ id: 8203, numero_processo: digitsOf(unknown), texto: "Intimação de processo ainda não cadastrado no escritório." }),
      ]),
      pauseMs: 0,
    });

    const owner = await getBoxOverview(A.ctx);
    expect(owner.setup).not.toBeNull();
    expect(owner.inbox.capturedLast24h).toBeGreaterThanOrEqual(3);
    expect(owner.latest.every((n) => n.officialAck === false)).toBe(true);
    expect(owner.latest.some((n) => n.originKind === "DJEN_PUBLICATION")).toBe(true);
    const unseen = owner.inbox.notViewed;
    expect(unseen).toBeGreaterThanOrEqual(3);

    // "vista no LegalOS" muda só o próprio estado; ciência oficial continua nula
    const one = await db.courtNotice.findFirstOrThrow({ where: { organizationId: A.org.id, externalKey: "djen:8201" } });
    await db.courtNotice.update({ where: { id: one.id }, data: { firstViewedAt: new Date(), firstViewedById: A.ctx.userId } });
    const after = await getBoxOverview(A.ctx);
    expect(after.inbox.notViewed).toBe(unseen - 1);
    expect(after.latest.find((n) => n.id === one.id)).toMatchObject({ viewed: true, officialAck: false });

    // quem não é dono nem membro do caso sigiloso não o vê (nem na contagem, nem na lista)
    const asLawyer = await getBoxOverview(lawyer.ctx);
    expect(asLawyer.setup).toBeNull(); // advogado comum não administra integrações
    expect(asLawyer.inbox.total).toBe(owner.inbox.total - 1);
    const secretNotice = await db.courtNotice.findFirstOrThrow({ where: { organizationId: A.org.id, externalKey: "djen:8202" } });
    expect(asLawyer.latest.some((n) => n.id === secretNotice.id)).toBe(false);
    expect(owner.latest.some((n) => n.id === secretNotice.id)).toBe(true);

    // outro escritório não vê nada
    const other = await getBoxOverview(B.ctx);
    expect(other.inbox.total).toBe(0);
    expect(other.latest).toEqual([]);
    expect(other.health.sources).toEqual([]);
  });

  it("visão geral: a saúde mostra a fonte com a frase em português simples; admin vê o setup, outros não", async () => {
    const o = await getBoxOverview(A.ctx);
    const src = o.health.sources.find((s) => s.detail === "OAB 81001/BA")!;
    expect(src).toBeDefined();
    expect(src.headline).not.toMatch(/SOAP|WSDL|endpoint|MNI|HTTP/i);
    expect(o.health.admin).toBe(true);
    expect((await getBoxOverview(lawyer.ctx)).health.admin).toBe(false);
  });

  it("Processos: vincula só quando há UM processo; sem cadastro pede confirmação (e não cria processo); sigilo respeitado", async () => {
    // o banco impede dois processos com o mesmo número no escritório; a regra de ambiguidade (decideCaseMatch) é testada à parte

    const owner = await getBoxCases(A.ctx);
    expect(owner.cases.find((c) => c.caseId === openCaseId)).toMatchObject({ title: "Processo aberto", communications: 1 });
    expect(owner.cases.some((c) => c.title === "Processo sigiloso")).toBe(true);
    const states = Object.fromEntries(owner.pending.map((p) => [p.caseNumber, p.state]));
    expect(states[unknown]).toBe("NOT_FOUND");
    expect(await db.case.count({ where: { organizationId: A.org.id, number: unknown } })).toBe(0); // não criou processo

    const asLawyer = await getBoxCases(lawyer.ctx);
    expect(asLawyer.cases.some((c) => c.title === "Processo sigiloso")).toBe(false);
    expect(asLawyer.cases.some((c) => c.caseId === openCaseId)).toBe(true);

    expect(await getBoxCases(B.ctx)).toEqual({ cases: [], pending: [], pendingTotal: 0 });
  });
});
