import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { rotateKeys } from "@/lib/security/rotate-keys";
import { sealBytes, openBytes } from "@/lib/security/pfx";
import { totpCode, totpStep } from "@/lib/security/totp";
import { fakeDriver, fakeQr } from "@/lib/whatsapp/qr/fake-driver";
import { setQrDriver } from "@/lib/whatsapp/qr";
import { liveSessions } from "@/lib/whatsapp/qr/live";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { connectAccount, getAccount, removeAccount, setAccountEnabled, syncTemplates } from "@/server/services/whatsapp-account.service";
import { connectQr, disconnectQr, getQrStatus, restartQr, stopQrSession } from "@/server/services/whatsapp-qr.service";
import { listConversations, openConversation, sendFile, sendMessage, sendTemplateMessage } from "@/server/services/whatsapp.service";
import { APP_SECRET, startFakeWhatsapp, WA_TOKEN } from "./fake-whatsapp";
import { META, makeOrgWithOwner } from "./helpers";

const fake = startFakeWhatsapp();
const saved = { ...process.env };
const MARIA = "5571999998888";

async function withMfa(userId: string, email: string) {
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}
async function until<T>(fn: () => Promise<T | null | false | undefined>, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("tempo esgotado esperando a condição");
    await new Promise((r) => setTimeout(r, 25));
  }
}
const inboundMsg = (id: string, chat: string, text: string, fromMe = false) => ({ id, chat, fromMe, name: fromMe ? null : "Maria", text, timestamp: new Date(), media: null });

describe("atendimento por WhatsApp — conexão por QR-Code (driver FALSO)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let accountId: string;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.WHATSAPP_QR_MIN_GAP_MS = "0";
    const url = await fake.start();
    Object.assign(process.env, { WHATSAPP_API_URL: url, WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: "verifica-0123456789" });
    setQrDriver(fakeDriver);
    fakeQr.reset();
    A = await makeOrgWithOwner("qr-a");
    B = await makeOrgWithOwner("qr-b");
    await withMfa(A.owner.id, A.owner.email);
    await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Maria da Silva", phone: "(71) 9999-8888" } });
  });
  afterAll(async () => {
    if (accountId) await stopQrSession(accountId, { logout: false });
    setQrDriver(null);
    await fake.stop();
    process.env = { ...saved };
  });

  it("conectar exige 2FA e a confirmação dos riscos", async () => {
    await expect(connectQr(B.ctx, { label: "x", riskAck: true })).rejects.toBeInstanceOf(ConflictError); // B sem 2FA
    await expect(connectQr(A.ctx, { label: "x", riskAck: false })).rejects.toBeInstanceOf(ValidationError);
    expect(await getAccount(A.ctx)).toBeNull();
    await expect(getQrStatus(A.ctx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("gera o QR-Code, mostra como imagem e conecta ao ser lido", async () => {
    const r = await connectQr(A.ctx, { label: "Atendimento", riskAck: true });
    accountId = r.id;
    const acc = await db.whatsappAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(acc.provider).toBe("QR");
    expect(acc.phoneNumberId).toBeNull();
    expect(acc.tokenEnc).toBeNull();
    expect(acc.riskAckAt).not.toBeNull();
    const st = await until(async () => { const s = await getQrStatus(A.ctx); return s.state === "QR" ? s : null; });
    expect(st.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    fakeQr.emit(accountId, { type: "open", phone: "5571999990000" });
    const ok = await until(async () => { const s = await getQrStatus(A.ctx); return s.state === "CONNECTED" ? s : null; });
    expect(ok.phone).toBe("5571999990000");
    expect(ok.qrDataUrl).toBeNull();
    const v = await getAccount(A.ctx);
    expect(v?.provider).toBe("QR");
    expect(v?.riskAckAt).not.toBeNull();
    expect(JSON.stringify(v)).not.toContain("FAKE-QR");
  });

  it("recebe mensagem, casa com o cliente (sem o nono dígito) e não aplica janela de 24h", async () => {
    fakeQr.emit(accountId, { type: "message", msg: inboundMsg("IN1", MARIA, "Bom dia, doutora") });
    const conv = await until(async () => db.whatsappConversation.findFirst({ where: { organizationId: A.org.id, waId: MARIA } }));
    expect(conv.clientId).not.toBeNull();
    expect(conv.unreadCount).toBe(1);
    const m = await db.whatsappMessage.findFirstOrThrow({ where: { conversationId: conv.id } });
    expect(m.direction).toBe("IN");
    expect(m.waMessageId).toBe(`qr:${accountId}:IN1`);
    // repetição do mesmo id não duplica
    fakeQr.emit(accountId, { type: "message", msg: inboundMsg("IN1", MARIA, "Bom dia, doutora") });
    await new Promise((r) => setTimeout(r, 150));
    expect(await db.whatsappMessage.count({ where: { conversationId: conv.id } })).toBe(1);
    // última mensagem do cliente há 3 dias: na Meta bloquearia, no QR não
    await db.whatsappConversation.update({ where: { id: conv.id }, data: { lastInboundAt: new Date(Date.now() - 3 * 86400_000) } });
    const o = await openConversation(A.ctx, conv.id);
    expect(o.conversation.windowOpen).toBe(true);
    expect(o.conversation.unreadCount).toBe(0);
  });

  it("envia texto e arquivo pela sessão; o eco do envio não duplica a mensagem", async () => {
    const conv = await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: MARIA } });
    const r = await sendMessage(A.ctx, conv.id, "Olá, Maria!");
    expect(r.status).toBe("SENT");
    expect(fakeQr.state.sent.at(-1)).toMatchObject({ chat: MARIA, kind: "text", body: "Olá, Maria!" });
    const row = await db.whatsappMessage.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.waMessageId).toMatch(new RegExp(`^qr:${accountId}:FAKE\\d+$`));
    const rawId = row.waMessageId!.split(":")[2]!;
    // eco chegando DEPOIS: ignorado
    fakeQr.emit(accountId, { type: "message", msg: inboundMsg(rawId, MARIA, "Olá, Maria!", true) });
    await new Promise((r2) => setTimeout(r2, 150));
    expect(await db.whatsappMessage.count({ where: { waMessageId: row.waMessageId! } })).toBe(1);

    // eco chegando ANTES de a mensagem ser gravada: a linha criada pelo eco é completada com o autor
    const nextId = `FAKE${fakeQr.state.counter + 1}`;
    fakeQr.emit(accountId, { type: "message", msg: inboundMsg(nextId, MARIA, "Segunda", true) });
    await until(async () => db.whatsappMessage.findFirst({ where: { waMessageId: `qr:${accountId}:${nextId}` } }));
    const r2 = await sendMessage(A.ctx, conv.id, "Segunda");
    expect(r2.status).toBe("SENT");
    const rows = await db.whatsappMessage.findMany({ where: { waMessageId: `qr:${accountId}:${nextId}` } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.authorId).toBe(A.owner.id);

    // arquivo
    const pdf = Buffer.from("%PDF-1.4\n%teste\n");
    const f = await sendFile(A.ctx, conv.id, { name: "contrato.pdf", buffer: pdf }, "Segue");
    expect(f.status).toBe("SENT");
    expect(fakeQr.state.sent.at(-1)).toMatchObject({ chat: MARIA, kind: "media", filename: "contrato.pdf" });
  });

  it("modelos da Meta não existem no QR; recusa do WhatsApp vira mensagem FALHOU", async () => {
    const conv = await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: MARIA } });
    const t = await db.whatsappTemplate.create({ data: { organizationId: A.org.id, name: "aviso", language: "pt_BR", category: "UTILITY", status: "APPROVED", body: "Olá", variableCount: 0 } });
    await expect(sendTemplateMessage(A.ctx, conv.id, t.id, [])).rejects.toBeInstanceOf(ConflictError);
    await expect(syncTemplates(A.ctx)).rejects.toBeInstanceOf(ConflictError);
    fakeQr.state.failSend = "sessão caiu";
    const r = await sendMessage(A.ctx, conv.id, "não vai");
    fakeQr.state.failSend = null;
    expect(r.status).toBe("FAILED");
    expect(r.error).toContain("sessão caiu");
  });

  it("atualiza o status de entrega e lê conversas sem telefone visível (lid)", async () => {
    const row = await db.whatsappMessage.findFirstOrThrow({ where: { organizationId: A.org.id, direction: "OUT", status: "SENT", waMessageId: { startsWith: "qr:" } }, orderBy: { createdAt: "asc" } });
    const raw = row.waMessageId!.split(":")[2]!;
    fakeQr.emit(accountId, { type: "status", id: raw, status: "read" });
    await until(async () => (await db.whatsappMessage.findUniqueOrThrow({ where: { id: row.id } })).status === "READ");
    fakeQr.emit(accountId, { type: "status", id: raw, status: "delivered" }); // não regride
    await new Promise((r) => setTimeout(r, 120));
    expect((await db.whatsappMessage.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("READ");
    fakeQr.emit(accountId, { type: "message", msg: inboundMsg("LID1", "lid:998877665544", "oi") });
    const c = await until(async () => db.whatsappConversation.findFirst({ where: { organizationId: A.org.id, waId: "lid:998877665544" } }));
    await sendMessage(A.ctx, c.id, "resposta");
    expect(fakeQr.state.sent.at(-1)?.chat).toBe("lid:998877665544");
    expect((await listConversations(A.ctx, "open")).length).toBeGreaterThanOrEqual(2);
  });

  it("isola escritórios", async () => {
    await expect(getQrStatus(B.ctx)).rejects.toBeInstanceOf(NotFoundError);
    await expect(restartQr(B.ctx)).rejects.toBeInstanceOf(NotFoundError);
    await expect(disconnectQr(B.ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listConversations(B.ctx, "open")).toHaveLength(0);
  });

  it("a troca de chave do cofre também reprotege o estado da sessão", async () => {
    const key = Buffer.alloc(32, 7);
    await db.whatsappQrAuth.upsert({ where: { accountId_key: { accountId, key: "creds" } }, create: { accountId, key: "creds", valueEnc: sealBytes(Buffer.from("segredo-da-sessao"), key) }, update: { valueEnc: sealBytes(Buffer.from("segredo-da-sessao"), key) } });
    // A troca de chave é global: tira sobras de outros arquivos de teste, cifradas com outras chaves.
    await db.courtConnection.deleteMany();
    await db.certificate.deleteMany();
    const newK = Buffer.alloc(32, 8);
    const rep = await rotateKeys(db, { cert: { old: key, next: newK } }, { apply: true });
    expect(rep.cert?.whatsapp).toBeGreaterThanOrEqual(1);
    const row = await db.whatsappQrAuth.findUniqueOrThrow({ where: { accountId_key: { accountId, key: "creds" } } });
    expect(openBytes(row.valueEnc, newK).toString()).toBe("segredo-da-sessao");
    expect(() => openBytes(row.valueEnc, key)).toThrow();
    process.env.CERT_ENCRYPTION_KEY = newK.toString("base64");
  });

  it("desligar para a sessão; religar volta a conectar", async () => {
    await setAccountEnabled(A.ctx, false);
    await until(async () => !liveSessions.has(accountId));
    expect((await getQrStatus(A.ctx)).state).toBe("DISCONNECTED");
    await setAccountEnabled(A.ctx, true);
    await until(async () => { const s = await getQrStatus(A.ctx); return s.state === "QR" || s.state === "CONNECTED" ? s : null; });
  });

  it("se o WhatsApp tirar o aparelho (loggedOut), apaga as chaves e pede novo QR", async () => {
    fakeQr.emit(accountId, { type: "close", loggedOut: true, reason: "loggedOut" });
    await until(async () => (await getQrStatus(A.ctx)).state === "DISCONNECTED");
    expect(await db.whatsappQrAuth.count({ where: { accountId } })).toBe(0);
    expect(liveSessions.has(accountId)).toBe(false);
    const st = await getQrStatus(A.ctx);
    expect(st.message).toMatch(/desconectado/i);
    await restartQr(A.ctx);
    await until(async () => (await getQrStatus(A.ctx)).state === "QR");
  });

  it("queda comum reconecta sozinha; desconectar sai e mantém as conversas", async () => {
    fakeQr.emit(accountId, { type: "open", phone: "5571999990000" });
    await until(async () => (await getQrStatus(A.ctx)).state === "CONNECTED");
    fakeQr.emit(accountId, { type: "close", loggedOut: false, reason: "rede" });
    await until(async () => (await getQrStatus(A.ctx)).state === "CONNECTING");
    await disconnectQr(A.ctx);
    expect((await getQrStatus(A.ctx)).state).toBe("DISCONNECTED");
    expect(await db.whatsappConversation.count({ where: { organizationId: A.org.id } })).toBeGreaterThan(0);
    await expect(sendMessage(A.ctx, (await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id } })).id, "x")).resolves.toMatchObject({ status: "FAILED" });
  });

  it("trocar para a API oficial desliga o QR; remover apaga tudo", async () => {
    await connectAccount(A.ctx, { label: "Oficial", phoneNumberId: "100200301", token: WA_TOKEN });
    const acc = await db.whatsappAccount.findFirstOrThrow({ where: { organizationId: A.org.id, isPrimary: true } });
    expect(acc.provider).toBe("META");
    expect(acc.qrState).toBe("DISCONNECTED");
    expect(acc.riskAckAt).toBeNull();
    expect(acc.tokenEnc).not.toBeNull();
    expect(liveSessions.has(accountId)).toBe(false);
    await removeAccount(A.ctx);
    expect(await db.whatsappConversation.count({ where: { organizationId: A.org.id } })).toBe(0);
  });
});
