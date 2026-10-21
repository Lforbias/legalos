import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { createMonitor, deleteMonitor, listMonitors, runDjenAll, setMonitorEnabled, syncDjen } from "@/server/services/djen.service";
import { createCase } from "@/server/services/case.service";
import { djenItem, djenPage } from "../fixtures/djen-samples";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TRT5", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const cnj = `0002345-${computeCnjCheck({ sequence: "0002345", year: "2024", segment: "5", court: "05", origin: "0001" })}.2024.5.05.0001`;
const digits = cnj.replace(/\D/g, "");
const ok = (items: unknown[]) => async () => ({ status: 200, body: djenPage(items) });

describe("monitoramento do DJEN (Etapa 2a) — respostas SIMULADAS só nos testes", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let monId = "";

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    A = await makeOrgWithOwner("djen-A");
    B = await makeOrgWithOwner("djen-B");
    lawyer = await addMember(A.org.id, "LAWYER", "djen-law");
    const owner = await db.user.findUniqueOrThrow({ where: { id: A.ctx.userId } });
    const s = await startEnrollment(owner.id, owner.email);
    await confirmEnrollment(owner.id, totpCode(s.secret, totpStep()), META);
  });

  it("cadastro valida OAB/UF, impede duplicata e exige permissão", async () => {
    await expect(createMonitor(lawyer.ctx, { label: "x", oabNumber: "1", oabUf: "BA" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createMonitor(A.ctx, { label: "Dra", oabNumber: "abc", oabUf: "BA" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createMonitor(A.ctx, { label: "Dra", oabNumber: "12345", oabUf: "XX" })).rejects.toBeInstanceOf(ValidationError);
    const m = await createMonitor(A.ctx, { label: "Dra. Talita", oabNumber: "012345", oabUf: "ba" });
    monId = m.id;
    await expect(createMonitor(A.ctx, { label: "Outra", oabNumber: "12345", oabUf: "BA" })).rejects.toBeInstanceOf(ValidationError);
    expect((await listMonitors(A.ctx))[0]).toMatchObject({ oabNumber: "12345", oabUf: "BA" });
    expect(await listMonitors(B.ctx)).toHaveLength(0);
  });

  it("sincroniza: importa, vincula ao processo, ignora cancelada e repetida, isola escritórios", async () => {
    await createCase(A.ctx, { ...caseBase, number: cnj });
    const items = [djenItem({ id: 1, numero_processo: digits, tipoDocumento: "Sentença" }), djenItem({ id: 2, texto: "Intimação para audiência una no dia 20." }), djenItem({ id: 3, ativo: false })];
    const r = await syncDjen(A.ctx, monId, { http: ok(items), pauseMs: 0 });
    expect(r).toMatchObject({ found: 3, imported: 2, cancelled: 1, alreadyKnown: 0 });
    const notices = await db.courtNotice.findMany({ where: { organizationId: A.org.id, externalKey: { startsWith: "djen:" } }, orderBy: { externalKey: "asc" } });
    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({ source: "IMPORTED", kind: "SENTENCA", caseNumber: cnj });
    expect(notices[0]!.caseId).not.toBeNull();
    expect(notices[1]!.content).toContain("audiência una");
    const again = await syncDjen(A.ctx, monId, { http: ok(items), pauseMs: 0 });
    expect(again).toMatchObject({ imported: 0, alreadyKnown: 2 });
    expect(await db.courtNotice.count({ where: { organizationId: B.org.id } })).toBe(0);
    await expect(syncDjen(B.ctx, monId, { http: ok([]), pauseMs: 0 })).rejects.toBeInstanceOf(NotFoundError);
    const row = (await listMonitors(A.ctx))[0]!;
    expect(row.lastStatus).toBe("OK");
  });

  it("janela: primeira vez 7 dias, depois retoma com sobreposição; erro não avança a janela", async () => {
    const urls: string[] = [];
    const spy = async (u: string) => (urls.push(u), { status: 200, body: djenPage([]) });
    await db.djenMonitor.update({ where: { id: monId }, data: { lastWindowEnd: null } });
    await syncDjen(A.ctx, monId, { http: spy, pauseMs: 0 });
    const m1 = await db.djenMonitor.findUniqueOrThrow({ where: { id: monId } });
    expect(m1.lastWindowEnd).not.toBeNull();
    await syncDjen(A.ctx, monId, { http: spy, pauseMs: 0 });
    const q = (u: string) => new URL(u).searchParams;
    const span = (u: string) => (Date.parse(q(u).get("dataDisponibilizacaoFim")!) - Date.parse(q(u).get("dataDisponibilizacaoInicio")!)) / 86400000;
    expect(span(urls[0]!)).toBe(7);
    expect(span(urls[1]!)).toBe(2);
    const before = (await db.djenMonitor.findUniqueOrThrow({ where: { id: monId } })).lastWindowEnd;
    await expect(syncDjen(A.ctx, monId, { http: async () => ({ status: 403, body: "" }), pauseMs: 0 })).rejects.toBeInstanceOf(ConflictError);
    const after = await db.djenMonitor.findUniqueOrThrow({ where: { id: monId } });
    expect(after.lastWindowEnd).toEqual(before);
    expect(after.lastStatus).toBe("ERROR");
    expect(after.lastMessage).toMatch(/Brasil/);
  });

  it("execução automática percorre só os monitoramentos ligados e registra falhas", async () => {
    const r1 = await runDjenAll({ http: ok([djenItem({ id: 50 })]), pauseMs: 0 });
    expect(r1.ok).toBeGreaterThanOrEqual(1);
    await setMonitorEnabled(A.ctx, monId, false);
    const mine = await db.djenMonitor.count({ where: { id: monId, enabled: true } });
    expect(mine).toBe(0);
    await setMonitorEnabled(A.ctx, monId, true);
    const r2 = await runDjenAll({ http: async () => ({ status: 500, body: "" }), pauseMs: 0 });
    expect(r2.failed).toBeGreaterThanOrEqual(1);
  });

  it("remover exige 2FA e permissão; some só do próprio escritório", async () => {
    await expect(deleteMonitor(lawyer.ctx, monId)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteMonitor(A.ctx, monId);
    expect(await listMonitors(A.ctx)).toHaveLength(0);
  });
});
