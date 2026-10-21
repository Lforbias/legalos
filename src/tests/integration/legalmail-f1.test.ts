import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import type { CreateCaseInput } from "@/modules/cases/schemas";
import { addParty, createCase, getCase, listCaseEvents, listCases, setCaseAcervo } from "@/server/services/case.service";
import { addBulkNote, addCaseNoteItem, deleteCaseNote, listCaseNotes, setNotePinned } from "@/server/services/case-note.service";
import { createCustomField, listCustomFields, setCaseCustomFields, setCustomFieldActive } from "@/server/services/custom-field.service";
import { casesOfRegistryParty, createRegistryParty, deleteRegistryParty, listRegistry, searchRegistry, updateRegistryParty } from "@/server/services/party-registry.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const caseBase: CreateCaseInput = {
  number: "", legacyNumber: "", title: "Processo", area: "Cível", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "",
  status: "ACTIVE", phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF",
};
const reg = { kind: "COMPANY" as const, name: "Banco Exemplo S.A.", document: "00.000.000/0001-91", profession: "Instituição financeira", issuingOrgan: "", email: "", phone: "", notes: "" };

describe("3.0-F1 — partes únicas, campos personalizados, acervo e notas", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  let c1: { id: string };
  let c2: { id: string };
  let secret: { id: string };
  let cB: { id: string };

  beforeAll(async () => {
    A = await makeOrgWithOwner("l3f1-a");
    B = await makeOrgWithOwner("l3f1-b");
    lawyer = await addMember(A.org.id, "LAWYER", "l3f1-adv");
    assistant = await addMember(A.org.id, "ASSISTANT", "l3f1-ass");
    c1 = await createCase(A.ctx, { ...caseBase, title: "Caso 1" });
    c2 = await createCase(A.ctx, { ...caseBase, title: "Caso 2" });
    secret = await createCase(A.ctx, { ...caseBase, title: "Caso sigiloso", confidential: true });
    cB = await createCase(B.ctx, { ...caseBase, title: "Caso de outro escritório" });
  });

  describe("cadastro único de partes", () => {
    it("cria, busca por nome e por documento, e recusa documento repetido", async () => {
      const row = await createRegistryParty(lawyer.ctx, reg);
      expect(row.document).toBe("00000000000191");
      expect((await searchRegistry(lawyer.ctx, "exemplo")).map((r) => r.id)).toContain(row.id);
      expect((await listRegistry(lawyer.ctx, { q: "00.000.000/0001-91" })).items.map((r) => r.id)).toContain(row.id);
      await expect(createRegistryParty(lawyer.ctx, { ...reg, name: "Outro nome" })).rejects.toBeInstanceOf(ConflictError);
      await expect(createRegistryParty(assistant.ctx, { ...reg, name: "X Y", document: "" })).rejects.toBeInstanceOf(ForbiddenError);
      expect(await searchRegistry(lawyer.ctx, "e")).toEqual([]);
    });

    it("reaproveita a mesma parte em vários processos e propaga a edição do nome", async () => {
      const row = (await listRegistry(lawyer.ctx, { q: "Banco Exemplo" })).items[0]!;
      await addParty(lawyer.ctx, c1.id, { role: "DEFENDANT", clientId: "", registryId: row.id, name: "", document: "", lawyerName: "Dr. Fulano" });
      await addParty(lawyer.ctx, c2.id, { role: "DEFENDANT", clientId: "", registryId: row.id, name: "", document: "", lawyerName: "" });
      await expect(addParty(lawyer.ctx, c1.id, { role: "DEFENDANT", clientId: "", registryId: row.id, name: "", document: "", lawyerName: "" })).rejects.toBeInstanceOf(ConflictError);
      const p = (await getCase(lawyer.ctx, c1.id)).parties[0]!;
      expect(p.name).toBe("Banco Exemplo S.A.");
      expect(p.registryId).toBe(row.id);
      expect(p.lawyerName).toBe("Dr. Fulano");
      expect((await casesOfRegistryParty(lawyer.ctx, row.id)).map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());
      await updateRegistryParty(lawyer.ctx, row.id, { ...reg, name: "Banco Exemplo Brasil S.A." });
      expect((await getCase(lawyer.ctx, c2.id)).parties[0]!.name).toBe("Banco Exemplo Brasil S.A.");
    });

    it("guarda no cadastro uma parte digitada à mão (e reaproveita pelo documento)", async () => {
      await addParty(lawyer.ctx, c1.id, { role: "PLAINTIFF", clientId: "", saveToRegistry: true, name: "Joana Adversa", document: "529.982.247-25", lawyerName: "" });
      await addParty(lawyer.ctx, c2.id, { role: "PLAINTIFF", clientId: "", saveToRegistry: true, name: "Joana Adversa", document: "529.982.247-25", lawyerName: "" });
      const found = (await listRegistry(lawyer.ctx, { q: "Joana" })).items;
      expect(found).toHaveLength(1);
      expect(found[0]!._count.caseParties).toBe(2);
    });

    it("exclusão é lógica: os processos mantêm os dados da parte", async () => {
      const row = (await listRegistry(lawyer.ctx, { q: "Joana" })).items[0]!;
      await deleteRegistryParty(lawyer.ctx, row.id);
      expect((await listRegistry(lawyer.ctx, { q: "Joana" })).items).toHaveLength(0);
      expect((await getCase(lawyer.ctx, c1.id)).parties.some((p) => p.name === "Joana Adversa")).toBe(true);
    });

    it("isolamento: outro escritório não vê nem usa a parte", async () => {
      const row = (await listRegistry(lawyer.ctx, { q: "Banco Exemplo" })).items[0]!;
      expect(await searchRegistry(B.ctx, "Banco Exemplo")).toEqual([]);
      await expect(addParty(B.ctx, cB.id, { role: "DEFENDANT", clientId: "", registryId: row.id, name: "", document: "", lawyerName: "" })).rejects.toBeInstanceOf(ValidationError);
      await expect(updateRegistryParty(B.ctx, row.id, reg)).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteRegistryParty(B.ctx, row.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("campos personalizados", () => {
    it("só quem administra define campos; chave é estável e nome repetido é recusado", async () => {
      await expect(createCustomField(lawyer.ctx, { label: "Pasta física", type: "TEXT", options: "" })).rejects.toBeInstanceOf(ForbiddenError);
      const f = await createCustomField(A.ctx, { label: "Número da pasta", type: "TEXT", options: "" });
      expect(f.key).toBe("numero_da_pasta");
      await expect(createCustomField(A.ctx, { label: "Número da Pasta", type: "TEXT", options: "" })).rejects.toBeInstanceOf(ConflictError);
      await createCustomField(A.ctx, { label: "Risco", type: "SELECT", options: "Baixo\nMédio\nAlto" });
      await createCustomField(A.ctx, { label: "Perícia em", type: "DATE", options: "" });
      await createCustomField(A.ctx, { label: "Valor estimado", type: "NUMBER", options: "" });
      await expect(createCustomField(A.ctx, { label: "Lista curta", type: "SELECT", options: "Só uma" })).rejects.toThrow();
      expect(await listCustomFields(B.ctx)).toHaveLength(0);
    });

    it("valida por tipo, grava, registra na linha do tempo e apaga com valor vazio", async () => {
      await expect(setCaseCustomFields(lawyer.ctx, c1.id, { risco: "Altíssimo" })).rejects.toBeInstanceOf(ValidationError);
      await expect(setCaseCustomFields(lawyer.ctx, c1.id, { pericia_em: "2026-13-40" })).rejects.toBeInstanceOf(ValidationError);
      await expect(setCaseCustomFields(lawyer.ctx, c1.id, { valor_estimado: "abc" })).rejects.toBeInstanceOf(ValidationError);
      await expect(setCaseCustomFields(lawyer.ctx, c1.id, { inexistente: "x" })).rejects.toBeInstanceOf(ValidationError);
      await expect(setCaseCustomFields(assistant.ctx, c1.id, { risco: "Alto" })).rejects.toBeInstanceOf(ForbiddenError);
      await setCaseCustomFields(lawyer.ctx, c1.id, { numero_da_pasta: "PF-123", risco: "Alto", valor_estimado: "1500,50", pericia_em: "" });
      const c = await getCase(lawyer.ctx, c1.id);
      expect(c.customFields).toEqual({ numero_da_pasta: "PF-123", risco: "Alto", valor_estimado: "1500.50" });
      expect((await listCaseEvents(lawyer.ctx, c1.id)).some((e) => e.kind === "CUSTOM_FIELDS")).toBe(true);
      await setCaseCustomFields(lawyer.ctx, c1.id, { numero_da_pasta: "", risco: "Alto", valor_estimado: "1500,50" });
      expect((await getCase(lawyer.ctx, c1.id)).customFields).toEqual({ risco: "Alto", valor_estimado: "1500.50" });
      await expect(setCaseCustomFields(B.ctx, c1.id, { risco: "Alto" })).rejects.toBeInstanceOf(NotFoundError);
    });

    it("campo desativado some do formulário mas preserva o valor já gravado", async () => {
      const risco = (await listCustomFields(A.ctx)).find((f) => f.key === "risco")!;
      await setCustomFieldActive(A.ctx, risco.id, false);
      expect((await listCustomFields(A.ctx)).some((f) => f.key === "risco")).toBe(false);
      await expect(setCaseCustomFields(lawyer.ctx, c1.id, { risco: "Baixo" })).rejects.toBeInstanceOf(ValidationError);
      await setCaseCustomFields(lawyer.ctx, c1.id, { valor_estimado: "10" });
      expect((await getCase(lawyer.ctx, c1.id)).customFields).toEqual({ risco: "Alto", valor_estimado: "10" });
    });
  });

  describe("acervo", () => {
    it("move para o acervo sem excluir, filtra as listas e devolve à carteira", async () => {
      await setCaseAcervo(lawyer.ctx, c2.id, true);
      expect((await listCases(lawyer.ctx, {})).items.some((c) => c.id === c2.id)).toBe(false);
      expect((await listCases(lawyer.ctx, { acervo: "only" })).items.map((c) => c.id)).toEqual([c2.id]);
      expect((await listCases(lawyer.ctx, { acervo: "all" })).items.some((c) => c.id === c2.id)).toBe(true);
      expect((await listCaseEvents(lawyer.ctx, c2.id)).some((e) => e.kind === "ACERVO_IN")).toBe(true);
      await expect(setCaseAcervo(assistant.ctx, c2.id, false)).rejects.toBeInstanceOf(ForbiddenError);
      await setCaseAcervo(lawyer.ctx, c2.id, false);
      expect((await listCases(lawyer.ctx, {})).items.some((c) => c.id === c2.id)).toBe(true);
      await expect(setCaseAcervo(B.ctx, c2.id, true)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("notas fixas e em lote", () => {
    it("nota fixada aparece primeiro; fixar/desafixar e excluir exigem permissão", async () => {
      const n1 = await addCaseNoteItem(lawyer.ctx, c1.id, { title: "Comum", body: "Primeira nota", pinned: false });
      const n2 = await addCaseNoteItem(lawyer.ctx, c1.id, { title: "", body: "Importante", pinned: true });
      expect((await listCaseNotes(lawyer.ctx, c1.id)).map((n) => n.id)).toEqual([n2.id, n1.id]);
      await setNotePinned(lawyer.ctx, n1.id, true);
      expect((await listCaseNotes(lawyer.ctx, c1.id))[0]!.pinned).toBe(true);
      await expect(setNotePinned(assistant.ctx, n1.id, false)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteCaseNote(B.ctx, n1.id)).rejects.toBeInstanceOf(NotFoundError);
      await deleteCaseNote(lawyer.ctx, n1.id);
      expect(await listCaseNotes(lawyer.ctx, c1.id)).toHaveLength(1);
      await expect(addCaseNoteItem(lawyer.ctx, c1.id, { title: "", body: "x", pinned: false })).rejects.toThrow();
    });

    it("nota em lote: aplica a todos ou a nenhum, respeita sigilo, isolamento e o limite de 50", async () => {
      const r = await addBulkNote(lawyer.ctx, { title: "Aviso", body: "Mudança de endereço do escritório", pinned: true, caseIds: [c1.id, c2.id, c2.id] });
      expect(r.count).toBe(2);
      for (const id of [c1.id, c2.id]) {
        const notes = await listCaseNotes(lawyer.ctx, id);
        expect(notes.find((n) => n.bulkId === r.bulkId)?.pinned).toBe(true);
      }
      // um processo de outro escritório derruba o lote inteiro
      await expect(addBulkNote(lawyer.ctx, { title: "", body: "Nota que não deve gravar", pinned: false, caseIds: [c1.id, cB.id] })).rejects.toBeInstanceOf(NotFoundError);
      expect(await db.caseNote.count({ where: { body: "Nota que não deve gravar" } })).toBe(0);
      // sigilo: o advogado não é membro do processo sigiloso
      await expect(addBulkNote(lawyer.ctx, { title: "", body: "Nota sigilosa", pinned: false, caseIds: [c1.id, secret.id] })).rejects.toBeInstanceOf(NotFoundError);
      await expect(addBulkNote(assistant.ctx, { title: "", body: "Sem permissão", pinned: false, caseIds: [c1.id] })).rejects.toBeInstanceOf(ForbiddenError);
      const many = Array.from({ length: 51 }, () => crypto.randomUUID());
      await expect(addBulkNote(lawyer.ctx, { title: "", body: "Muitos", pinned: false, caseIds: many })).rejects.toThrow();
    });
  });
});
