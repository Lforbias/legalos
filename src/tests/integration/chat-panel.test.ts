import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { NotFoundError } from "@/lib/permissions/check";
import { todayYmd } from "@/lib/dates/ymd";
import { totpCode, totpStep } from "@/lib/security/totp";
import { conversationPanel } from "@/server/services/chat-panel.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { connectAccount, removeAccount } from "@/server/services/whatsapp-account.service";
import { assignConversation } from "@/server/services/whatsapp.service";
import { handleWebhook } from "@/server/services/whatsapp-webhook.service";
import { APP_SECRET, inbound, startFakeWhatsapp, WA_TOKEN } from "./fake-whatsapp";
import { addMember, META, makeOrgWithOwner } from "./helpers";

const fake = startFakeWhatsapp();
const saved = { ...process.env };
const PNID = "800900100";
const WAID = "5571955550001";
let seq = 0;
const say = (text: string) => { const b = inbound(PNID, { id: `wamid.PN${++seq}`, from: WAID, text, name: "Carla Painel" }); return handleWebhook(b.body, b.signature); };
const ymd = (offset: number) => { const d = new Date(`${todayYmd("America/Sao_Paulo")}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d; };

describe("LegalOS Chat — painel lateral", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let convId: string;
  let clientId: string;
  let caseId: string;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const url = await fake.start();
    Object.assign(process.env, { WHATSAPP_API_URL: url, WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: "verifica-0123456789" });
    A = await makeOrgWithOwner("panel-a");
    B = await makeOrgWithOwner("panel-b");
    ana = await addMember(A.org.id, "ASSISTANT", "panel-ana");
    const s = await startEnrollment(A.owner.id, A.owner.email);
    await confirmEnrollment(A.owner.id, totpCode(s.secret, totpStep()), META);
    await connectAccount(A.ctx, { label: "Atendimento", phoneNumberId: PNID, token: WA_TOKEN });
    await say("Bom dia, queria falar do meu processo");
    convId = (await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: WAID } })).id;
    clientId = (await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Carla Souza", phone: "+55 71 95555-0001", document: "12345678909", email: "carla@example.test" } })).id;
    caseId = (await db.case.create({ data: { organizationId: A.org.id, number: "0001234-56.2026.5.05.0001", title: "Carla x Empresa", area: "Trabalhista", court: "TRT5", status: "ACTIVE", claimValue: "50000.00" } })).id;
    await db.caseEvent.create({ data: { organizationId: A.org.id, caseId, source: "INTERNAL", kind: "ANDAMENTO", title: "Audiência designada" } });
    await db.task.create({ data: { organizationId: A.org.id, title: "Pedir CTPS", caseId, clientId, dueDate: ymd(-2), status: "TODO" } });
    await db.task.create({ data: { organizationId: A.org.id, title: "Tarefa feita", caseId, clientId, status: "DONE" } });
    await db.deadline.create({ data: { organizationId: A.org.id, caseId, title: "Réplica", dueDate: ymd(5), status: "VALIDATED", validatedById: A.owner.id, validatedAt: new Date() } });
    await db.agendaEvent.create({ data: { organizationId: A.org.id, title: "Audiência", kind: "HEARING", startsAt: new Date(Date.now() + 3 * 86400_000), caseId, clientId } });
    await db.financeEntry.create({ data: { organizationId: A.org.id, kind: "RECEIVABLE", type: "FEE", description: "Honorários", amount: "500.00", paidAmount: "100.00", status: "PARTIAL", issueDate: ymd(-40), dueDate: ymd(-10), clientId, installmentNo: 1, installmentTotal: 3 } });
    await db.financeEntry.create({ data: { organizationId: A.org.id, kind: "RECEIVABLE", type: "FEE", description: "Honorários", amount: "500.00", issueDate: ymd(-5), dueDate: ymd(20), clientId, installmentNo: 2, installmentTotal: 3 } });
    await db.financeEntry.create({ data: { organizationId: A.org.id, kind: "PAYABLE", type: "OTHER", description: "Custa", amount: "80.00", issueDate: ymd(-5), dueDate: ymd(20), clientId } });
    await db.whatsappConversation.update({ where: { id: convId }, data: { clientId, caseId } });
  });
  afterAll(async () => {
    await removeAccount(A.ctx).catch(() => undefined);
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    await fake.stop();
    process.env = { ...saved };
  });

  it("reúne cliente, processo, agenda, financeiro, números e histórico", async () => {
    await assignConversation(A.ctx, convId, A.owner.id);
    const p = await conversationPanel(A.ctx, convId);
    expect(p.client).toMatchObject({ name: "Carla Souza", document: "12345678909", email: "carla@example.test" });
    expect(p.caseInfo).toMatchObject({ number: "0001234-56.2026.5.05.0001", area: "Trabalhista", court: "TRT5" });
    expect(p.caseInfo!.recent.map((e) => e.title)).toEqual(["Audiência designada"]);
    expect(p.agenda!.tasks.map((t) => [t.title, t.overdue])).toEqual([["Pedir CTPS", true]]); // a concluída não aparece
    expect(p.agenda!.deadlines.map((d) => [d.title, d.overdue])).toEqual([["Réplica", false]]);
    expect(p.agenda!.events.map((e) => e.title)).toEqual(["Audiência"]);
    expect(p.finance).toMatchObject({ openTotal: "900.00", overdueTotal: "400.00", overdueCount: 1 });
    expect(p.finance!.entries.map((e) => [e.remaining, e.overdue, e.installment])).toEqual([["400.00", true, "1/3"], ["500.00", false, "2/3"]]); // a pagar não entra
    expect(p.stats).toMatchObject({ incoming: 1, outgoing: 0 });
    expect(p.history.some((h) => h.kind === "ACTION" && h.text.startsWith("Responsável alterado por"))).toBe(true);
    expect(p.otherConversations).toEqual([]);
  });

  it("sem cliente nem processo: só o que existe, sem agenda nem financeiro", async () => {
    await db.whatsappConversation.update({ where: { id: convId }, data: { clientId: null, caseId: null } });
    const p = await conversationPanel(A.ctx, convId);
    expect(p.client).toBeNull();
    expect(p.caseInfo).toBeNull();
    expect(p.agenda).toBeNull();
    expect(p.finance).toBeNull();
    await db.whatsappConversation.update({ where: { id: convId }, data: { clientId, caseId } });
  });

  it("cada bloco respeita a permissão do módulo; processo sigiloso não vaza", async () => {
    const p = await conversationPanel(ana.ctx, convId);
    expect(p.finance).toBeNull(); // assistente sem Financeiro
    expect(p.history.some((h) => h.kind === "BILLING")).toBe(false);
    expect(p.caseInfo).not.toBeNull();
    await db.case.update({ where: { id: caseId }, data: { confidential: true } });
    const hidden = await conversationPanel(ana.ctx, convId);
    expect(hidden.caseInfo).toBeNull();
    expect(hidden.agenda!.tasks).toHaveLength(0);
    expect(hidden.agenda!.deadlines).toHaveLength(0);
    expect(hidden.agenda!.events).toHaveLength(0);
    const owner = await conversationPanel(A.ctx, convId);
    expect(owner.caseInfo).not.toBeNull(); // quem administra continua vendo
    await db.case.update({ where: { id: caseId }, data: { confidential: false } });
  });

  it("outro escritório não abre o painel", async () => {
    await expect(conversationPanel(B.ctx, convId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
