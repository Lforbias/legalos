import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { setQrDriver } from "@/lib/whatsapp/qr";
import { fakeDriver, fakeQr } from "@/lib/whatsapp/qr/fake-driver";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { addFollowUp, askSurvey, cancelScheduled, completeFollowUp, formStatus, listFollowUps, listForms, listScheduled, npsReport, runChatExtras, runFollowUpReminders, runScheduledMessages, saveForm, scheduleMessage, setExtrasSettings } from "@/server/services/chat-extras.service";
import { chatReport, exportAllCsv, exportConversationCsv } from "@/server/services/chat-report.service";
import { connectAccount } from "@/server/services/whatsapp-account.service";
import { addMetaNumber, addQrNumber, listNumbers, removeNumber, setNumberEnabled } from "@/server/services/whatsapp-numbers.service";
import { listConversations, sendMessage } from "@/server/services/whatsapp.service";
import { handleWebhook } from "@/server/services/whatsapp-webhook.service";
import { APP_SECRET, inbound, startFakeWhatsapp, WA_TOKEN } from "./fake-whatsapp";
import { addMember, META, makeOrgWithOwner } from "./helpers";

const fake = startFakeWhatsapp();
const saved = { ...process.env };
const P1 = "710000001";
const P2 = "710000002";
const MARIA = "5571999998888";
const JOAO = "5511988887777";
const post = (b: { body: string; signature: string }) => handleWebhook(b.body, b.signature);
const sentTo = (pnid: string) => fake.requests.filter((r) => r.method === "POST" && r.path.includes(`/${pnid}/messages`));
async function withMfa(userId: string, email: string) {
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}

describe("2.0-F8/F9 — vários números e extras do Chat", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let acc2: string;
  let c1: string;
  let c2: string;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const url = await fake.start();
    Object.assign(process.env, { WHATSAPP_API_URL: url, WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: "verifica-0123456789" });
    setQrDriver(fakeDriver);
    A = await makeOrgWithOwner("f89-a");
    ana = await addMember(A.org.id, "ASSISTANT", "f89-ana");
    await withMfa(A.owner.id, A.owner.email);
  });
  afterAll(async () => {
    setQrDriver(null);
    fakeQr.reset();
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    await fake.stop();
    process.env = { ...saved };
  });

  it("só adiciona número depois do principal; confere o token na Meta; limite e permissão", async () => {
    await expect(addMetaNumber(A.ctx, { label: "Segundo", phoneNumberId: P2, token: WA_TOKEN })).rejects.toBeInstanceOf(ConflictError);
    await connectAccount(A.ctx, { label: "Principal", phoneNumberId: P1, token: WA_TOKEN });
    await expect(addMetaNumber(ana.ctx, { label: "X", phoneNumberId: P2, token: WA_TOKEN })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addMetaNumber(A.ctx, { label: "Segundo", phoneNumberId: P2, token: "token-invalido-0123456789" })).rejects.toBeInstanceOf(ValidationError);
    const r = await addMetaNumber(A.ctx, { label: "Segundo", phoneNumberId: P2, token: WA_TOKEN });
    acc2 = r.id;
    const list = await listNumbers(A.ctx);
    expect(list.map((n) => n.label)).toEqual(["Principal", "Segundo"]);
    expect(list[0]!.isPrimary).toBe(true);
    expect(JSON.stringify(list)).not.toContain(WA_TOKEN);
  });

  it("cada conversa nasce no número que recebeu e é respondida por ele", async () => {
    await post(inbound(P1, { id: "wamid.F1", from: MARIA, name: "Maria", text: "Olá pelo principal" }));
    await post(inbound(P2, { id: "wamid.F2", from: JOAO, name: "João", text: "Olá pelo segundo" }));
    await post(inbound(P2, { id: "wamid.F3", from: MARIA, name: "Maria", text: "Maria também no segundo" })); // mesmo contato, outro número = outra conversa
    const all = await listConversations(A.ctx, "open");
    expect(all).toHaveLength(3);
    const only2 = await listConversations(A.ctx, "open", undefined, undefined, undefined, acc2);
    expect(only2).toHaveLength(2);
    expect(only2.every((c) => c.account.label === "Segundo")).toBe(true);
    c1 = all.find((c) => c.accountId !== acc2)!.id;
    c2 = only2.find((c) => c.waId === JOAO)!.id;
    const before2 = sentTo(P2).length;
    const before1 = sentTo(P1).length;
    await sendMessage(A.ctx, c2, "Resposta pelo segundo");
    expect(sentTo(P2).length).toBe(before2 + 1);
    expect(sentTo(P1).length).toBe(before1);
    await sendMessage(A.ctx, c1, "Resposta pelo principal");
    expect(sentTo(P1).length).toBe(before1 + 1);
  });

  it("número desligado deixa de receber; remover exige o nome certo e apaga as conversas dele", async () => {
    await expect(removeNumber(A.ctx, acc2, "errado")).rejects.toBeInstanceOf(ValidationError);
    await setNumberEnabled(A.ctx, acc2, false);
    expect((await listNumbers(A.ctx)).find((n) => n.id === acc2)!.enabled).toBe(false);
    await setNumberEnabled(A.ctx, acc2, true);
    await removeNumber(A.ctx, acc2, "Segundo");
    expect(await db.whatsappConversation.count({ where: { accountId: acc2 } })).toBe(0);
    expect(await db.whatsappConversation.count({ where: { organizationId: A.org.id } })).toBe(1);
  });

  it("número por QR exige aceitar os riscos e nasce conectando", async () => {
    await expect(addQrNumber(A.ctx, { label: "QR", riskAck: false })).rejects.toBeInstanceOf(ValidationError);
    const r = await addQrNumber(A.ctx, { label: "QR", riskAck: true });
    const n = (await listNumbers(A.ctx)).find((x) => x.id === r.id)!;
    expect(n.provider).toBe("QR");
    await removeNumber(A.ctx, r.id, "QR");
  });

  // ---------- F9 ----------
  it("follow-up: valida, só avisa a equipe (não envia nada ao cliente) e avisa uma única vez", async () => {
    await expect(addFollowUp(A.ctx, c1, { dueAt: new Date(Date.now() - 3600_000), note: "ligar" })).rejects.toBeInstanceOf(ValidationError);
    await expect(addFollowUp(A.ctx, c1, { dueAt: new Date(Date.now() + 3600_000), note: "" })).rejects.toBeInstanceOf(ValidationError);
    const f = await addFollowUp(ana.ctx, c1, { dueAt: new Date(Date.now() + 3600_000), note: "Retornar sobre os documentos" });
    expect((await listFollowUps(A.ctx, { conversationId: c1 })).length).toBe(1);
    const before = sentTo(P1).length;
    const early = await runFollowUpReminders(new Date());
    expect(early.notified).toBe(0);
    const late = await runFollowUpReminders(new Date(Date.now() + 2 * 3600_000));
    expect(late.notified).toBe(1);
    expect((await runFollowUpReminders(new Date(Date.now() + 3 * 3600_000))).notified).toBe(0);
    expect(sentTo(P1).length).toBe(before);
    expect(await db.notification.count({ where: { organizationId: A.org.id, kind: "chat.followup" } })).toBe(1);
    await completeFollowUp(ana.ctx, f.id);
    expect((await listFollowUps(A.ctx, { conversationId: c1 })).length).toBe(0);
  });

  it("mensagem agendada: nasce desligada, só sai no horário e com a chave ligada", async () => {
    const at = new Date(Date.now() + 5 * 60_000);
    await expect(scheduleMessage(ana.ctx, c1, { text: "Lembrete da audiência", sendAt: at })).rejects.toBeInstanceOf(ConflictError);
    await expect(setExtrasSettings(ana.ctx, { scheduledEnabled: true })).rejects.toBeInstanceOf(ForbiddenError);
    await setExtrasSettings(A.ctx, { scheduledEnabled: true });
    await expect(scheduleMessage(ana.ctx, c1, { text: "x", sendAt: new Date(Date.now() + 1000) })).rejects.toBeInstanceOf(ValidationError);
    const m = await scheduleMessage(ana.ctx, c1, { text: "Lembrete da audiência", sendAt: at });
    const other = await scheduleMessage(ana.ctx, c1, { text: "Esta eu cancelo", sendAt: at });
    await cancelScheduled(ana.ctx, other.id);
    const before = sentTo(P1).length;
    expect((await runScheduledMessages(new Date())).picked).toBe(0); // ainda não é a hora
    expect(sentTo(P1).length).toBe(before);
    const r = await runScheduledMessages(new Date(at.getTime() + 1000));
    expect(r).toMatchObject({ picked: 1, sent: 1, failed: 0 });
    expect(sentTo(P1).length).toBe(before + 1);
    expect((await runScheduledMessages(new Date(at.getTime() + 5000))).picked).toBe(0); // não reenvia
    const msg = await db.whatsappMessage.findFirstOrThrow({ where: { conversationId: c1, body: "Lembrete da audiência" } });
    expect(msg.authorId).toBe(ana.user.id);
    expect(msg.automatic).toBe(false);
    const rows = await listScheduled(A.ctx, c1);
    expect(rows.find((x) => x.id === m.id)!.status).toBe("SENT");
    expect(rows.find((x) => x.id === other.id)!.status).toBe("CANCELED");
  });

  it("mensagem agendada com a chave desligada no horário é cancelada com motivo (não envia)", async () => {
    const at = new Date(Date.now() + 10 * 60_000);
    const m = await scheduleMessage(ana.ctx, c1, { text: "Não deve sair", sendAt: at });
    await setExtrasSettings(A.ctx, { scheduledEnabled: false });
    const before = sentTo(P1).length;
    const r = await runChatExtras();
    expect(r).toBeTruthy();
    const r2 = await runScheduledMessages(new Date(at.getTime() + 1000));
    expect(r2.canceled).toBe(1);
    expect(sentTo(P1).length).toBe(before);
    const row = await db.whatsappScheduledMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.status).toBe("CANCELED");
    expect(row.error).toMatch(/desligada/);
  });

  it("NPS: nasce desligado; pergunta só quando a pessoa manda; nota 0–10 registra e não aciona robô", async () => {
    await expect(askSurvey(ana.ctx, c1)).rejects.toBeInstanceOf(ConflictError);
    await setExtrasSettings(A.ctx, { npsEnabled: true });
    await expect(setExtrasSettings(A.ctx, { npsQuestion: "curta" })).rejects.toBeInstanceOf(ValidationError);
    await askSurvey(ana.ctx, c1);
    await expect(askSurvey(ana.ctx, c1)).rejects.toBeInstanceOf(ConflictError); // já aguardando
    await post(inbound(P1, { id: "wamid.N1", from: MARIA, text: "oi, obrigada" })); // texto comum não conta
    expect((await db.whatsappSurvey.findFirstOrThrow({ where: { conversationId: c1 } })).status).toBe("ASKED");
    await post(inbound(P1, { id: "wamid.N2", from: MARIA, text: "10" }));
    const s = await db.whatsappSurvey.findFirstOrThrow({ where: { conversationId: c1 } });
    expect(s.status).toBe("ANSWERED");
    expect(s.score).toBe(10);
    const range = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) };
    await expect(npsReport(ana.ctx, range)).rejects.toBeInstanceOf(ForbiddenError);
    const rep = await npsReport(A.ctx, range);
    expect(rep).toMatchObject({ asked: 1, answered: 1, promoters: 1, nps: 100, responseRate: 100 });
  });

  it("formulários de atendimento: criar, listar e status de preenchimento", async () => {
    const field = await db.whatsappField.create({ data: { organizationId: A.org.id, name: "CPF do cliente", kind: "TEXT" } });
    await saveForm(A.ctx, null, { name: "Triagem inicial", fields: [{ fieldId: field.id, required: true }] });
    const forms = await listForms(A.ctx);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.fields[0]!.name).toBe("CPF do cliente");
    const st = await formStatus(A.ctx, c1, forms[0]!.id);
    expect(st.missingRequired).toEqual(["CPF do cliente"]);
  });

  it("relatório: contagens reais, tempo até a 1ª resposta humana e exportação com auditoria", async () => {
    const range = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) };
    await expect(chatReport(ana.ctx, range)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(chatReport(A.ctx, { from: range.to, to: range.from })).rejects.toBeInstanceOf(ValidationError);
    const rep = await chatReport(A.ctx, range);
    expect(rep.totals.conversations).toBe(1);
    expect(rep.totals.messagesIn).toBeGreaterThanOrEqual(3);
    expect(rep.firstResponse.count).toBe(1);
    expect(rep.byNumber[0]!.label).toBe("Principal");
    expect(rep.byDay.length).toBeGreaterThan(0);

    const one = await exportConversationCsv(ana.ctx, c1);
    expect(one.csv.startsWith("﻿data_hora;numero")).toBe(true);
    expect(one.csv).toContain("Olá pelo principal");
    expect(one.count).toBeGreaterThan(3);
    await expect(exportAllCsv(ana.ctx, range)).rejects.toBeInstanceOf(ForbiddenError);
    const all = await exportAllCsv(A.ctx, range);
    expect(all.count).toBe(one.count);
    const acts = (await db.auditLog.findMany({ where: { organizationId: A.org.id, action: { startsWith: "whatsapp.export_" } }, select: { action: true } })).map((a) => a.action);
    expect(acts).toEqual(expect.arrayContaining(["whatsapp.export_conversation", "whatsapp.export_all"]));
  });

  it("exportação neutraliza fórmula de planilha", async () => {
    await post(inbound(P1, { id: "wamid.X1", from: MARIA, text: "=HYPERLINK(\"http://x\")" }));
    const r = await exportConversationCsv(A.ctx, c1);
    expect(r.csv).toContain("'=HYPERLINK");
  });
});
