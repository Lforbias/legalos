import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import type { CreateCaseInput } from "@/modules/cases/schemas";
import type { ClientInput } from "@/modules/clients/schemas";
import {
  addCaseMember, addCaseNote, addParty, archiveCase, changeCaseStatus, createCase, getCase, listCaseEvents, listCases, removeCaseMember, removeParty, updateCase,
} from "@/server/services/case.service";
import { addContact, archiveClient, createClient, deleteContact, getClient, listClients, updateClient, updateContact } from "@/server/services/client.service";
import { deleteDocument, getDocumentForDownload, listDocuments, uploadDocument } from "@/server/services/document.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const clientBase: ClientInput = {
  type: "PERSON", status: "ACTIVE", name: "Maria da Silva", tradeName: "", document: "", email: "", phone: "", birthDate: "", tags: "",
  notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "",
};
const caseBase: CreateCaseInput = {
  number: "", legacyNumber: "", title: "Ação de cobrança", area: "Cível", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "",
  status: "ACTIVE", phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF",
};
const cnj = (seq: string) => {
  const p = { sequence: seq, year: "2024", segment: "8", court: "26", origin: "0100" };
  return `${seq}-${computeCnjCheck(p)}.2024.8.26.0100`;
};
const pdf = Buffer.from("%PDF-1.4\n% teste\n");

describe("clientes e processos (Fase 2)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let aLawyer: Awaited<ReturnType<typeof addMember>>;
  let aLawyer2: Awaited<ReturnType<typeof addMember>>;
  let aAssistant: Awaited<ReturnType<typeof addMember>>;
  let aAdmin: Awaited<ReturnType<typeof addMember>>;
  let aFinance: Awaited<ReturnType<typeof addMember>>;
  let clientA: { id: string };
  let caseA: { id: string };

  beforeAll(async () => {
    A = await makeOrgWithOwner("fase2-A");
    B = await makeOrgWithOwner("fase2-B");
    aLawyer = await addMember(A.org.id, "LAWYER", "a-lawyer");
    aLawyer2 = await addMember(A.org.id, "LAWYER", "a-lawyer2");
    aAssistant = await addMember(A.org.id, "ASSISTANT", "a-assist");
    aAdmin = await addMember(A.org.id, "ADMIN", "a-admin");
    aFinance = await addMember(A.org.id, "FINANCE", "a-fin");
    clientA = await createClient(A.ctx, { ...clientBase, name: "Cliente A", document: "529.982.247-25" });
    caseA = await createCase(A.ctx, { ...caseBase, title: "Processo A", number: cnj("0000001"), clientId: clientA.id });
  });

  describe("clientes", () => {
    it("cria, normaliza documento e impede CPF duplicado no mesmo escritório (mas permite em outro)", async () => {
      const c = await db.client.findUniqueOrThrow({ where: { id: clientA.id } });
      expect(c.document).toBe("52998224725");
      await expect(createClient(A.ctx, { ...clientBase, name: "Outro", document: "529.982.247-25" })).rejects.toBeInstanceOf(ConflictError);
      await expect(createClient(B.ctx, { ...clientBase, name: "Cliente B", document: "529.982.247-25" })).resolves.toBeTruthy();
    });

    it("rejeita documento inválido na camada de serviço (revalidação no servidor)", async () => {
      await expect(createClient(A.ctx, { ...clientBase, document: "111.111.111-11" })).rejects.toThrow();
      await expect(createClient(A.ctx, { ...clientBase, type: "COMPANY", document: "529.982.247-25" })).rejects.toThrow();
    });

    it("atualiza, não permite trocar o tipo e audita", async () => {
      await updateClient(A.ctx, clientA.id, { ...clientBase, name: "Cliente A Editado", document: "52998224725", tags: "vip, trabalhista" });
      const c = await getClient(A.ctx, clientA.id);
      expect(c.name).toBe("Cliente A Editado");
      expect(c.tags).toEqual(["vip", "trabalhista"]);
      await expect(updateClient(A.ctx, clientA.id, { ...clientBase, type: "COMPANY", document: "11.222.333/0001-81" })).rejects.toBeInstanceOf(ValidationError);
      expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "client.update", resourceId: clientA.id } })).toBe(1);
    });

    it("lista com busca por nome/documento e paginação", async () => {
      const byName = await listClients(A.ctx, { q: "editado" });
      expect(byName.items.map((i) => i.id)).toContain(clientA.id);
      const byDoc = await listClients(A.ctx, { q: "529.982" });
      expect(byDoc.items.map((i) => i.id)).toContain(clientA.id);
      expect((await listClients(A.ctx, { q: "zzzz-nao-existe" })).total).toBe(0);
    });

    it("contatos: apenas um principal por cliente", async () => {
      const c1 = await addContact(A.ctx, clientA.id, { name: "João", role: "", email: "JOAO@x.com", phone: "", isPrimary: true, notes: "" });
      const c2 = await addContact(A.ctx, clientA.id, { name: "Ana", role: "", email: "", phone: "11988887777", isPrimary: true, notes: "" });
      let contacts = (await getClient(A.ctx, clientA.id)).contacts;
      expect(contacts.filter((c) => c.isPrimary).map((c) => c.id)).toEqual([c2.id]);
      expect(contacts.find((c) => c.id === c1.id)?.email).toBe("joao@x.com");
      await updateContact(A.ctx, c1.id, { name: "João", role: "", email: "", phone: "", isPrimary: true, notes: "" });
      contacts = (await getClient(A.ctx, clientA.id)).contacts;
      expect(contacts.filter((c) => c.isPrimary).map((c) => c.id)).toEqual([c1.id]);
      await deleteContact(A.ctx, c2.id);
    });

    it("exclusão lógica exige clients:delete e é bloqueada com processo em andamento", async () => {
      await expect(archiveClient(aLawyer.ctx, clientA.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(archiveClient(A.ctx, clientA.id)).rejects.toBeInstanceOf(ConflictError);
      const temp = await createClient(A.ctx, { ...clientBase, name: "Temporário" });
      await archiveClient(aAdmin.ctx, temp.id);
      await expect(getClient(A.ctx, temp.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("perfil Assistente lê, mas não escreve", async () => {
      expect((await listClients(aAssistant.ctx)).total).toBeGreaterThan(0);
      await expect(createClient(aAssistant.ctx, clientBase)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateClient(aAssistant.ctx, clientA.id, clientBase)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("isolamento entre escritórios (IDOR)", () => {
    it("outro escritório não lê, edita, exclui nem lista clientes/processos de A", async () => {
      await expect(getClient(B.ctx, clientA.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(updateClient(B.ctx, clientA.id, clientBase)).rejects.toBeInstanceOf(NotFoundError);
      await expect(archiveClient(B.ctx, clientA.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(addContact(B.ctx, clientA.id, { name: "Intruso", role: "", email: "", phone: "", isPrimary: false, notes: "" })).rejects.toBeInstanceOf(NotFoundError);
      const contact = await db.clientContact.findFirstOrThrow({ where: { clientId: clientA.id } });
      await expect(updateContact(B.ctx, contact.id, { name: "x", role: "", email: "", phone: "", isPrimary: false, notes: "" })).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteContact(B.ctx, contact.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listClients(B.ctx)).items.every((i) => i.id !== clientA.id)).toBe(true);

      await expect(getCase(B.ctx, caseA.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(updateCase(B.ctx, caseA.id, { ...caseBase })).rejects.toBeInstanceOf(NotFoundError);
      await expect(changeCaseStatus(B.ctx, caseA.id, "CLOSED")).rejects.toBeInstanceOf(NotFoundError);
      await expect(archiveCase(B.ctx, caseA.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(addCaseNote(B.ctx, caseA.id, { title: "", description: "invasão", occurredAt: "" })).rejects.toBeInstanceOf(NotFoundError);
      await expect(listCaseEvents(B.ctx, caseA.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listCases(B.ctx)).items.every((i) => i.id !== caseA.id)).toBe(true);
    });

    it("não é possível vincular cliente de outro escritório a um processo", async () => {
      await expect(createCase(B.ctx, { ...caseBase, title: "Roubo de cliente", clientId: clientA.id })).rejects.toBeInstanceOf(ValidationError);
      const caseB = await createCase(B.ctx, { ...caseBase, title: "Processo B" });
      await expect(addParty(B.ctx, caseB.id, { role: "PLAINTIFF", clientId: clientA.id, name: "", document: "", lawyerName: "" })).rejects.toBeInstanceOf(ValidationError);
    });

    it("não é possível definir como responsável alguém de fora do escritório", async () => {
      await expect(createCase(A.ctx, { ...caseBase, title: "Caso X", responsibleId: B.owner.id })).rejects.toBeInstanceOf(ValidationError);
      await expect(addCaseMember(A.ctx, caseA.id, B.owner.id, "COLLABORATOR")).rejects.toBeInstanceOf(ValidationError);
    });

    it("o banco recusa referência cruzada entre escritórios (FK composta)", async () => {
      await expect(
        db.$executeRaw`INSERT INTO case_parties (organization_id, case_id, role, name) VALUES (${B.org.id}::uuid, ${caseA.id}::uuid, 'OTHER', 'x')`,
      ).rejects.toThrow();
      await expect(
        db.$executeRaw`INSERT INTO client_contacts (organization_id, client_id, name) VALUES (${B.org.id}::uuid, ${clientA.id}::uuid, 'x')`,
      ).rejects.toThrow();
    });
  });

  describe("processos", () => {
    it("valida número CNJ e impede duplicidade no escritório", async () => {
      await expect(createCase(A.ctx, { ...caseBase, number: "0000001-00.2024.8.26.0100" })).rejects.toThrow();
      await expect(createCase(A.ctx, { ...caseBase, number: cnj("0000001") })).rejects.toBeInstanceOf(ConflictError);
      // o mesmo número pode existir em outro escritório
      await expect(createCase(B.ctx, { ...caseBase, number: cnj("0000001"), title: "mesmo número em B" })).resolves.toBeTruthy();
    });

    it("cria com responsável, parte do cliente e evento automático", async () => {
      const c = await getCase(A.ctx, caseA.id);
      expect(c.members.find((m) => m.role === "RESPONSIBLE")?.userId).toBe(A.owner.id);
      expect(c.parties).toHaveLength(1);
      expect(c.parties[0]?.isOurClient).toBe(true);
      const events = await listCaseEvents(A.ctx, caseA.id);
      expect(events.some((e) => e.kind === "CASE_CREATED" && e.source === "AUTOMATIC")).toBe(true);
    });

    it("linha do tempo distingue origem: anotação (interna) x automática; mudança de situação gera evento", async () => {
      await addCaseNote(aLawyer.ctx, caseA.id, { title: "Ligação", description: "Cliente pediu retorno", occurredAt: "" });
      await changeCaseStatus(aLawyer.ctx, caseA.id, "SUSPENDED");
      const internal = await listCaseEvents(A.ctx, caseA.id, "INTERNAL");
      expect(internal.map((e) => e.kind)).toEqual(["NOTE"]);
      const auto = await listCaseEvents(A.ctx, caseA.id, "AUTOMATIC");
      expect(auto.some((e) => e.kind === "STATUS_CHANGED")).toBe(true);
      expect(await listCaseEvents(A.ctx, caseA.id, "IMPORTED")).toHaveLength(0);
      await changeCaseStatus(aLawyer.ctx, caseA.id, "ACTIVE");
    });

    it("update registra campos alterados e troca de responsável mantém um único responsável", async () => {
      await updateCase(A.ctx, caseA.id, { ...caseBase, number: cnj("0000001"), title: "Processo A (novo título)", claimValue: "1.500,00", responsibleId: aLawyer.user.id });
      const c = await getCase(A.ctx, caseA.id);
      expect(c.title).toBe("Processo A (novo título)");
      expect(c.claimValue?.toString()).toBe("1500");
      const responsibles = c.members.filter((m) => m.role === "RESPONSIBLE");
      expect(responsibles.map((m) => m.userId)).toEqual([aLawyer.user.id]);
      const events = await listCaseEvents(A.ctx, caseA.id);
      expect(events.some((e) => e.kind === "CASE_UPDATED" && e.description?.includes("título"))).toBe(true);
      expect(events.some((e) => e.kind === "RESPONSIBLE_CHANGED")).toBe(true);
    });

    it("partes: não duplica cliente, adiciona parte contrária e remove", async () => {
      await expect(addParty(A.ctx, caseA.id, { role: "PLAINTIFF", clientId: clientA.id, name: "", document: "", lawyerName: "" })).rejects.toBeInstanceOf(ConflictError);
      const p = await addParty(A.ctx, caseA.id, { role: "DEFENDANT", clientId: "", name: "Empresa Ré S/A", document: "", lawyerName: "Dr. Fulano" });
      expect(p.isOurClient).toBe(false);
      await removeParty(A.ctx, caseA.id, p.id);
      expect((await getCase(A.ctx, caseA.id)).parties).toHaveLength(1);
    });

    it("permissões: assistente não cria; exclusão de processo exige cases:delete", async () => {
      await expect(createCase(aAssistant.ctx, caseBase)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(changeCaseStatus(aAssistant.ctx, caseA.id, "CLOSED")).rejects.toBeInstanceOf(ForbiddenError);
      const tmp = await createCase(aLawyer.ctx, { ...caseBase, title: "Para excluir" });
      await expect(archiveCase(aLawyer.ctx, tmp.id)).rejects.toBeInstanceOf(ForbiddenError);
      await archiveCase(aAdmin.ctx, tmp.id);
      await expect(getCase(A.ctx, tmp.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("busca por número (apenas dígitos), título e nome de parte", async () => {
      const byDigits = await listCases(A.ctx, { q: "0000001" + computeCnjCheck({ sequence: "0000001", year: "2024", segment: "8", court: "26", origin: "0100" }) });
      expect(byDigits.items.map((i) => i.id)).toContain(caseA.id);
      expect((await listCases(A.ctx, { q: "novo título" })).items.map((i) => i.id)).toContain(caseA.id);
      expect((await listCases(A.ctx, { q: "Cliente A Editado" })).items.map((i) => i.id)).toContain(caseA.id);
      expect((await listCases(A.ctx, { clientId: clientA.id })).items.map((i) => i.id)).toContain(caseA.id);
    });
  });

  describe("processos sigilosos", () => {
    let secret: { id: string };
    beforeAll(async () => {
      secret = await createCase(aLawyer.ctx, { ...caseBase, title: "Caso sigiloso", confidential: true });
    });

    it("só membros da equipe e administradores enxergam", async () => {
      await expect(getCase(aLawyer2.ctx, secret.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getCase(aAssistant.ctx, secret.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listCases(aLawyer2.ctx)).items.some((i) => i.id === secret.id)).toBe(false);
      await expect(listCaseEvents(aLawyer2.ctx, secret.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(addCaseNote(aLawyer2.ctx, secret.id, { title: "", description: "xxxx", occurredAt: "" })).rejects.toBeInstanceOf(NotFoundError);
      expect((await getCase(aLawyer.ctx, secret.id)).id).toBe(secret.id);
      expect((await getCase(aAdmin.ctx, secret.id)).id).toBe(secret.id);
      expect((await getCase(A.ctx, secret.id)).id).toBe(secret.id);
    });

    it("adicionar à equipe concede acesso; quem cadastra mantém acesso mesmo com outro responsável", async () => {
      await addCaseMember(aLawyer.ctx, secret.id, aLawyer2.user.id, "COLLABORATOR");
      expect((await getCase(aLawyer2.ctx, secret.id)).id).toBe(secret.id);
      const other = await createCase(aLawyer.ctx, { ...caseBase, title: "Sigilo com outro responsável", confidential: true, responsibleId: aLawyer2.user.id });
      expect((await getCase(aLawyer.ctx, other.id)).id).toBe(other.id);
      await expect(removeCaseMember(aLawyer.ctx, other.id, aLawyer.user.id)).rejects.toBeInstanceOf(ForbiddenError);
      await removeCaseMember(aLawyer.ctx, secret.id, aLawyer2.user.id);
      await expect(getCase(aLawyer2.ctx, secret.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("documentos de processo sigiloso seguem o sigilo", async () => {
      const doc = await uploadDocument(aLawyer.ctx, { caseId: secret.id }, { name: "peticao.pdf", buffer: pdf });
      await expect(getDocumentForDownload(aLawyer2.ctx, doc.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listDocuments(aLawyer2.ctx, { caseId: secret.id })).rejects.toBeInstanceOf(NotFoundError);
      await expect(uploadDocument(aLawyer2.ctx, { caseId: secret.id }, { name: "x.pdf", buffer: pdf })).rejects.toBeInstanceOf(NotFoundError);
      await expect(getDocumentForDownload(aLawyer.ctx, doc.id)).resolves.toBeTruthy();
    });
  });

  describe("documentos", () => {
    it("aceita tipos permitidos, define o MIME no servidor e registra evento e auditoria", async () => {
      const doc = await uploadDocument(A.ctx, { caseId: caseA.id }, { name: "../../etc/Contrato final.pdf", buffer: pdf });
      expect(doc.name).toBe("Contrato final.pdf");
      expect(doc.mimeType).toBe("application/pdf");
      expect(doc.sha256).toHaveLength(64);
      expect((await listDocuments(A.ctx, { caseId: caseA.id })).map((d) => d.id)).toContain(doc.id);
      expect((await listCaseEvents(A.ctx, caseA.id)).some((e) => e.kind === "DOCUMENT_ADDED")).toBe(true);
      await getDocumentForDownload(A.ctx, doc.id);
      expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "document.download", resourceId: doc.id } })).toBe(1);
    });

    it("rejeita extensão não permitida, conteúdo incompatível, vazio e grande demais", async () => {
      await expect(uploadDocument(A.ctx, { caseId: caseA.id }, { name: "virus.exe", buffer: pdf })).rejects.toBeInstanceOf(ValidationError);
      await expect(uploadDocument(A.ctx, { caseId: caseA.id }, { name: "falso.pdf", buffer: Buffer.from("MZ binário") })).rejects.toBeInstanceOf(ValidationError);
      await expect(uploadDocument(A.ctx, { caseId: caseA.id }, { name: "vazio.pdf", buffer: Buffer.alloc(0) })).rejects.toBeInstanceOf(ValidationError);
      await expect(uploadDocument(A.ctx, { caseId: caseA.id }, { name: "grande.pdf", buffer: Buffer.concat([pdf, Buffer.alloc(9 * 1024 * 1024)]) })).rejects.toBeInstanceOf(ValidationError);
      await expect(uploadDocument(A.ctx, {}, { name: "a.pdf", buffer: pdf })).rejects.toBeInstanceOf(ValidationError);
    });

    it("outro escritório não baixa, lista nem exclui; financeiro (sem documents:*) não lê nem envia", async () => {
      const doc = await uploadDocument(A.ctx, { clientId: clientA.id }, { name: "rg.pdf", buffer: pdf });
      await expect(getDocumentForDownload(B.ctx, doc.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteDocument(B.ctx, doc.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listDocuments(B.ctx, { clientId: clientA.id })).rejects.toBeInstanceOf(NotFoundError);
      await expect(uploadDocument(B.ctx, { caseId: caseA.id }, { name: "x.pdf", buffer: pdf })).rejects.toBeInstanceOf(NotFoundError);
      await expect(getDocumentForDownload(aAssistant.ctx, doc.id)).resolves.toBeTruthy();
      await expect(getDocumentForDownload(aFinance.ctx, doc.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(uploadDocument(aFinance.ctx, { clientId: clientA.id }, { name: "x.pdf", buffer: pdf })).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("exclusão é lógica e remove da listagem e do download", async () => {
      const doc = await uploadDocument(A.ctx, { caseId: caseA.id }, { name: "apagar.pdf", buffer: pdf });
      await deleteDocument(A.ctx, doc.id);
      await expect(getDocumentForDownload(A.ctx, doc.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).deletedAt).not.toBeNull();
    });
  });
});

