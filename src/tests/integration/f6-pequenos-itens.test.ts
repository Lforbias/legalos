import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { alertCounts, alertItems, availableAlertTabs } from "@/server/services/insights.service";
import { caseMessageTargets, clientMessageTarget, sendToClient } from "@/server/services/chat-send.service";
import { EXPORT_KIND_LIST, availableExports, exportList } from "@/server/services/export.service";
import { confirmEnrollment, disableMfa, startEnrollment } from "@/server/services/mfa.service";
import { mfaCoverage, setRequireMfa } from "@/server/services/organization.service";
import { connectAccount, removeAccount } from "@/server/services/whatsapp-account.service";
import { handleWebhook } from "@/server/services/whatsapp-webhook.service";
import { APP_SECRET, inbound, startFakeWhatsapp, WA_TOKEN } from "./fake-whatsapp";
import { addMember, META, makeOrgWithOwner } from "./helpers";

const fake = startFakeWhatsapp();
const saved = { ...process.env };
const PNID = "800900100";
const WAID = "5571955550001";
const tz = "America/Sao_Paulo";
const today = todayYmd(tz);
const d = (n: number) => ymdToDate(addDays(today, n));
const texts = () => fake.requests.filter((r) => r.method === "POST" && /\/messages$/.test(r.path) && (r.body as { type?: string })?.type === "text").map((r) => (r.body as { text: { body: string } }).text.body);

describe("2.0-F6 — pequenos itens", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let maria: string;
  let caseId: string;
  let secretCase: string;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const url = await fake.start();
    Object.assign(process.env, { WHATSAPP_API_URL: url, WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: "verifica-0123456789" });
    A = await makeOrgWithOwner("f6-a");
    B = await makeOrgWithOwner("f6-b");
    ana = await addMember(A.org.id, "ASSISTANT", "f6-ana");
    maria = (await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Maria da Silva", phone: "+55 71 95555-0001", birthDate: d(2), document: "12345678909" } })).id;
    await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Sem Telefone", birthDate: d(0) } });
    await db.client.create({ data: { organizationId: A.org.id, type: "COMPANY", name: "Empresa Ltda", birthDate: null } });
    await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Aniversário Longe", birthDate: d(40) } });
    await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Cliente Inativo", status: "INACTIVE", birthDate: d(1) } });
    await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Cliente Apagado", birthDate: d(1), deletedAt: new Date() } });
    await db.client.create({ data: { organizationId: B.org.id, type: "PERSON", name: "Cliente de Outro Escritório", birthDate: d(1) } });
    caseId = (await db.case.create({ data: { organizationId: A.org.id, title: "Processo da Maria", createdById: A.owner.id } })).id;
    secretCase = (await db.case.create({ data: { organizationId: A.org.id, title: "Processo Sigiloso", confidential: true, createdById: A.owner.id } })).id;
    for (const c of [caseId, secretCase]) await db.caseParty.create({ data: { organizationId: A.org.id, caseId: c, clientId: maria, role: "PLAINTIFF", name: "Maria da Silva", isOurClient: true } });
    await db.caseEvent.create({ data: { organizationId: A.org.id, caseId, source: "INTERNAL", kind: "NOTE", title: "Audiência marcada", occurredAt: new Date() } });
    await db.task.create({ data: { organizationId: A.org.id, title: "Tarefa visível", caseId, dueDate: d(1) } });
    await db.task.create({ data: { organizationId: A.org.id, title: "Tarefa do sigiloso", caseId: secretCase, dueDate: d(1) } });
    await db.financeEntry.create({ data: { organizationId: A.org.id, kind: "RECEIVABLE", type: "FEE", description: "Honorários Maria", amount: "500.00", paidAmount: "100.00", status: "PARTIAL", issueDate: d(-5), dueDate: d(5), clientId: maria } });
    await db.financeEntry.create({ data: { organizationId: A.org.id, kind: "RECEIVABLE", type: "FEE", description: "Honorário do sigiloso", amount: "900.00", issueDate: d(-5), dueDate: d(5), clientId: maria, caseId: secretCase } });
    await db.financeEntry.create({ data: { organizationId: B.org.id, kind: "RECEIVABLE", type: "FEE", description: "Lançamento de outro escritório", amount: "1.00", issueDate: d(-5), dueDate: d(5) } });
    const s = await startEnrollment(A.owner.id, A.owner.email);
    await confirmEnrollment(A.owner.id, totpCode(s.secret, totpStep()), META);
  });
  afterAll(async () => {
    await removeAccount(A.ctx).catch(() => undefined);
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    await fake.stop();
    process.env = { ...saved };
  });

  it("2FA obrigatório: só quem administra liga, exige o próprio 2FA, mostra a cobertura e impede desativar", async () => {
    await expect(setRequireMfa(ana.ctx, true)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(mfaCoverage(ana.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    // a Ana (sem 2FA) não consegue ligar nem se fosse admin; já o dono tem 2FA
    expect(await mfaCoverage(A.ctx)).toEqual({ total: 2, withMfa: 1, without: 1 });
    await setRequireMfa(A.ctx, true);
    expect((await db.organization.findUniqueOrThrow({ where: { id: A.org.id } })).requireMfa).toBe(true);
    await expect(disableMfa(A.owner.id, "SenhaForte123", META)).rejects.toBeInstanceOf(ConflictError);
    await setRequireMfa(A.ctx, false);
    const acts = (await db.auditLog.findMany({ where: { organizationId: A.org.id, action: { startsWith: "organization.require_mfa" } }, select: { action: true } })).map((a) => a.action);
    expect(acts).toEqual(expect.arrayContaining(["organization.require_mfa_enable", "organization.require_mfa_disable"]));
  });

  it("2FA obrigatório: quem não tem 2FA não consegue exigir dos outros", async () => {
    const adminNoMfa = await addMember(A.org.id, "ADMIN", "f6-admin");
    await expect(setRequireMfa(adminNoMfa.ctx, true)).rejects.toBeInstanceOf(ValidationError);
  });

  it("aniversariantes: só pessoa física ativa, dos próximos 7 dias, do próprio escritório; conta e itens batem", async () => {
    const items = await alertItems(A.ctx, "aniversarios");
    expect(items.map((i) => i.title)).toEqual(["Sem Telefone", "Maria da Silva"]);
    expect(items[0]).toMatchObject({ badge: "Hoje", href: expect.stringMatching(/^\/clientes\//) });
    const counts = await alertCounts(A.ctx);
    expect(counts.aniversarios).toBe(2);
    expect(availableAlertTabs(A.ctx).some((t) => t.key === "aniversarios")).toBe(true);
  });

  it("exportação geral: cada lista exige a permissão, esconde processo sigiloso de quem não é da equipe e não vaza outro escritório", async () => {
    expect(EXPORT_KIND_LIST).toEqual(["clientes", "processos", "tarefas", "lancamentos"]);
    const cl = await exportList(A.ctx, "clientes");
    expect(cl.headers[0]).toBe("Nome");
    expect(cl.rows.map((r) => r[0])).toEqual(expect.arrayContaining(["Maria da Silva", "Empresa Ltda"]));
    expect(cl.rows.map((r) => r[0])).not.toContain("Cliente de Outro Escritório");
    expect(cl.rows.map((r) => r[0])).not.toContain("Cliente Apagado");
    const pr = await exportList(A.ctx, "processos");
    expect(pr.rows.map((r) => r[0])).toEqual(expect.arrayContaining(["Processo da Maria", "Processo Sigiloso"]));
    // Ana não é da equipe do processo sigiloso
    const prAna = await exportList(ana.ctx, "processos");
    expect(prAna.rows.map((r) => r[0])).toContain("Processo da Maria");
    expect(prAna.rows.map((r) => r[0])).not.toContain("Processo Sigiloso");
    const tk = await exportList(ana.ctx, "tarefas");
    expect(tk.rows.map((r) => r[0])).toEqual(["Tarefa visível"]);
    const fn = await exportList(A.ctx, "lancamentos");
    expect(fn.rows.map((r) => r[0])).toEqual(expect.arrayContaining(["Honorários Maria", "Honorário do sigiloso"]));
    expect(fn.rows.map((r) => r[0])).not.toContain("Lançamento de outro escritório");
    const row = fn.rows.find((r) => r[0] === "Honorários Maria")!;
    expect(row[4]).toBe(500);
    expect(row[6]).toBe(400);
    expect(fn.truncated).toBe(false);
    // quem não tem a permissão de um módulo não exporta aquela lista
    const missing = EXPORT_KIND_LIST.filter((k) => !availableExports(ana.ctx).includes(k));
    for (const k of missing) await expect(exportList(ana.ctx, k)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("enviar por WhatsApp: sugere texto, bloqueia sem telefone/sem conexão, respeita a janela de 24 h e só envia o que a pessoa mandou", async () => {
    // sem WhatsApp conectado
    const t0 = await clientMessageTarget(A.ctx, maria, "Escritório Teste", "birthday");
    expect(t0?.blockedReason).toMatch(/não está conectado/);
    await expect(sendToClient(A.ctx, { clientId: maria, text: "Olá!" }, "birthday")).rejects.toBeInstanceOf(ConflictError);

    await connectAccount(A.ctx, { label: "Atendimento", phoneNumberId: PNID, token: WA_TOKEN });
    const t1 = await clientMessageTarget(A.ctx, maria, "Escritório Teste", "birthday");
    expect(t1?.blockedReason).toBeNull();
    expect(t1?.suggested).toContain("Olá, Maria!");
    const semTel = (await db.client.findFirstOrThrow({ where: { organizationId: A.org.id, name: "Sem Telefone" } })).id;
    expect((await clientMessageTarget(A.ctx, semTel, "Escritório Teste"))?.blockedReason).toMatch(/telefone válido/);
    await expect(sendToClient(A.ctx, { clientId: semTel, text: "Olá!" })).rejects.toBeInstanceOf(ConflictError);

    // processo: um alvo por cliente nosso, com texto citando o último andamento
    const targets = await caseMessageTargets(A.ctx, caseId, "Escritório Teste");
    expect(targets).toHaveLength(1);
    expect(targets[0]!.suggested).toContain("Audiência marcada");

    // Meta: fora da janela de 24 h só vale modelo aprovado; nada é enviado
    fake.requests.length = 0;
    await expect(sendToClient(A.ctx, { clientId: maria, caseId, text: "Olá, Maria! Tudo bem?" }, "case")).rejects.toThrow(/24 horas/);
    expect(texts()).toEqual([]);

    // com a janela aberta (o cliente escreveu), o envio acontece e fica na conversa, ligado ao processo
    const b = inbound(PNID, { id: "wamid.F6-1", from: WAID, text: "Oi, doutora", name: "Maria da Silva" });
    await handleWebhook(b.body, b.signature);
    const r = await sendToClient(A.ctx, { clientId: maria, caseId, text: "Olá, Maria! Tudo bem?" }, "case");
    expect(r.error).toBeNull();
    expect(texts()).toEqual(["Olá, Maria! Tudo bem?"]);
    const conv = await db.whatsappConversation.findUniqueOrThrow({ where: { id: r.conversationId } });
    expect(conv.clientId).toBe(maria);
    expect(conv.caseId).toBe(caseId);
    const aud = await db.auditLog.findFirst({ where: { action: "whatsapp.send_to_client", organizationId: A.org.id }, orderBy: { createdAt: "desc" } });
    expect(aud).toBeTruthy();
    expect(JSON.stringify(aud!.metadata)).not.toContain("Tudo bem");
  });

  it("enviar por WhatsApp: processo sigiloso não aparece para quem não é da equipe; perfil sem WhatsApp não envia; outro escritório não alcança o cliente", async () => {
    expect(await caseMessageTargets(ana.ctx, secretCase, "X").catch(() => "negado")).toBe("negado");
    const viewer = await addMember(A.org.id, "FINANCE", "f6-viewer");
    expect(await caseMessageTargets(viewer.ctx, caseId, "X")).toEqual([]);
    await expect(sendToClient(viewer.ctx, { clientId: maria, text: "Olá, tudo bem?" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sendToClient(B.ctx, { clientId: maria, text: "Olá, tudo bem?" })).rejects.toThrow();
    await expect(sendToClient(A.ctx, { clientId: maria, text: "x" })).rejects.toBeInstanceOf(ValidationError);
  });
});
