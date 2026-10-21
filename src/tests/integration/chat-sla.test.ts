import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { sealBytes } from "@/lib/security/pfx";
import { saveAutomation } from "@/server/services/chat-automation.service";
import { getSla, runSlaCheck, saveSla } from "@/server/services/chat-sla.service";
import { createTriageRules } from "@/server/services/chat-triage.service";
import { saveQueue } from "@/server/services/chat-queue.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const saved = { ...process.env };
const MIN = 60_000;

describe("LegalOS Chat — SLA de resposta e modelo de triagem por área", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let bia: Awaited<ReturnType<typeof addMember>>;
  let accountId: string;
  const now = new Date();
  const conv = async (waId: string, opts: { inboundAgoMin: number; assignedToId?: string | null; status?: string }) =>
    (await db.whatsappConversation.create({ data: { organizationId: A.org.id, accountId, waId, contactName: `Contato ${waId}`, status: opts.status ?? "OPEN", assignedToId: opts.assignedToId ?? null, lastInboundAt: new Date(now.getTime() - opts.inboundAgoMin * MIN), lastMessageAt: new Date(now.getTime() - opts.inboundAgoMin * MIN) } })).id;
  const base = { enabled: true, minutes: 15, notifyAssignee: true, notifyEmail: false, escalateUserId: null as string | null };

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    A = await makeOrgWithOwner("sla-a");
    ana = await addMember(A.org.id, "ASSISTANT", "sla-ana");
    bia = await addMember(A.org.id, "ASSISTANT", "sla-bia");
    accountId = (await db.whatsappAccount.create({ data: { organizationId: A.org.id, label: "t", phoneNumberId: "9300", tokenEnc: sealBytes(Buffer.from("x".repeat(30)), Buffer.alloc(32, 7)), createdById: A.owner.id } })).id;
  });
  afterAll(async () => {
    await db.whatsappSlaSettings.deleteMany({ where: { organizationId: A.org.id } });
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    process.env = { ...saved };
  });

  it("nasce desligado; só quem gerencia o Chat mexe; ligar/desligar fica na auditoria", async () => {
    expect((await getSla(A.ctx)).enabled).toBe(false);
    await expect(getSla(ana.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveSla(ana.ctx, base)).rejects.toBeInstanceOf(ForbiddenError);
    await saveSla(A.ctx, { ...base, enabled: false });
    expect((await getSla(A.ctx)).enabled).toBe(false);
    await saveSla(A.ctx, base);
    await saveSla(A.ctx, { ...base, enabled: false });
    const acts = (await db.auditLog.findMany({ where: { organizationId: A.org.id, action: { startsWith: "whatsapp.sla_" } }, select: { action: true } })).map((a) => a.action);
    expect(acts).toContain("whatsapp.sla_enable");
    expect(acts).toContain("whatsapp.sla_disable");
  });

  it("valida: minutos 1–1440, destinatário obrigatório, escalonamento só de membro ativo", async () => {
    await expect(saveSla(A.ctx, { ...base, minutes: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveSla(A.ctx, { ...base, minutes: 5000 })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveSla(A.ctx, { ...base, notifyAssignee: false })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveSla(A.ctx, { ...base, escalateUserId: "00000000-0000-4000-8000-000000000000" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("desligado não alerta ninguém", async () => {
    await saveSla(A.ctx, { ...base, enabled: false });
    const off = await conv("5511900000001", { inboundAgoMin: 60, assignedToId: ana.user.id });
    const r = await runSlaCheck(now);
    expect(r.alerts).toBe(0);
    await db.whatsappConversation.update({ where: { id: off }, data: { status: "CLOSED" } });
    expect(await db.notification.count({ where: { organizationId: A.org.id, kind: "chat.sla" } })).toBe(0);
  });

  it("ligado: avisa o responsável (qualquer hora), uma vez só; ignora recentes, antigas demais, fechadas e já respondidas", async () => {
    await saveSla(A.ctx, base);
    const late = await conv("5511900000010", { inboundAgoMin: 30, assignedToId: ana.user.id });
    await conv("5511900000011", { inboundAgoMin: 5, assignedToId: ana.user.id });
    await conv("5511900000012", { inboundAgoMin: 60 * 30, assignedToId: ana.user.id });
    await conv("5511900000013", { inboundAgoMin: 40, assignedToId: ana.user.id, status: "CLOSED" });
    const answered = await conv("5511900000014", { inboundAgoMin: 40, assignedToId: ana.user.id });
    await db.whatsappMessage.create({ data: { organizationId: A.org.id, conversationId: answered, direction: "OUT", type: "text", body: "oi", status: "SENT", automatic: false, createdAt: new Date(now.getTime() - 30 * MIN) } });
    const botReply = await conv("5511900000015", { inboundAgoMin: 40, assignedToId: ana.user.id });
    await db.whatsappMessage.create({ data: { organizationId: A.org.id, conversationId: botReply, direction: "OUT", type: "text", body: "menu", status: "SENT", automatic: true, createdAt: new Date(now.getTime() - 30 * MIN) } });
    const r1 = await runSlaCheck(now);
    expect(r1.alerts).toBe(2); // a atrasada e a que só teve resposta do robô
    const n = await db.notification.findMany({ where: { organizationId: A.org.id, kind: "chat.sla" } });
    expect(n.every((x) => x.userId === ana.user.id)).toBe(true);
    expect(n.some((x) => x.link === `/atendimento?c=${late}`)).toBe(true);
    const r2 = await runSlaCheck(now);
    expect(r2.alerts).toBe(0);
    expect((await getSla(A.ctx)).recent.length).toBe(2);
  });

  it("nova mensagem do cliente gera novo alerta; sem destinatário não alerta; escalonamento recebe os sem responsável", async () => {
    const c = await conv("5511900000020", { inboundAgoMin: 45 });
    expect((await runSlaCheck(now)).noRecipient).toBeGreaterThanOrEqual(1);
    await saveSla(A.ctx, { ...base, escalateUserId: bia.user.id });
    const r = await runSlaCheck(now);
    expect(r.alerts).toBeGreaterThanOrEqual(1);
    expect(await db.notification.count({ where: { organizationId: A.org.id, kind: "chat.sla", userId: bia.user.id } })).toBeGreaterThanOrEqual(1);
    await db.whatsappConversation.update({ where: { id: c }, data: { lastInboundAt: new Date(now.getTime() - 20 * MIN) } });
    expect((await runSlaCheck(now)).alerts).toBe(1);
  });

  it("conversa ainda no menu automático e sem responsável não conta como falta de resposta humana", async () => {
    const c = await conv("5511900000030", { inboundAgoMin: 50 });
    await db.whatsappBotSession.create({ data: { conversationId: c, organizationId: A.org.id, state: "MENU" } });
    const before = await db.whatsappSlaAlert.count({ where: { conversationId: c } });
    await runSlaCheck(now);
    expect(await db.whatsappSlaAlert.count({ where: { conversationId: c } })).toBe(before);
  });

  it("e-mail: enfileira para o destinatário, sem duplicar, só com driver que entrega", async () => {
    await saveSla(A.ctx, { ...base, notifyEmail: true, escalateUserId: null });
    const c = await conv("5511900000040", { inboundAgoMin: 70, assignedToId: ana.user.id });
    Object.assign(process.env, { MAIL_DRIVER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: "2525", MAIL_FROM: "LegalOS <nao-responda@exemplo.test>", SMTP_ALLOW_PLAIN: "1" });
    const r = await runSlaCheck(now);
    expect(r.emails).toBe(1);
    const mail = await db.mailOutbox.findFirstOrThrow({ where: { organizationId: A.org.id, kind: "chat_sla", toEmail: ana.user.email } });
    expect(mail.textBody).toContain(c);
    expect((await runSlaCheck(now)).emails).toBe(0);
    delete process.env.MAIL_DRIVER;
    await db.mailOutbox.deleteMany({ where: { organizationId: A.org.id } });
  });

  it("modelo de triagem: cria regras DESLIGADAS por área, não duplica e exige fila ou atendente", async () => {
    const q = await saveQueue(A.ctx, null, { name: "Previdenciário", strategy: "MANUAL" });
    await expect(createTriageRules(ana.ctx, { areas: [{ key: "trabalhista", queueId: q.id, userId: null, keywords: "fgts" }] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTriageRules(A.ctx, { areas: [{ key: "trabalhista", queueId: null, userId: null, keywords: "fgts" }] })).rejects.toBeInstanceOf(ValidationError);
    const r = await createTriageRules(A.ctx, { areas: [{ key: "previdenciario", queueId: q.id, userId: ana.user.id, keywords: "inss, aposentadoria" }, { key: "trabalhista", queueId: null, userId: bia.user.id, keywords: "fgts, justa causa" }] });
    expect(r.created).toEqual(["Previdenciário", "Trabalhista"]);
    const rules = await db.whatsappAutomation.findMany({ where: { organizationId: A.org.id, name: { startsWith: "Triagem: " } } });
    expect(rules).toHaveLength(2);
    expect(rules.every((x) => x.active === false && x.trigger === "KEYWORD")).toBe(true);
    const again = await createTriageRules(A.ctx, { areas: [{ key: "previdenciario", queueId: q.id, userId: null, keywords: "inss" }] });
    expect(again.created).toEqual([]);
    expect(again.skipped).toEqual(["Previdenciário"]);
    await expect(saveAutomation(A.ctx, null, { name: "x", trigger: "KEYWORD", triggerValue: "a", actions: [{ type: "ASSIGN", userId: ana.user.id }], oncePerConversation: true, active: false })).rejects.toBeInstanceOf(ValidationError);
  });
});
