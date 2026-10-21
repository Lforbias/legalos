import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import type { DatajudResult } from "@/lib/datajud/client";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { createCase } from "@/server/services/case.service";
import { datajudStatus, setOrgDatajudEnabled, syncCaseFromDatajud } from "@/server/services/datajud.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const mkCnj = (seq: string) => {
  const p = { sequence: seq, year: "2024", segment: "8", court: "26", origin: "0001" };
  return `${seq}-${computeCnjCheck(p)}.2024.8.26.0001`;
};
const result = (n = 2): DatajudResult => ({
  alias: "tjsp", found: true, classe: "Procedimento Comum", orgaoJulgador: "1ª Vara", grau: "G1", assuntos: [], ajuizadoEm: null,
  movements: Array.from({ length: n }, (_, i) => ({ code: 100 + i, name: `Movimento ${i}`, at: new Date(Date.UTC(2024, 2, 1 + i, 10)), complements: [] })),
});

describe("DataJud (Fase 8c) — HTTP simulado SÓ nos testes", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let fin: Awaited<ReturnType<typeof addMember>>;
  let c1: { id: string };
  const prev = process.env.DATAJUD_API_KEY;

  beforeAll(async () => {
    A = await makeOrgWithOwner("dj-A");
    B = await makeOrgWithOwner("dj-B");
    fin = await addMember(A.org.id, "FINANCE", "dj-fin");
    c1 = await createCase(A.ctx, { ...caseBase, title: "Com número", number: mkCnj("0001234") });
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.DATAJUD_API_KEY;
    else process.env.DATAJUD_API_KEY = prev;
  });

  it("ligar exige integrations:manage; sem chave ou desligado recusa", async () => {
    await expect(setOrgDatajudEnabled(fin.ctx, true)).rejects.toBeInstanceOf(ForbiddenError);
    delete process.env.DATAJUD_API_KEY;
    await expect(syncCaseFromDatajud(A.ctx, c1.id, async () => result())).rejects.toThrow(/desligada neste escritório/);
    await setOrgDatajudEnabled(A.ctx, true);
    await expect(syncCaseFromDatajud(A.ctx, c1.id, async () => result())).rejects.toBeInstanceOf(ConflictError);
    expect((await datajudStatus(A.ctx)).keyConfigured).toBe(false);
  });

  it("importa andamentos sem duplicar e registra auditoria", async () => {
    process.env.DATAJUD_API_KEY = "chave-teste";
    const r1 = await syncCaseFromDatajud(A.ctx, c1.id, async () => result(2));
    expect(r1.imported).toBe(2);
    const r2 = await syncCaseFromDatajud(A.ctx, c1.id, async () => result(3));
    expect(r2.imported).toBe(1);
    const evs = await db.caseEvent.findMany({ where: { caseId: c1.id, kind: "DATAJUD_MOVEMENT" } });
    expect(evs).toHaveLength(3);
    expect(evs.every((e) => e.source === "IMPORTED")).toBe(true);
    expect((await db.case.findUniqueOrThrow({ where: { id: c1.id } })).datajudSyncedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "datajud.sync" } })).toBe(2);
  });

  it("recusas: sem permissão, sem número, sigiloso, outro escritório", async () => {
    process.env.DATAJUD_API_KEY = "chave-teste";
    const noNum = await createCase(A.ctx, { ...caseBase, title: "Sem número" });
    const secret = await createCase(A.ctx, { ...caseBase, title: "Sigilo", confidential: true, number: mkCnj("0007777") });
    await expect(syncCaseFromDatajud(fin.ctx, c1.id, async () => result())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(syncCaseFromDatajud(A.ctx, noNum.id, async () => result())).rejects.toBeInstanceOf(ValidationError);
    let called = false;
    await expect(syncCaseFromDatajud(A.ctx, secret.id, async () => ((called = true), result()))).rejects.toThrow(/sigilosos/);
    expect(called).toBe(false);
    await expect(syncCaseFromDatajud(B.ctx, c1.id, async () => result())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("processo não encontrado no DataJud não importa nada", async () => {
    process.env.DATAJUD_API_KEY = "chave-teste";
    const c = await createCase(A.ctx, { ...caseBase, title: "Não publicado", number: mkCnj("0002345") });
    const r = await syncCaseFromDatajud(A.ctx, c.id, async () => ({ ...result(0), found: false }));
    expect(r.found).toBe(false);
    expect(r.imported).toBe(0);
  });
});
