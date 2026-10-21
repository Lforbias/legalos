import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError } from "@/lib/permissions/check";
import { sealBytes } from "@/lib/security/pfx";
import { todayYmd } from "@/lib/dates/ymd";
import { billingPreview, getBillingSettings, runBillingReminders, saveBillingSettings } from "@/server/services/chat-billing.service";
import { saveBot } from "@/server/services/chat-bot.service";
import { saveAutomation } from "@/server/services/chat-automation.service";
import { saveLabel } from "@/server/services/chat-meta.service";
import { saveQueue } from "@/server/services/chat-queue.service";
import { getSwitches, setSwitch, stopAllMessaging } from "@/server/services/chat-switches.service";
import { updateSettings } from "@/server/services/whatsapp-account.service";
import { ingestMessage } from "@/server/services/whatsapp-ingest.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const saved = { ...process.env };

describe("LegalOS Chat — liga e desliga das automações", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let teamId: string;
  let accountId: string;
  let labelId: string;
  const cfg = { offsets: [0], sendHour: 0, skipWeekends: false, maxOverdueDays: 60, beforeText: "Olá {{nome}}, parcela {{parcela}}.", dueText: "Olá {{nome}}, vence hoje {{valor}}.", overdueText: "Olá {{nome}}, em atraso {{valor}}.", paymentInfo: null, templateId: null };

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    A = await makeOrgWithOwner("sw-a");
    ana = await addMember(A.org.id, "ASSISTANT", "sw-ana");
    teamId = (await db.workTeam.create({ data: { organizationId: A.org.id, name: "Atendimento" } })).id;
    await db.workTeamMember.create({ data: { teamId, organizationId: A.org.id, userId: ana.user.id } });
    accountId = (await db.whatsappAccount.create({ data: { organizationId: A.org.id, label: "t", phoneNumberId: "9200", tokenEnc: sealBytes(Buffer.from("x".repeat(30)), Buffer.alloc(32, 7)), createdById: A.owner.id } })).id;
    labelId = (await saveLabel(A.ctx, null, { name: "Teste", color: "#16a34a" })).id;
  });
  afterAll(async () => {
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    process.env = { ...saved };
  });

  it("padrão: nada que envia mensagem vem ligado; só quem gerencia o Chat mexe", async () => {
    const s = await getSwitches(A.ctx);
    expect(s).toEqual({ billing: { enabled: false }, bot: { configured: false, enabled: false }, away: { configured: false, enabled: false }, autoAssign: { enabled: true }, automations: { total: 0, active: 0 } });
    await expect(getSwitches(ana.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setSwitch(ana.ctx, "billing", true)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cobrança: salvar a configuração não liga; ligar e desligar ficam na auditoria; prévia não envia nada", async () => {
    await saveBillingSettings(A.ctx, cfg);
    expect((await getBillingSettings(A.ctx)).enabled).toBe(false);
    expect((await getSwitches(A.ctx)).billing.enabled).toBe(false);
    // parcela que venceria hoje
    const client = await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Maria Prévia", phone: "+55 71 94444-0001" } });
    await db.financeEntry.create({ data: { organizationId: A.org.id, kind: "RECEIVABLE", type: "FEE", description: "Honorários", amount: "300.00", issueDate: new Date(), dueDate: new Date(`${todayYmd("America/Sao_Paulo")}T00:00:00Z`), clientId: client.id } });
    expect(await billingPreview(A.ctx)).toMatchObject({ windowOpenNow: true, wouldSend: 1, clients: 1 });
    expect(await db.whatsappBillingSend.count({ where: { organizationId: A.org.id } })).toBe(0); // prévia não reserva nem envia
    await runBillingReminders(); // desligada: a rotina nem olha este escritório (a base de teste tem outros)
    expect(await db.whatsappBillingSend.count({ where: { organizationId: A.org.id } })).toBe(0);
    await setSwitch(A.ctx, "billing", true);
    expect((await getSwitches(A.ctx)).billing.enabled).toBe(true);
    expect(await billingPreview(A.ctx)).toMatchObject({ wouldSend: 1 });
    await setSwitch(A.ctx, "billing", false);
    expect((await getSwitches(A.ctx)).billing.enabled).toBe(false);
    const logs = await db.auditLog.findMany({ where: { organizationId: A.org.id, action: { in: ["whatsapp.switch_on", "whatsapp.switch_off"] }, resourceId: "billing" }, orderBy: { createdAt: "asc" }, select: { action: true, userId: true } });
    expect(logs.map((l) => l.action)).toEqual(["whatsapp.switch_on", "whatsapp.switch_off"]);
    expect(logs.every((l) => l.userId === A.owner.id)).toBe(true);
  });

  it("menu de triagem e ausência só ligam depois de configurados", async () => {
    await expect(setSwitch(A.ctx, "bot", true)).rejects.toBeInstanceOf(ConflictError);
    await expect(setSwitch(A.ctx, "away", true)).rejects.toBeInstanceOf(ConflictError);
    await saveBot(A.ctx, { enabled: false, greeting: "Escolha:", invalidText: "Não entendi.", handoffText: "Um atendente vai falar.", options: [{ label: "Falar de processo", reply: "", actions: [], questions: [] }] });
    expect((await getSwitches(A.ctx)).bot).toEqual({ configured: true, enabled: false });
    await setSwitch(A.ctx, "bot", true);
    expect((await db.whatsappBot.findUniqueOrThrow({ where: { organizationId: A.org.id } })).enabled).toBe(true);
    await updateSettings(A.ctx, { awayEnabled: false, awayMessage: "Estamos fora do expediente.", openFrom: "09:00", openUntil: "18:00", openDays: [1, 2, 3, 4, 5] });
    await setSwitch(A.ctx, "away", true);
    expect((await getSwitches(A.ctx)).away).toEqual({ configured: true, enabled: true });
  });

  it("automações: liga e desliga todas de uma vez; a nova nasce desligada pela tela (aqui, o que o serviço recebe)", async () => {
    await saveAutomation(A.ctx, null, { name: "Uma", trigger: "NEW_CONVERSATION", triggerValue: null, actions: [{ type: "ADD_LABEL", labelId }], oncePerConversation: true, active: true });
    await saveAutomation(A.ctx, null, { name: "Duas", trigger: "NEW_CONVERSATION", triggerValue: null, actions: [{ type: "ADD_LABEL", labelId }], oncePerConversation: true, active: true });
    expect((await getSwitches(A.ctx)).automations).toEqual({ total: 2, active: 2 });
    await setSwitch(A.ctx, "automations", false);
    expect((await getSwitches(A.ctx)).automations).toEqual({ total: 2, active: 0 });
    await setSwitch(A.ctx, "automations", true);
    expect((await getSwitches(A.ctx)).automations.active).toBe(2);
  });

  it("distribuição automática desligada: a conversa chega e fica sem responsável", async () => {
    await saveQueue(A.ctx, null, { name: "Geral", teamId, strategy: "ROUND_ROBIN", isDefault: true });
    const acc = await db.whatsappAccount.findUniqueOrThrow({ where: { id: accountId } });
    const mk = (id: string, waId: string) => ingestMessage({ ...acc, awayMessage: null, awayEnabled: false }, { waMessageId: id, waId, contactName: "Cliente", type: "text", text: "Olá", timestamp: new Date(), fromMe: false, media: null });
    await setSwitch(A.ctx, "autoAssign", false);
    await mk("sw-1", "5571933330001");
    expect((await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: "5571933330001" } })).assignedToId).toBeNull();
    await setSwitch(A.ctx, "autoAssign", true);
    await mk("sw-2", "5571933330002");
    expect((await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: "5571933330002" } })).assignedToId).toBe(ana.user.id);
  });

  it("botão de emergência desliga tudo o que envia mensagem, e só isso", async () => {
    await setSwitch(A.ctx, "billing", true);
    await stopAllMessaging(A.ctx);
    const s = await getSwitches(A.ctx);
    expect(s.billing.enabled).toBe(false);
    expect(s.bot.enabled).toBe(false);
    expect(s.away.enabled).toBe(false);
    expect(s.automations.active).toBe(0);
    expect(s.autoAssign.enabled).toBe(true); // distribuição não envia mensagem: continua como estava
    await expect(stopAllMessaging(ana.ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
