import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { billingAvailability, billingHistoryForEntry, getBillingSettings, listBillingSends, listOptouts, removeOptout, runBillingReminders, saveBillingSettings, sendBillingNow } from "@/server/services/chat-billing.service";
import { setSwitch } from "@/server/services/chat-switches.service";
import { saveBot } from "@/server/services/chat-bot.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { connectAccount, removeAccount } from "@/server/services/whatsapp-account.service";
import { handleWebhook } from "@/server/services/whatsapp-webhook.service";
import { APP_SECRET, inbound, startFakeWhatsapp, WA_TOKEN } from "./fake-whatsapp";
import { addMember, META, makeOrgWithOwner } from "./helpers";

const fake = startFakeWhatsapp();
const saved = { ...process.env };
const PNID = "700800900";
const WAID = "5571966660001";
let seq = 0;
const say = (from: string, text: string) => { const b = inbound(PNID, { id: `wamid.BL${++seq}`, from, text, name: "Maria Cliente" }); return handleWebhook(b.body, b.signature); };
const outs = (type: string) => fake.requests.filter((r) => r.method === "POST" && /\/messages$/.test(r.path) && (r.body as { type?: string })?.type === type);
const texts = () => outs("text").map((r) => (r.body as { text: { body: string } }).text.body);
// quarta-feira 11/11/2026, 12:00 em São Paulo
const NOW = new Date("2026-11-11T15:00:00Z");
const cfg = (over: object = {}) => ({ offsets: [-3, 0, 3], sendHour: 9, skipWeekends: true, maxOverdueDays: 60, beforeText: "Olá, {{nome}}! A parcela {{parcela}} de {{valor}} vence em {{vencimento}}.", dueText: "Olá, {{nome}}! Hoje vence a parcela {{parcela}} de {{valor}}.", overdueText: "Olá, {{nome}}! A parcela {{parcela}} de {{valor}} venceu em {{vencimento}} ({{descricao}}).", paymentInfo: "PIX 123", templateId: null, ...over });

describe("LegalOS Chat — cobrança de honorários pelo WhatsApp", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let clientId: string;
  let templateId: string;
  const entry = (due: string, over: Record<string, unknown> = {}) => db.financeEntry.create({ data: { organizationId: A.org.id, kind: "RECEIVABLE", type: "FEE", description: "Honorários — ação X", amount: "500.00", issueDate: new Date("2026-10-01"), dueDate: new Date(due), clientId, installmentNo: 2, installmentTotal: 6, ...over } });
  const reset = async () => {
    await db.whatsappBillingSend.deleteMany({ where: { organizationId: A.org.id } });
    await db.whatsappBillingOptout.deleteMany({ where: { organizationId: A.org.id } });
    await db.financeEntry.deleteMany({ where: { organizationId: A.org.id } });
    await db.whatsappConversation.deleteMany({ where: { organizationId: A.org.id } });
    fake.requests.length = 0;
    await setSwitch(A.ctx, "billing", true); // cada teste parte da cobrança LIGADA (o padrão do sistema é desligada)
  };

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const url = await fake.start();
    Object.assign(process.env, { WHATSAPP_API_URL: url, WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: "verifica-0123456789" });
    A = await makeOrgWithOwner("bill-a");
    B = await makeOrgWithOwner("bill-b");
    ana = await addMember(A.org.id, "ASSISTANT", "bill-ana");
    const s = await startEnrollment(A.owner.id, A.owner.email);
    await confirmEnrollment(A.owner.id, totpCode(s.secret, totpStep()), META);
    await connectAccount(A.ctx, { label: "Atendimento", phoneNumberId: PNID, token: WA_TOKEN });
    clientId = (await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Maria da Silva", phone: "+55 71 96666-0001" } })).id;
    templateId = (await db.whatsappTemplate.create({ data: { organizationId: A.org.id, name: "cobranca_parcela", language: "pt_BR", status: "APPROVED", body: "Olá {{1}}, parcela {{4}} de {{2}} vence {{3}}. {{5}}", variableCount: 5 } })).id;
  });
  afterAll(async () => {
    await removeAccount(A.ctx).catch(() => undefined);
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    await fake.stop();
    process.env = { ...saved };
  });

  it("configuração: validações, permissão, modelo e isolamento", async () => {
    await expect(saveBillingSettings(ana.ctx, cfg())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveBillingSettings(A.ctx, cfg({ offsets: [] }))).rejects.toBeInstanceOf(ValidationError);
    await expect(saveBillingSettings(A.ctx, cfg({ beforeText: "curto" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(saveBillingSettings(A.ctx, cfg({ offsets: [90], maxOverdueDays: 30 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(saveBillingSettings(A.ctx, cfg({ templateId: "6f1d1b64-1f55-4c6e-8c0a-000000000000" }))).rejects.toBeInstanceOf(ValidationError);
    const before = await getBillingSettings(A.ctx);
    expect(before.saved).toBe(false);
    expect(before.enabled).toBe(false);
    await saveBillingSettings(A.ctx, cfg({ offsets: [3, -3, 0, 3] }));
    expect((await getBillingSettings(A.ctx)).offsets).toEqual([-3, 0, 3]); // ordena e remove repetidos
    expect((await getBillingSettings(B.ctx)).saved).toBe(false);
    await expect(saveBillingSettings(B.ctx, cfg({ templateId }))).rejects.toBeInstanceOf(ValidationError); // modelo de A
  });

  it("rotina: envia cada momento uma vez, no tom certo; paga/outro tipo/sem telefone não recebem", async () => {
    await reset();
    await saveBillingSettings(A.ctx, cfg());
    await say(WAID, "Oi"); // abre a janela de 24 h
    fake.requests.length = 0;
    const antes = await entry("2026-11-14");
    const hoje = await entry("2026-11-11", { installmentNo: 1 });
    const atraso = await entry("2026-11-08", { installmentNo: 3 });
    await entry("2026-11-10"); // 1 dia de atraso: não é um momento configurado
    await entry("2026-11-14", { status: "PAID", paidAmount: "500.00" });
    await entry("2026-11-14", { type: "OTHER" });
    await entry("2026-11-14", { kind: "PAYABLE" });
    await entry("2026-11-14", { clientId: null });
    const r = await runBillingReminders(NOW);
    expect(r).toMatchObject({ orgs: 1, sent: 3, failed: 0 });
    const t = texts();
    expect(t).toHaveLength(3);
    expect(t.some((x) => x.startsWith("Olá, Maria! A parcela 2/6 de R$") && x.includes("vence em 14/11/2026"))).toBe(true);
    expect(t.some((x) => x.startsWith("Olá, Maria! Hoje vence a parcela 1/6"))).toBe(true);
    expect(t.some((x) => x.includes("venceu em 08/11/2026 (Honorários — ação X)"))).toBe(true);
    expect(t.every((x) => x.includes("PIX 123") && x.endsWith("responda PARAR."))).toBe(true);
    // segunda rodada: nada novo
    expect(await runBillingReminders(NOW)).toMatchObject({ sent: 0 });
    expect(texts()).toHaveLength(3);
    expect(await db.whatsappBillingSend.count({ where: { organizationId: A.org.id, status: "SENT" } })).toBe(3);
    expect((await billingHistoryForEntry(A.ctx, antes.id))[0]).toMatchObject({ status: "SENT", kind: "BEFORE", manual: false });
    expect((await billingHistoryForEntry(A.ctx, hoje.id))[0]!.kind).toBe("DUE");
    expect((await billingHistoryForEntry(A.ctx, atraso.id))[0]!.kind).toBe("OVERDUE");
    expect((await listBillingSends(A.ctx)).length).toBe(3);
    await expect(listBillingSends(ana.ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("respeita desligado, hora do envio, fim de semana (segunda recupera) e limite de atraso", async () => {
    await reset();
    await say(WAID, "Oi");
    fake.requests.length = 0;
    await entry("2026-11-14");
    await setSwitch(A.ctx, "billing", false);
    expect((await runBillingReminders(NOW)).orgs).toBe(0);
    await saveBillingSettings(A.ctx, cfg()); // salvar a configuração NÃO liga
    expect((await runBillingReminders(NOW)).orgs).toBe(0);
    expect(texts()).toHaveLength(0);
    await setSwitch(A.ctx, "billing", true);
    await saveBillingSettings(A.ctx, cfg({ sendHour: 14 }));
    expect((await runBillingReminders(NOW)).orgs).toBe(0); // 12h em SP, antes das 14h
    await saveBillingSettings(A.ctx, cfg());
    expect((await runBillingReminders(new Date("2026-11-14T15:00:00Z"))).orgs).toBe(0); // sábado
    expect(texts()).toHaveLength(0);
    // vence no sábado 14/11, "no dia" cai no fim de semana → segunda 16/11 recupera
    await reset();
    await say(WAID, "Oi");
    fake.requests.length = 0;
    await entry("2026-11-14");
    await saveBillingSettings(A.ctx, cfg({ offsets: [0] }));
    const r = await runBillingReminders(new Date("2026-11-16T15:00:00Z"));
    expect(r.sent).toBe(1);
    // limite de atraso
    await reset();
    await say(WAID, "Oi");
    fake.requests.length = 0;
    await entry("2026-08-12");
    await saveBillingSettings(A.ctx, cfg({ offsets: [90], maxOverdueDays: 120 }));
    await db.whatsappBillingSettings.update({ where: { organizationId: A.org.id }, data: { maxOverdueDays: 60 } });
    expect((await runBillingReminders(NOW)).sent).toBe(0);
  });

  it("janela de 24 h fechada: sem modelo não envia (registra); com modelo aprovado envia o modelo", async () => {
    await reset();
    await saveBillingSettings(A.ctx, cfg({ offsets: [0], templateId: null }));
    const e = await entry("2026-11-11");
    const r1 = await runBillingReminders(NOW);
    expect(r1).toMatchObject({ sent: 0, skipped: 1 });
    expect(outs("text")).toHaveLength(0);
    expect(outs("template")).toHaveLength(0);
    const h = (await billingHistoryForEntry(A.ctx, e.id))[0]!;
    expect(h.status).toBe("SKIPPED");
    expect(h.reason).toMatch(/24 h/);
    // só configurar o modelo depois não reenvia sozinho: o momento já foi tratado
    await saveBillingSettings(A.ctx, cfg({ offsets: [0], templateId }));
    expect(await runBillingReminders(NOW)).toMatchObject({ sent: 0 });
    await reset();
    const e2 = await entry("2026-11-11");
    expect(await runBillingReminders(NOW)).toMatchObject({ sent: 1 });
    const tpl = outs("template");
    expect(tpl).toHaveLength(1);
    const params = ((tpl[0]!.body as { template: { components: { parameters: { text: string }[] }[] } }).template.components[0]!.parameters).map((p) => p.text);
    expect(params).toEqual(["Maria", expect.stringContaining("500,00"), "11/11/2026", "2/6", "Honorários — ação X"]);
    expect((await billingHistoryForEntry(A.ctx, e2.id))[0]!.status).toBe("SENT");
    // a conversa de cobrança não fica aberta nem vai para a fila de atendimento
    const c = await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: WAID } });
    expect(c.status).toBe("CLOSED");
    expect(c.assignedToId).toBeNull();
  });

  it("falha de envio é registrada e repetida depois (até 3 vezes), sem duplicar", async () => {
    await reset();
    await saveBillingSettings(A.ctx, cfg({ offsets: [0], templateId }));
    const e = await entry("2026-11-11");
    fake.state.failNext = { match: /POST .*\/messages$/, status: 400, message: "recusado" };
    expect(await runBillingReminders(NOW)).toMatchObject({ sent: 0, failed: 1 });
    expect((await billingHistoryForEntry(A.ctx, e.id))[0]!.status).toBe("FAILED");
    await db.whatsappBillingSend.updateMany({ where: { entryId: e.id }, data: { updatedAt: NOW } }); // o relógio do teste é o de NOW
    expect(await runBillingReminders(new Date(NOW.getTime() + 5 * 60_000))).toMatchObject({ sent: 0, failed: 0 }); // cedo demais
    expect(await runBillingReminders(new Date(NOW.getTime() + 40 * 60_000))).toMatchObject({ sent: 1 });
    expect(await db.whatsappBillingSend.count({ where: { entryId: e.id } })).toBe(1);
    expect(await runBillingReminders(new Date(NOW.getTime() + 90 * 60_000))).toMatchObject({ sent: 0 });
  });

  it("cliente responde PARAR: sai da lista, não reabre a conversa, nem o menu de triagem responde", async () => {
    await reset();
    await saveBillingSettings(A.ctx, cfg({ offsets: [0], templateId }));
    const e = await entry("2026-11-11");
    await runBillingReminders(NOW);
    fake.requests.length = 0;
    await say(WAID, "Parar.");
    expect(texts().at(-1)).toMatch(/Não enviaremos mais lembretes/);
    expect((await listOptouts(A.ctx)).map((o) => o.waId)).toEqual([WAID]);
    const c = await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: WAID } });
    expect(c.status).toBe("CLOSED");
    // novos lembretes e o botão manual ficam bloqueados
    const e2 = await entry("2026-11-11", { installmentNo: 4 });
    expect(await runBillingReminders(NOW)).toMatchObject({ sent: 0, skipped: 1 });
    expect((await billingAvailability(A.ctx, e2.id)).reason).toMatch(/pediu para não receber/);
    await expect(sendBillingNow(A.ctx, e2.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(removeOptout(ana.ctx, WAID)).rejects.toBeInstanceOf(ForbiddenError);
    await removeOptout(A.ctx, WAID);
    expect((await billingAvailability(A.ctx, e2.id)).ok).toBe(true);
    await expect(removeOptout(A.ctx, WAID)).rejects.toThrow();
    // "PARAR" sem cobrança recente é só uma mensagem comum
    await db.whatsappBillingSend.deleteMany({ where: { organizationId: A.org.id } });
    await say(WAID, "parar");
    expect(await listOptouts(A.ctx)).toHaveLength(0);
    void e;
  });

  it("resposta a uma cobrança não aciona o menu de triagem; é para uma pessoa", async () => {
    await reset();
    await saveBot(A.ctx, { enabled: true, greeting: "Escolha:", invalidText: "Não entendi.", handoffText: "Um atendente vai falar.", options: [{ label: "Falar de processo", reply: "", actions: [], questions: [] }] });
    await saveBillingSettings(A.ctx, cfg({ offsets: [0], templateId }));
    await entry("2026-11-11");
    await runBillingReminders(NOW);
    fake.requests.length = 0;
    await say(WAID, "Já paguei ontem");
    expect(fake.requests.some(r=>JSON.stringify(r.body).includes("Escolha:"))).toBe(false);
    const c = await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: WAID } });
    expect(c.status).toBe("OPEN"); // reabre para um atendente
    // sem cobrança recente o menu volta a funcionar
    await db.whatsappBillingSend.deleteMany({ where: { organizationId: A.org.id } });
    await db.whatsappConversation.update({ where: { id: c.id }, data: { status: "CLOSED" } });
    await say(WAID, "Oi de novo");
    expect(fake.requests.some(r=>r.body?.type==="interactive"&&JSON.stringify(r.body).includes("Escolha:"))).toBe(true);
    await saveBot(A.ctx, { enabled: false, greeting: "Escolha:", invalidText: "Não entendi.", handoffText: "Um atendente vai falar.", options: [{ label: "Falar de processo", reply: "", actions: [], questions: [] }] });
  });

  it("botão manual: permissões, motivos, 24 h de intervalo e histórico", async () => {
    await reset();
    await saveBillingSettings(A.ctx, cfg({ templateId }));
    const e = await entry("2026-11-01"); // vencida há dias (data real: hoje do servidor pode variar; o tom é calculado na hora)
    await expect(sendBillingNow(ana.ctx, e.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await billingAvailability(A.ctx, e.id)).ok).toBe(true);
    const paga = await entry("2026-11-01", { status: "PAID", paidAmount: "500.00" });
    expect((await billingAvailability(A.ctx, paga.id)).reason).toMatch(/paga ou cancelada/);
    const semCli = await entry("2026-11-01", { clientId: null });
    expect((await billingAvailability(A.ctx, semCli.id)).reason).toMatch(/cliente/i);
    const outro = await entry("2026-11-01", { type: "OTHER" });
    expect((await billingAvailability(A.ctx, outro.id)).reason).toMatch(/honorários/);
    const r = await sendBillingNow(A.ctx, e.id);
    expect(["BEFORE", "DUE", "OVERDUE"]).toContain(r.kind);
    expect(outs("template").length + outs("text").length).toBe(1);
    const h = await billingHistoryForEntry(A.ctx, e.id);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ status: "SENT", manual: true });
    expect((await billingAvailability(A.ctx, e.id)).reason).toMatch(/24 horas/);
    await expect(sendBillingNow(A.ctx, e.id)).rejects.toBeInstanceOf(ConflictError);
    // outro escritório não enxerga a parcela
    await expect(billingAvailability(B.ctx, e.id)).rejects.toThrow();
    expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "whatsapp.billing_manual" } })).toBe(1);
  });
});
