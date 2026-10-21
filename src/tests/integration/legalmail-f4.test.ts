import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import type { DatajudResult } from "@/lib/datajud/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { createImportBatch, getImportBatch, listImportBatches, processBatchStep, type BatchInput } from "@/server/services/case-import.service";
import { createCase } from "@/server/services/case.service";
import { setOrgDatajudEnabled } from "@/server/services/datajud.service";
import { createClient } from "@/server/services/client.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const cnj = (seq: string) => `${seq}-${computeCnjCheck({ sequence: seq, year: "2024", segment: "8", court: "05", origin: "0001" })}.2024.8.05.0001`;
const base: BatchInput = { numbers: "", clientId: "", clientRole: "PLAINTIFF", datajud: false, autos: false, updateExisting: false };
const found = (n = 2): DatajudResult => ({
  alias: "tjba", found: true, classe: "Procedimento Comum", orgaoJulgador: "1ª Vara", grau: "G1", assuntos: [], ajuizadoEm: null,
  movements: Array.from({ length: n }, (_, i) => ({ code: 1 + i, name: `Mov ${i}`, at: new Date(Date.UTC(2024, 2, 1 + i, 10)), complements: [] })),
});
const emptyCase = { number: "", legacyNumber: "", title: "Pré-existente", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };

describe("3.0-F4 — importação de processos em lote", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  const prev = process.env.DATAJUD_API_KEY;

  beforeAll(async () => {
    A = await makeOrgWithOwner("l3f4-a");
    B = await makeOrgWithOwner("l3f4-b");
    lawyer = await addMember(A.org.id, "LAWYER", "l3f4-adv");
    finance = await addMember(A.org.id, "FINANCE", "l3f4-fin");
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.DATAJUD_API_KEY;
    else process.env.DATAJUD_API_KEY = prev;
  });

  it("cria os válidos, anota inválidos/repetidos/existentes sem derrubar o lote e é isolado por escritório", async () => {
    await createCase(A.ctx, { ...emptyCase, number: cnj("0000010") });
    await expect(createImportBatch(finance.ctx, { ...base, numbers: cnj("0000011") })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createImportBatch(lawyer.ctx, { ...base, numbers: "  " })).rejects.toBeInstanceOf(ValidationError);
    const many = Array.from({ length: 201 }, (_, i) => cnj(String(100 + i).padStart(7, "0"))).join("\n");
    await expect(createImportBatch(lawyer.ctx, { ...base, numbers: many })).rejects.toBeInstanceOf(ValidationError);

    const client = await createClient(A.ctx, { type: "PERSON", status: "ACTIVE", name: "Cliente do lote", tradeName: "", document: "", email: "", phone: "", birthDate: "", tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "" });
    const r = await createImportBatch(lawyer.ctx, { ...base, clientId: client.id, numbers: [cnj("0000011"), cnj("0000012"), cnj("0000011"), "lixo", cnj("0000010"), "0000013-99.2024.8.05.0001"].join("\n") });
    expect(r).toMatchObject({ total: 6, created: 2 });
    const b = await getImportBatch(lawyer.ctx, r.id);
    expect(b.items.map((i) => i.createStatus)).toEqual(["CREATED", "CREATED", "DUPLICATE", "INVALID", "EXISTS", "INVALID"]);
    expect(b.totals).toMatchObject({ created: 2, exists: 1, invalid: 2, duplicate: 1, pending: 0 });
    // processos criados com o cliente como parte
    const created = await db.case.findMany({ where: { id: { in: b.items.filter((i) => i.createStatus === "CREATED").map((i) => i.caseId!) } }, include: { parties: true } });
    expect(created.every((c) => c.parties.some((p) => p.clientId === client.id && p.isOurClient))).toBe(true);
    // reimportar o mesmo número não duplica
    const again = await createImportBatch(lawyer.ctx, { ...base, numbers: cnj("0000011") });
    expect(again.created).toBe(0);
    expect(await db.case.count({ where: { organizationId: A.org.id, number: cnj("0000011") } })).toBe(1);
    // isolamento
    await expect(getImportBatch(B.ctx, r.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(processBatchStep(B.ctx, r.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listImportBatches(B.ctx)).toEqual([]);
    // o mesmo número em outro escritório é outro processo
    const other = await createImportBatch(B.ctx, { ...base, numbers: cnj("0000011") });
    expect(other.created).toBe(1);
  });

  it("DataJud em passos: cada item falha sozinho, retoma até zerar e atualiza existentes só se pedido", async () => {
    process.env.DATAJUD_API_KEY = "chave-teste";
    await setOrgDatajudEnabled(A.ctx, true);
    const nums = [cnj("0000021"), cnj("0000022"), cnj("0000023"), cnj("0000024"), cnj("0000025"), cnj("0000026"), cnj("0000027")];
    const r = await createImportBatch(lawyer.ctx, { ...base, datajud: true, numbers: nums.join("\n") });
    expect((await getImportBatch(lawyer.ctx, r.id)).totals.pending).toBe(7);
    const calls: string[] = [];
    const fetcher = async (n: string) => {
      calls.push(n);
      if (n === nums[1]) throw new Error("CNJ fora do ar");
      return found(2);
    };
    const s1 = await processBatchStep(lawyer.ctx, r.id, { fetcher });
    expect(s1.remaining).toBe(2); // 5 por passo
    const s2 = await processBatchStep(lawyer.ctx, r.id, { fetcher });
    expect(s2.remaining).toBe(0);
    expect((await processBatchStep(lawyer.ctx, r.id, { fetcher })).remaining).toBe(0);
    expect(calls).toHaveLength(7); // sem repetir chamadas
    const b = await getImportBatch(lawyer.ctx, r.id);
    expect(b.items.filter((i) => i.syncStatus === "OK")).toHaveLength(6);
    const bad = b.items.find((i) => i.syncStatus === "FAILED")!;
    expect(bad.number).toBe(nums[1]);
    expect(bad.syncMessage).toContain("fora do ar");
    expect(await db.caseEvent.count({ where: { caseId: b.items[0]!.caseId!, kind: "DATAJUD_MOVEMENT" } })).toBe(2);

    // existente: só atualiza com a opção
    const keep = await createImportBatch(lawyer.ctx, { ...base, datajud: true, numbers: nums[0]! });
    expect((await getImportBatch(lawyer.ctx, keep.id)).items[0]).toMatchObject({ createStatus: "EXISTS", syncStatus: "SKIPPED" });
    const upd = await createImportBatch(lawyer.ctx, { ...base, datajud: true, updateExisting: true, numbers: nums[0]! });
    expect((await getImportBatch(lawyer.ctx, upd.id)).items[0]!.syncStatus).toBe("PENDING");
  });

  it("DataJud desligado ou autos sem conexão: itens ficam anotados, sem erro nem laço infinito", async () => {
    await setOrgDatajudEnabled(A.ctx, false);
    const r = await createImportBatch(lawyer.ctx, { ...base, datajud: true, autos: true, numbers: cnj("0000031") });
    const b0 = await getImportBatch(lawyer.ctx, r.id);
    expect(b0.items[0]).toMatchObject({ syncStatus: "SKIPPED", autosStatus: "PENDING" });
    expect((await processBatchStep(lawyer.ctx, r.id)).remaining).toBe(0);
    const b1 = await getImportBatch(lawyer.ctx, r.id);
    expect(b1.items[0]).toMatchObject({ autosStatus: "SKIPPED" });
    expect(b1.items[0]!.autosMessage).toMatch(/Sem conexão/);
    await expect(createImportBatch(finance.ctx, { ...base, autos: true, numbers: cnj("0000032") })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
