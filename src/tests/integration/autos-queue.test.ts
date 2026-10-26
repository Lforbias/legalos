import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { enqueueAutos, latestAutosJob, retryAutos, runAutosQueue } from "@/server/services/autos-queue.service";
import { type ImportAutosResult, type importAutosMni } from "@/server/services/mni.service";
import { addMember, makeOrgWithOwner } from "./helpers";
const result = (extra: Partial<ImportAutosResult> = {}): ImportAutosResult => ({ listed: 61, imported: 25, remaining: 35, alreadyKnown: 0, skippedSecret: 0, skippedTooBig: 0, skippedUnsupported: 0, ...extra });
describe("fila persistente dos autos", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>, B: typeof A;
  let caseId: string;
  beforeAll(async () => {
    A = await makeOrgWithOwner("autos-queue-A"); B = await makeOrgWithOwner("autos-queue-B");
    caseId = (await db.case.create({ data: { organizationId: A.org.id, title: "Autos fila", number: "0001234-17.2024.5.05.0001", courtSystem: "pje-mni" } })).id;
    await db.courtConnection.create({ data: { organizationId: A.org.id, label: "Tribunal simulado", jtr: "5.05", endpointUrl: "https://example.test/ws", authMode: "PASSWORD", secretEnc: "somente-fixture", enabled: true } });
  });
  it("isola escritório, exige permissões e mantém só um pedido ativo mesmo com cliques concorrentes", async () => {
    const finance = await addMember(A.org.id, "FINANCE", "autos-queue-fin");
    await expect(enqueueAutos(finance.ctx, caseId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(latestAutosJob(B.ctx, caseId)).rejects.toBeInstanceOf(NotFoundError);
    const ids = await Promise.all([enqueueAutos(A.ctx, caseId), enqueueAutos(A.ctx, caseId)]);
    expect(new Set(ids).size).toBe(1);
    expect(await db.autosDownloadJob.count({ where: { organizationId: A.org.id } })).toBe(1);
  });
  it("persiste lotes, exclusões, progresso e notifica conclusão uma única vez", async () => {
    await runAutosQueue({ importer: async (_ctx, _case, _post, excluded, skip) => { expect(excluded).toEqual([]); skip?.("nao-suportado"); return result({ skippedUnsupported: 1 }); } });
    expect(await latestAutosJob(A.ctx, caseId)).toMatchObject({ status: "QUEUED", imported: 25, remaining: 35, skipped: 1 });
    await runAutosQueue({ importer: async (_ctx, _case, _post, excluded) => { expect(excluded).toEqual(["nao-suportado"]); return result({ imported: 25, remaining: 10 }); } });
    await runAutosQueue({ importer: async () => result({ imported: 10, remaining: 0 }) });
    expect(await latestAutosJob(A.ctx, caseId)).toMatchObject({ status: "COMPLETED", imported: 60, remaining: 0, skipped: 1 });
    await runAutosQueue({ importer: async () => { throw Error("não deve executar"); } });
    expect(await db.notification.count({ where: { organizationId: A.org.id, kind: "AUTOS_DOWNLOAD" } })).toBe(1);
  });
  it("lease impede workers concorrentes; recupera worker perdido e limita tentativas sem expor segredos", async () => {
    const id = await enqueueAutos(A.ctx, caseId);
    let release!: () => void;
    const waiting = new Promise<void>(r => { release = r; });
    let started!: () => void;
    const ready = new Promise<void>(r => { started = r; });
    const worker = runAutosQueue({ importer: async () => { started(); await waiting; return result({ remaining: 0 }); } });
    await ready;
    expect(await runAutosQueue()).toEqual({ processed: 0, completed: 0, failed: 0 });
    release(); await worker;
    // Simula queda após o claim, sem manter worker vivo.
    await db.autosDownloadJob.update({ where: { id }, data: { status: "RUNNING", leaseUntil: new Date(0), leaseToken: null } });
    const fail: typeof importAutosMni = async () => { throw Error("senha-secreta-externa"); };
    const now = new Date();
    for (let i = 0; i < 3; i++) await runAutosQueue({ importer: fail, now: new Date(now.getTime() + i * 5 * 60_000) });
    expect(await latestAutosJob(A.ctx, caseId)).toMatchObject({ status: "FAILED", attempts: 3 });
    expect(JSON.stringify(await latestAutosJob(A.ctx, caseId))).not.toContain("senha-secreta");
    await expect(retryAutos(B.ctx, caseId, id)).rejects.toBeInstanceOf(NotFoundError);
    await retryAutos(A.ctx, caseId, id);
    expect(await latestAutosJob(A.ctx, caseId)).toMatchObject({ status: "QUEUED", attempts: 0 });
    await expect(retryAutos(A.ctx, caseId, id)).rejects.toBeInstanceOf(ConflictError);
    await runAutosQueue({ importer: async () => result({ remaining: 0 }) });
  });
});
