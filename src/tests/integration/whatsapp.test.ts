import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { rotateKeys } from "@/lib/security/rotate-keys";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { connectAccount, deleteQuickReply, getAccount, listQuickReplies, removeAccount, saveQuickReply, syncTemplates, updateSettings } from "@/server/services/whatsapp-account.service";
import { addNote, assignConversation, getMessageMedia, linkClient, listConversations, openConversation, sendFile, sendMessage, sendTemplateMessage, setConversationStatus, startConversation, unreadTotal } from "@/server/services/whatsapp.service";
import { handleWebhook, verifyChallenge, WhatsappWebhookAuthError } from "@/server/services/whatsapp-webhook.service";
import { APP_SECRET, inbound, startFakeWhatsapp, statusEvent, WA_TOKEN } from "./fake-whatsapp";
import { addMember, META, makeOrgWithOwner } from "./helpers";

const fake = startFakeWhatsapp();
const saved = { ...process.env };
const PNID = "100200300";
const MARIA = "5571999998888";

async function withMfa(userId: string, email: string) {
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}
const post = (b: { body: string; signature: string }) => handleWebhook(b.body, b.signature);
const out = () => fake.requests.filter((r) => r.method === "POST" && /\/messages$/.test(r.path));

describe("atendimento por WhatsApp (Meta simulada)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let clientId: string;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const url = await fake.start();
    Object.assign(process.env, { WHATSAPP_API_URL: url, WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: "verifica-0123456789" });
    A = await makeOrgWithOwner("wa-a");
    B = await makeOrgWithOwner("wa-b");
    await withMfa(A.owner.id, A.owner.email);
    // Cliente com telefone SEM o nono dígito: o casamento precisa achar mesmo assim.
    const c = await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Maria da Silva", phone: "(71) 9999-8888" } });
    clientId = c.id;
  });
  afterAll(async () => {
    await fake.stop();
    process.env = { ...saved };
  });

  it("conectar exige 2FA, confere o token na Meta e guarda o token cifrado", async () => {
    await expect(connectAccount(B.ctx, { label: "x", phoneNumberId: PNID, token: WA_TOKEN })).rejects.toBeInstanceOf(ConflictError); // B sem 2FA
    await expect(connectAccount(A.ctx, { label: "Atendimento", phoneNumberId: PNID, token: "token-invalido-0123456789" })).rejects.toBeInstanceOf(ValidationError);
    expect(await getAccount(A.ctx)).toBeNull();
    await expect(connectAccount(A.ctx, { label: "Atendimento", phoneNumberId: "abc", token: WA_TOKEN })).rejects.toBeInstanceOf(ValidationError);
    const r = await connectAccount(A.ctx, { label: "Atendimento", phoneNumberId: PNID, wabaId: "555666", token: WA_TOKEN });
    expect(r.displayPhone).toContain("99999-0000");
    const raw = await db.whatsappAccount.findUniqueOrThrow({ where: { organizationId: A.org.id } });
    expect(raw.tokenEnc).not.toContain(WA_TOKEN);
    const view = await getAccount(A.ctx);
    expect(JSON.stringify(view)).not.toContain(WA_TOKEN);
    expect(JSON.stringify(view)).not.toContain(raw.tokenEnc);
  });

  it("não deixa o mesmo número ser conectado em dois escritórios", async () => {
    await withMfa(B.owner.id, B.owner.email);
    await expect(connectAccount(B.ctx, { label: "dup", phoneNumberId: PNID, token: WA_TOKEN })).rejects.toBeInstanceOf(ValidationError);
  });

  it("verificação do webhook (GET) e assinatura (POST)", async () => {
    expect(verifyChallenge("subscribe", "verifica-0123456789", "abc123")).toBe("abc123");
    expect(() => verifyChallenge("subscribe", "errado-errado-1234", "abc")).toThrow(WhatsappWebhookAuthError);
    expect(() => verifyChallenge("subscribe", null, "abc")).toThrow(WhatsappWebhookAuthError);
    const ev = inbound(PNID, { id: "wamid.IN0", from: MARIA, text: "x" });
    await expect(handleWebhook(ev.body, "sha256=" + "0".repeat(64))).rejects.toBeInstanceOf(WhatsappWebhookAuthError);
    await expect(handleWebhook(ev.body, null)).rejects.toBeInstanceOf(WhatsappWebhookAuthError);
    await expect(handleWebhook(ev.body + " ", ev.signature)).rejects.toBeInstanceOf(WhatsappWebhookAuthError);
    expect(await db.whatsappMessage.count({ where: { organizationId: A.org.id } })).toBe(0);
  });

  let convId: string;
  it("recebe mensagem, cria a conversa, vincula o cliente pelo telefone (com e sem o nono dígito) e não duplica", async () => {
    const ev = inbound(PNID, { id: "wamid.IN1", from: MARIA, name: "Maria", text: "Bom dia, doutora" });
    expect(await post(ev)).toEqual({ messages: 1, statuses: 0 });
    await post(ev); // reenvio da Meta
    const convs = await listConversations(A.ctx, "open");
    expect(convs).toHaveLength(1);
    expect(convs[0]!.client?.id).toBe(clientId);
    expect(convs[0]!.unreadCount).toBe(1);
    expect(convs[0]!.lastPreview).toBe("Bom dia, doutora");
    convId = convs[0]!.id;
    expect(await db.whatsappMessage.count({ where: { conversationId: convId } })).toBe(1);
    expect(await unreadTotal(A.ctx)).toBe(1);
    const o = await openConversation(A.ctx, convId);
    expect(o.conversation.windowOpen).toBe(true);
    expect(o.messages[0]!.direction).toBe("IN");
    expect(await unreadTotal(A.ctx)).toBe(0);
  });

  it("número que não pertence a nenhum escritório é ignorado sem erro", async () => {
    const r = await post(inbound("999000999", { id: "wamid.INX", from: MARIA, text: "oi" }));
    expect(r.messages).toBe(0);
    expect(await db.whatsappConversation.count()).toBe(1);
  });

  it("recebe imagem: baixa com o token, guarda no armazenamento e serve só a quem tem acesso", async () => {
    const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(50, 1)]);
    fake.addMedia("img_77", "image/png", png);
    await post(inbound(PNID, { id: "wamid.IN2", from: MARIA, media: { type: "image", id: "img_77", mime: "image/png", caption: "meu RG" } }));
    const o = await openConversation(A.ctx, convId);
    const m = o.messages.find((x) => x.type === "image")!;
    expect(m.hasMedia).toBe(true);
    expect(m.body).toBe("meu RG");
    const f = await getMessageMedia(A.ctx, m.id);
    expect(existsSync(path.join(process.env.STORAGE_DIR!, f.key))).toBe(true);
    expect(f.mime).toBe("image/png");
    await expect(getMessageMedia(B.ctx, m.id)).rejects.toBeInstanceOf(NotFoundError);
    const dl = fake.requests.find((r) => r.path.startsWith("/dl/img_77"));
    expect(dl?.auth).toBe(`Bearer ${WA_TOKEN}`);
  });

  it("mídia que não baixa não perde a mensagem", async () => {
    await post(inbound(PNID, { id: "wamid.IN3", from: MARIA, media: { type: "document", id: "nao_existe", mime: "application/pdf", filename: "contrato.pdf" } }));
    const m = await db.whatsappMessage.findFirstOrThrow({ where: { waMessageId: "wamid.IN3" } });
    expect(m.mediaKey).toBeNull();
    expect(m.error).toBeTruthy();
    expect(m.mediaName).toBe("contrato.pdf");
  });

  it("envia texto com o token certo, grava e acompanha os avisos de entrega sem retroceder", async () => {
    const before = out().length;
    const r = await sendMessage(A.ctx, convId, "Olá, Maria! Recebemos seus documentos.");
    expect(r.status).toBe("SENT");
    const req = out()[before]!;
    expect(req.auth).toBe(`Bearer ${WA_TOKEN}`);
    expect(req.body).toMatchObject({ messaging_product: "whatsapp", to: MARIA, type: "text", text: { body: "Olá, Maria! Recebemos seus documentos." } });
    const wamid = (await db.whatsappMessage.findUniqueOrThrow({ where: { id: r.id } })).waMessageId!;
    expect(wamid).toMatch(/^wamid\.OUT/);
    await post(statusEvent(PNID, { id: wamid, status: "delivered", recipient: MARIA }));
    expect((await db.whatsappMessage.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("DELIVERED");
    await post(statusEvent(PNID, { id: wamid, status: "read", recipient: MARIA }));
    await post(statusEvent(PNID, { id: wamid, status: "sent", recipient: MARIA })); // chegou fora de ordem
    expect((await db.whatsappMessage.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("READ");
  });

  it("se a Meta recusar, a mensagem fica salva como FALHOU com o motivo", async () => {
    fake.state.failNext = { match: /POST .*\/messages$/, status: 400, message: "Recipient phone number not in allowed list", code: 131030 };
    const r = await sendMessage(A.ctx, convId, "teste de falha");
    expect(r.status).toBe("FAILED");
    expect(r.error).toContain("allowed list");
    const m = await db.whatsappMessage.findUniqueOrThrow({ where: { id: r.id } });
    expect(m.status).toBe("FAILED");
    expect(m.waMessageId).toBeNull();
  });

  it("aviso de falha da Meta marca a mensagem", async () => {
    const r = await sendMessage(A.ctx, convId, "vai falhar depois");
    const wamid = (await db.whatsappMessage.findUniqueOrThrow({ where: { id: r.id } })).waMessageId!;
    await post(statusEvent(PNID, { id: wamid, status: "failed", recipient: MARIA, errorTitle: "Message undeliverable" }));
    const m = await db.whatsappMessage.findUniqueOrThrow({ where: { id: r.id } });
    expect(m.status).toBe("FAILED");
    expect(m.error).toContain("undeliverable");
  });

  it("envia arquivo (upload + mensagem) e recusa tipo ou conteúdo inválido", async () => {
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(100, 65)]);
    const r = await sendFile(A.ctx, convId, { name: "procuracao.pdf", buffer: pdf }, "Segue a procuração");
    expect(r.status).toBe("SENT");
    expect(fake.requests.some((x) => /\/media$/.test(x.path))).toBe(true);
    const last = out().at(-1)!;
    expect(last.body).toMatchObject({ type: "document", document: { filename: "procuracao.pdf", caption: "Segue a procuração" } });
    await expect(sendFile(A.ctx, convId, { name: "virus.exe", buffer: Buffer.from("MZ") })).rejects.toBeInstanceOf(ValidationError);
    await expect(sendFile(A.ctx, convId, { name: "falso.pdf", buffer: Buffer.from("não é pdf") })).rejects.toBeInstanceOf(ValidationError);
    await expect(sendFile(A.ctx, convId, { name: "vazio.pdf", buffer: Buffer.alloc(0) })).rejects.toBeInstanceOf(ValidationError);
  });

  it("nota interna não vai para a Meta", async () => {
    const n = out().length;
    await addNote(A.ctx, convId, "Cliente pediu retorno na sexta.");
    expect(out().length).toBe(n);
    const m = await db.whatsappMessage.findFirstOrThrow({ where: { conversationId: convId, direction: "NOTE" } });
    expect(m.status).toBe("NOTE");
    expect(m.authorId).toBe(A.owner.id);
  });

  it("janela de 24 h: texto é recusado e só modelo aprovado passa", async () => {
    fake.state.templates = [
      { name: "aviso_audiencia", language: "pt_BR", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Olá {{1}}, sua audiência é em {{2}}." }] },
      { name: "promo", language: "pt_BR", status: "PENDING", category: "MARKETING", components: [{ type: "BODY", text: "Oferta" }] },
    ];
    const s = await syncTemplates(A.ctx);
    expect(s).toEqual({ total: 2, approved: 1 });
    await db.whatsappConversation.update({ where: { id: convId }, data: { lastInboundAt: new Date(Date.now() - 25 * 3600_000) } });
    await expect(sendMessage(A.ctx, convId, "oi")).rejects.toBeInstanceOf(ConflictError);
    await expect(sendFile(A.ctx, convId, { name: "a.pdf", buffer: Buffer.from("%PDF-1") })).rejects.toBeInstanceOf(ConflictError);
    const ok = await db.whatsappTemplate.findFirstOrThrow({ where: { organizationId: A.org.id, name: "aviso_audiencia" } });
    const pend = await db.whatsappTemplate.findFirstOrThrow({ where: { organizationId: A.org.id, name: "promo" } });
    await expect(sendTemplateMessage(A.ctx, convId, pend.id, [])).rejects.toBeInstanceOf(ConflictError);
    await expect(sendTemplateMessage(A.ctx, convId, ok.id, ["Maria"])).rejects.toBeInstanceOf(ValidationError);
    const r = await sendTemplateMessage(A.ctx, convId, ok.id, ["Maria", "20/10 às 14h"]);
    expect(r.status).toBe("SENT");
    expect(out().at(-1)!.body).toMatchObject({ type: "template", template: { name: "aviso_audiencia", language: { code: "pt_BR" }, components: [{ type: "body", parameters: [{ type: "text", text: "Maria" }, { type: "text", text: "20/10 às 14h" }] }] } });
    const m = await db.whatsappMessage.findUniqueOrThrow({ where: { id: r.id } });
    expect(m.body).toBe("Olá Maria, sua audiência é em 20/10 às 14h.");
    // cliente responde: a janela reabre
    await post(inbound(PNID, { id: "wamid.IN4", from: MARIA, text: "Estarei lá" }));
    expect((await sendMessage(A.ctx, convId, "Perfeito!")).status).toBe("SENT");
  });

  it("mensagem de ausência: uma única vez por conversa dentro de 12 h, só quando ligada", async () => {
    await updateSettings(A.ctx, { awayEnabled: true, awayMessage: "Estamos fora do expediente.", openFrom: "00:00", openUntil: "00:00", openDays: [0, 1, 2, 3, 4, 5, 6] });
    const n = out().length;
    await post(inbound(PNID, { id: "wamid.IN5", from: MARIA, text: "ainda aí?" }));
    await post(inbound(PNID, { id: "wamid.IN6", from: MARIA, text: "?" }));
    const sent = out().slice(n);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toMatchObject({ text: { body: "Estamos fora do expediente." } });
    expect(await db.whatsappMessage.count({ where: { conversationId: convId, automatic: true } })).toBe(1);
    await updateSettings(A.ctx, { awayEnabled: false, awayMessage: "Estamos fora do expediente.", openFrom: "09:00", openUntil: "18:00", openDays: [1, 2, 3, 4, 5] });
    await expect(updateSettings(A.ctx, { awayEnabled: true, awayMessage: "", openFrom: "09:00", openUntil: "18:00", openDays: [1] })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings(A.ctx, { awayEnabled: false, openFrom: "25:00", openUntil: "18:00", openDays: [1] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("atribuir (só a quem tem acesso), encerrar, reabrir com nova mensagem e vincular cliente", async () => {
    const lawyer = await addMember(A.org.id, "LAWYER", "adv");
    const client = await addMember(A.org.id, "CLIENT", "cli");
    await assignConversation(A.ctx, convId, lawyer.user.id);
    expect((await db.whatsappConversation.findUniqueOrThrow({ where: { id: convId } })).assignedToId).toBe(lawyer.user.id);
    await expect(assignConversation(A.ctx, convId, client.user.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(assignConversation(A.ctx, convId, B.owner.id)).rejects.toBeInstanceOf(ValidationError);
    expect((await listConversations(lawyer.ctx, "mine")).map((c) => c.id)).toContain(convId);
    expect(await listConversations(A.ctx, "unassigned")).toHaveLength(0);
    await setConversationStatus(A.ctx, convId, "CLOSED");
    expect(await listConversations(A.ctx, "open")).toHaveLength(0);
    expect((await listConversations(A.ctx, "closed")).map((c) => c.id)).toEqual([convId]);
    await post(inbound(PNID, { id: "wamid.IN7", from: MARIA, text: "uma dúvida nova" }));
    expect((await listConversations(A.ctx, "open")).map((c) => c.id)).toEqual([convId]);
    const other = await db.client.create({ data: { organizationId: B.org.id, type: "PERSON", name: "Cliente de B" } });
    await expect(linkClient(A.ctx, convId, other.id)).rejects.toBeInstanceOf(NotFoundError);
    await linkClient(A.ctx, convId, null);
    await linkClient(A.ctx, convId, clientId);
  });

  it("permissões: assistente atende mas não configura; cliente externo não vê nada; outro escritório não enxerga", async () => {
    const asst = await addMember(A.org.id, "ASSISTANT", "ass");
    const ext = await addMember(A.org.id, "CLIENT", "ext");
    expect((await listConversations(asst.ctx)).length).toBeGreaterThan(0);
    await expect(sendMessage(asst.ctx, convId, "ok")).resolves.toBeTruthy();
    await expect(saveQuickReply(asst.ctx, null, { shortcut: "a", title: "aa", body: "b" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateSettings(asst.ctx, { awayEnabled: false, openFrom: "09:00", openUntil: "18:00", openDays: [1] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(connectAccount(asst.ctx, { label: "x", phoneNumberId: "12345", token: WA_TOKEN })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeAccount(asst.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listConversations(ext.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(openConversation(B.ctx, convId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(sendMessage(B.ctx, convId, "intruso")).rejects.toBeInstanceOf(NotFoundError);
    await expect(addNote(B.ctx, convId, "intruso")).rejects.toBeInstanceOf(NotFoundError);
    await expect(assignConversation(B.ctx, convId, null)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listConversations(B.ctx)).toHaveLength(0);
  });

  it("respostas rápidas: criar, atalho duplicado, listar e excluir", async () => {
    await saveQuickReply(A.ctx, null, { shortcut: "/boas-vindas", title: "Boas-vindas", body: "Olá! Como podemos ajudar?" });
    await expect(saveQuickReply(A.ctx, null, { shortcut: "boas-vindas", title: "Outra", body: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveQuickReply(A.ctx, null, { shortcut: "Com Espaço", title: "x", body: "x" })).rejects.toBeInstanceOf(ValidationError);
    const l = await listQuickReplies(A.ctx);
    expect(l.map((q) => q.shortcut)).toEqual(["boas-vindas"]);
    expect(await listQuickReplies(B.ctx)).toHaveLength(0);
    await expect(deleteQuickReply(B.ctx, l[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteQuickReply(A.ctx, l[0]!.id);
    expect(await listQuickReplies(A.ctx)).toHaveLength(0);
  });

  it("iniciar conversa com número novo cria a conversa fechada para texto (só modelo)", async () => {
    const c = await startConversation(A.ctx, { phone: "(71) 98888-7777", clientId });
    const conv = await db.whatsappConversation.findUniqueOrThrow({ where: { id: c.id } });
    expect(conv.waId).toBe("5571988887777");
    expect(conv.lastInboundAt).toBeNull();
    await expect(sendMessage(A.ctx, c.id, "oi")).rejects.toBeInstanceOf(ConflictError);
    await expect(startConversation(A.ctx, { phone: "12" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("troca de chave do cofre re-cifra o token do WhatsApp e a conexão continua funcionando", async () => {
    const oldK = Buffer.alloc(32, 7);
    await db.courtConnection.deleteMany(); // sobras de outros arquivos de teste, cifradas com outras chaves
    await db.certificate.deleteMany();
    const newK = Buffer.alloc(32, 8);
    const rep = await rotateKeys(db, { cert: { old: oldK, next: newK } }, { apply: true });
    expect(rep.cert?.whatsapp).toBeGreaterThanOrEqual(1);
    process.env.CERT_ENCRYPTION_KEY = newK.toString("base64");
    expect((await sendMessage(A.ctx, convId, "depois da troca")).status).toBe("SENT");
  });

  it("desligar para de receber; remover apaga tudo (exige 2FA)", async () => {
    await db.whatsappAccount.update({ where: { organizationId: A.org.id }, data: { enabled: false } });
    const before = await db.whatsappMessage.count({ where: { organizationId: A.org.id } });
    await post(inbound(PNID, { id: "wamid.IN8", from: MARIA, text: "desligado" }));
    expect(await db.whatsappMessage.count({ where: { organizationId: A.org.id } })).toBe(before);
    await removeAccount(A.ctx);
    expect(await db.whatsappConversation.count({ where: { organizationId: A.org.id } })).toBe(0);
    expect(await db.whatsappMessage.count({ where: { organizationId: A.org.id } })).toBe(0);
    expect(await getAccount(A.ctx)).toBeNull();
    expect(randomUUID()).toBeTruthy();
  });
});
