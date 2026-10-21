import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { putObject } from "@/lib/storage/local-storage";
import { sealBytes } from "@/lib/security/pfx";
import { attachMessageToDocuments, caseOptions, conversationsOfCase, conversationsOfClient, conversationsOfLead, createDeadlineFromConversation, createEventFromConversation, createLeadFromConversation, createTaskFromConversation, linkCase } from "@/server/services/chat-links.service";
import { convertLead } from "@/server/services/crm.service";
import { listDocuments } from "@/server/services/document.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const saved = { ...process.env };

describe("LegalOS Chat ↔ resto do sistema", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let clientId: string;
  let caseId: string;
  let secretCaseId: string;
  let convA: string;
  let convNew: string;
  let convLid: string;
  let msgId: string;
  let imgMsgId: string;

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    A = await makeOrgWithOwner("chat-a");
    B = await makeOrgWithOwner("chat-b");
    const cl = await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Maria da Silva", phone: "5571999998888" } });
    clientId = cl.id;
    const cs = await db.case.create({ data: { organizationId: A.org.id, title: "Maria x INSS", number: "0001234-56.2026.8.05.0001" } });
    caseId = cs.id;
    await db.caseParty.create({ data: { organizationId: A.org.id, caseId, clientId, role: "PLAINTIFF", name: "Maria da Silva", isOurClient: true } });
    secretCaseId = (await db.case.create({ data: { organizationId: A.org.id, title: "Sigiloso", confidential: true } })).id;
    const acc = await db.whatsappAccount.create({ data: { organizationId: A.org.id, label: "t", phoneNumberId: "9001", tokenEnc: sealBytes(Buffer.from("x".repeat(30)), Buffer.alloc(32, 7)), createdById: A.owner.id } });
    const mk = (waId: string, extra: object = {}) => db.whatsappConversation.create({ data: { organizationId: A.org.id, accountId: acc.id, waId, ...extra } });
    convA = (await mk("5571999998888", { clientId })).id;
    convNew = (await mk("5571988887777", { contactName: "João Teste" })).id;
    convLid = (await mk("lid:998877", { contactName: "Sem número" })).id;
    msgId = (await db.whatsappMessage.create({ data: { organizationId: A.org.id, conversationId: convA, direction: "IN", type: "text", body: "Preciso enviar meus documentos do INSS", status: "RECEIVED", waMessageId: `w-${randomUUID()}` } })).id;
    const key = `${A.org.id}/${randomUUID()}`;
    await putObject(key, Buffer.from("%PDF-1.4\n%laudo\n"));
    imgMsgId = (await db.whatsappMessage.create({ data: { organizationId: A.org.id, conversationId: convA, direction: "IN", type: "document", body: null, status: "RECEIVED", mediaKey: key, mediaMime: "application/pdf", mediaName: "laudo.pdf", mediaSize: 16, waMessageId: `w-${randomUUID()}` } })).id;
  });
  afterAll(async () => {
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } }); // não deixar segredo cifrado para a troca de chaves de outros testes
    process.env = { ...saved };
  });

  it("vincula a conversa a um processo visível, liga o cliente sozinho e registra na linha do tempo", async () => {
    const opts = await caseOptions(A.ctx, convA);
    expect(opts.map((o) => o.id)).toContain(caseId); // processo do cliente da conversa
    expect((await caseOptions(A.ctx, convNew, "Sigiloso")).map((o) => o.id)).toContain(secretCaseId); // dono vê
    await linkCase(A.ctx, convA, caseId);
    expect((await db.whatsappConversation.findUniqueOrThrow({ where: { id: convA } })).caseId).toBe(caseId);
    expect(await db.caseEvent.count({ where: { caseId, kind: "WHATSAPP" } })).toBe(1);
    expect(await db.whatsappMessage.count({ where: { conversationId: convA, direction: "NOTE", body: { contains: "vinculada ao processo" } } })).toBe(1);
    // conversa sem cliente + processo com um único cliente => liga o cliente também
    await linkCase(A.ctx, convNew, caseId);
    expect((await db.whatsappConversation.findUniqueOrThrow({ where: { id: convNew } })).clientId).toBe(clientId);
    await linkCase(A.ctx, convNew, null);
    expect((await db.whatsappConversation.findUniqueOrThrow({ where: { id: convNew } })).caseId).toBeNull();
    await db.whatsappConversation.update({ where: { id: convNew }, data: { clientId: null } });
  });

  it("isola escritórios e respeita o sigilo do processo", async () => {
    await expect(linkCase(B.ctx, convA, caseId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createTaskFromConversation(B.ctx, convA, { title: "Invasão" })).rejects.toBeInstanceOf(NotFoundError);
    const other = await addMember(A.org.id, "ASSISTANT", "chat-assist");
    await expect(linkCase(other.ctx, convNew, secretCaseId)).rejects.toBeInstanceOf(NotFoundError); // sigiloso, sem acesso
    expect(await caseOptions(other.ctx, convNew, "Sigiloso")).toEqual([]);
    expect(await conversationsOfClient(B.ctx, clientId)).toEqual([]);
  });

  it("cria tarefa a partir da mensagem: leva cliente, processo, citação e origem, e avisa na conversa", async () => {
    const r = await createTaskFromConversation(A.ctx, convA, { title: "Reunir documentos do INSS", dueDate: "2026-12-01", messageId: msgId });
    const t = await db.task.findUniqueOrThrow({ where: { id: r.id } });
    expect(t.clientId).toBe(clientId);
    expect(t.caseId).toBe(caseId);
    expect(t.assigneeId).toBe(A.owner.id);
    expect(t.description).toContain("Preciso enviar meus documentos do INSS");
    expect(t.description).toContain(`/atendimento?c=${convA}`);
    expect(await db.whatsappMessage.count({ where: { conversationId: convA, direction: "NOTE", body: { contains: "Tarefa criada" } } })).toBe(1);
    await expect(createTaskFromConversation(A.ctx, convA, { title: "ab" })).rejects.toThrow(); // título curto: validação do módulo de tarefas
    await expect(createTaskFromConversation(A.ctx, convA, { title: "Mensagem de outra conversa", messageId: randomUUID() })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("marca compromisso na agenda e cadastra prazo como rascunho (exige processo)", async () => {
    const e = await createEventFromConversation(A.ctx, convA, { title: "Reunião com a Maria", date: "2026-12-02", startTime: "10:00", endTime: "11:00" });
    const ev = await db.agendaEvent.findUniqueOrThrow({ where: { id: e.id } });
    expect(ev.clientId).toBe(clientId);
    expect(ev.caseId).toBe(caseId);
    await expect(createDeadlineFromConversation(A.ctx, convLid, { title: "Sem processo", dueDate: "2026-12-10" })).rejects.toBeInstanceOf(ConflictError);
    const d = await createDeadlineFromConversation(A.ctx, convA, { title: "Juntar laudo", dueDate: "2026-12-10", messageId: msgId });
    const dl = await db.deadline.findUniqueOrThrow({ where: { id: d.id } });
    expect(dl.status).toBe("DRAFT"); // validação humana continua obrigatória
    expect(dl.caseId).toBe(caseId);
  });

  it("transforma quem não é cliente em lead (origem WhatsApp) e, ao converter, a conversa passa ao novo cliente", async () => {
    await expect(createLeadFromConversation(A.ctx, convA)).rejects.toBeInstanceOf(ConflictError); // já é cliente
    const r = await createLeadFromConversation(A.ctx, convNew, { interest: "Aposentadoria" });
    const lead = await db.lead.findUniqueOrThrow({ where: { id: r.id } });
    expect(lead.source).toBe("WhatsApp");
    expect(lead.phone).toBe("5571988887777");
    expect(lead.name).toBe("João Teste");
    expect((await db.whatsappConversation.findUniqueOrThrow({ where: { id: convNew } })).leadId).toBe(lead.id);
    await expect(createLeadFromConversation(A.ctx, convNew)).rejects.toBeInstanceOf(ConflictError);
    expect((await conversationsOfLead(A.ctx, lead.id)).map((c) => c.id)).toEqual([convNew]);
    const conv = await convertLead(A.ctx, lead.id, "");
    expect((await db.whatsappConversation.findUniqueOrThrow({ where: { id: convNew } })).clientId).toBe(conv.clientId);
    // contato sem telefone visível: lead sem telefone
    const l2 = await createLeadFromConversation(A.ctx, convLid, {});
    expect((await db.lead.findUniqueOrThrow({ where: { id: l2.id } })).phone).toBeNull();
  });

  it("guarda o arquivo recebido nos documentos do processo e do cliente", async () => {
    const d1 = await attachMessageToDocuments(A.ctx, imgMsgId, "case");
    const d2 = await attachMessageToDocuments(A.ctx, imgMsgId, "client");
    expect((await listDocuments(A.ctx, { caseId })).map((d) => d.id)).toContain(d1.id);
    expect((await listDocuments(A.ctx, { clientId })).map((d) => d.id)).toContain(d2.id);
    const doc = await db.document.findUniqueOrThrow({ where: { id: d1.id } });
    expect(doc.name).toBe("laudo.pdf");
    expect(doc.description).toContain("WhatsApp");
    await expect(attachMessageToDocuments(A.ctx, msgId, "case")).rejects.toBeInstanceOf(NotFoundError); // mensagem sem arquivo
    await expect(attachMessageToDocuments(B.ctx, imgMsgId, "case")).rejects.toBeInstanceOf(NotFoundError);
    const lidFile = await db.whatsappMessage.create({ data: { organizationId: A.org.id, conversationId: convLid, direction: "IN", type: "document", status: "RECEIVED", mediaKey: (await db.whatsappMessage.findUniqueOrThrow({ where: { id: imgMsgId } })).mediaKey, mediaMime: "application/pdf", mediaName: "x.pdf", waMessageId: `w-${randomUUID()}` } });
    await expect(attachMessageToDocuments(A.ctx, lidFile.id, "case")).rejects.toBeInstanceOf(ConflictError); // conversa sem processo
  });

  it("mostra as conversas na ficha do processo e do cliente, só com permissão", async () => {
    expect((await conversationsOfCase(A.ctx, caseId)).map((c) => c.id)).toContain(convA);
    expect((await conversationsOfClient(A.ctx, clientId)).map((c) => c.id)).toEqual([convA]);
    const newClient = (await db.whatsappConversation.findUniqueOrThrow({ where: { id: convNew } })).clientId!;
    expect((await conversationsOfClient(A.ctx, newClient)).map((c) => c.id)).toEqual([convNew]);
    await expect(conversationsOfCase(B.ctx, caseId)).rejects.toBeInstanceOf(NotFoundError);
    const noChat = await db.role.findFirst({ where: { organizationId: A.org.id, key: "CLIENT" } });
    if (noChat) {
      const m = await addMember(A.org.id, "CLIENT", "chat-client");
      expect(await conversationsOfClient(m.ctx, clientId)).toEqual([]); // sem whatsapp:read
      await expect(createTaskFromConversation(m.ctx, convA, { title: "Não pode" })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
