import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import type { CreateCaseInput } from "@/modules/cases/schemas";
import type { ClientInput } from "@/modules/clients/schemas";
import { createCase } from "@/server/services/case.service";
import { createClient } from "@/server/services/client.service";
import { listClientCasesForBulk, planBulkUpload, undoBulkUpload } from "@/server/services/document-bulk.service";
import { addDocumentVersion, uploadDocument } from "@/server/services/document.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const clientBase: ClientInput = {
  type: "PERSON", status: "ACTIVE", name: "", tradeName: "", document: "", email: "", phone: "", birthDate: "", tags: "",
  notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "",
};
const caseBase: CreateCaseInput = {
  number: "", legacyNumber: "", title: "Ação", area: "Cível", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "",
  status: "ACTIVE", phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF",
};
function cnj(seq: number) {
  const p = { sequence: String(seq).padStart(7, "0"), year: "2024", segment: "8", court: "26", origin: "0100" };
  return `${p.sequence}-${computeCnjCheck(p)}.${p.year}.${p.segment}.${p.court}.${p.origin}`;
}
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("envio de documentos em lote", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  let maria: { id: string };
  let openCase: { id: string; number: string | null };
  let secretCase: { id: string; number: string | null };
  const seq = Math.floor(Math.random() * 9_000_000) + 1_000_000;

  beforeAll(async () => {
    A = await makeOrgWithOwner("bulk-A");
    B = await makeOrgWithOwner("bulk-B");
    finance = await addMember(A.org.id, "FINANCE", "bulk-finance");
    maria = await createClient(A.ctx, { ...clientBase, name: "Maria Lote Silva", document: "529.982.247-25" });
    openCase = await createCase(A.ctx, { ...caseBase, number: cnj(seq), title: "Aberto", clientId: maria.id });
    secretCase = await createCase(A.ctx, { ...caseBase, number: cnj(seq + 1), title: "Sigiloso", confidential: true });
    await createClient(B.ctx, { ...clientBase, name: "Cliente Só do B" });
  });

  it("sugere processo, cliente e aponta duplicados sem gravar nada", async () => {
    const existing = await uploadDocument(A.ctx, { clientId: maria.id }, { name: "rg.txt", buffer: Buffer.from("rg da maria") });
    const before = await db.document.count({ where: { organizationId: A.org.id } });
    const plan = await planBulkUpload(A.ctx, [
      { path: `Backup/${openCase.number} sentenca.pdf`, sha256: sha("x1"), size: 10 },
      { path: "Backup/Maria Lote Silva/rg.txt", sha256: existing.sha256, size: 11 },
      { path: "Backup/Cliente Só do B/a.pdf", sha256: sha("x2"), size: 10 },
    ]);
    expect(plan.rows[0]).toMatchObject({ owner: { kind: "case", id: openCase.id }, duplicate: null });
    expect(plan.rows[1]).toMatchObject({ owner: { kind: "client", id: maria.id }, duplicate: { documentId: existing.id, where: "cliente Maria Lote Silva" } });
    expect(plan.rows[2]!.owner).toBeNull(); // cliente de outro escritório nunca é sugerido
    expect(plan.storage.usedBytes).toBeGreaterThan(0);
    expect(await db.document.count({ where: { organizationId: A.org.id } })).toBe(before);
  });

  it("não revela processo sigiloso a quem não participa dele", async () => {
    const owner = await planBulkUpload(A.ctx, [{ path: `${secretCase.number}.pdf`, sha256: sha("s"), size: 1 }]);
    expect(owner.rows[0]!.owner).toMatchObject({ kind: "case", id: secretCase.id });
    const lawyer = await addMember(A.org.id, "LAWYER", "bulk-lawyer");
    const other = await planBulkUpload(lawyer.ctx, [{ path: `${secretCase.number}.pdf`, sha256: sha("s"), size: 1 }]);
    expect(other.rows[0]!.owner).toBeNull();
    expect((await listClientCasesForBulk(lawyer.ctx, maria.id)).map((c) => c.id)).toEqual([openCase.id]);
  });

  it("exige permissão de escrita e limita o tamanho do lote", async () => {
    await expect(planBulkUpload(finance.ctx, [{ path: "a.pdf", sha256: sha("a"), size: 1 }])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(undoBulkUpload(finance.ctx, [])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(planBulkUpload(A.ctx, [])).rejects.toBeInstanceOf(ValidationError);
  });

  it("desfaz só o que a própria pessoa enviou e ainda está na versão 1", async () => {
    const mine = await uploadDocument(A.ctx, { caseId: openCase.id }, { name: "a.txt", buffer: Buffer.from("a") });
    const edited = await uploadDocument(A.ctx, { caseId: openCase.id }, { name: "b.txt", buffer: Buffer.from("b") });
    await addDocumentVersion(A.ctx, edited.id, { name: "b.txt", buffer: Buffer.from("b2") });
    const lawyer = await addMember(A.org.id, "LAWYER", "bulk-lawyer2");
    const someoneElse = await uploadDocument(lawyer.ctx, { caseId: openCase.id }, { name: "c.txt", buffer: Buffer.from("c") });
    const foreign = await uploadDocument(B.ctx, { clientId: (await createClient(B.ctx, { ...clientBase, name: "Outro B" })).id }, { name: "d.txt", buffer: Buffer.from("d") });

    const result = await undoBulkUpload(A.ctx, [mine.id, edited.id, someoneElse.id, foreign.id]);
    expect(result).toEqual({ removed: 1, kept: 3 });
    const alive = await db.document.findMany({ where: { id: { in: [mine.id, edited.id, someoneElse.id, foreign.id] }, deletedAt: null }, select: { id: true } });
    expect(alive.map((d) => d.id).sort()).toEqual([edited.id, someoneElse.id, foreign.id].sort());
  });
});
