import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { __setTranscriberForTests } from "@/lib/ai/gemini";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { ipAllowed, normalizeIpEntry } from "@/lib/security/ip";
import { putObject } from "@/lib/storage/local-storage";
import { campaignReport, approveCampaign, createCampaign, runCampaigns, cancelCampaign } from "@/server/services/chat-campaigns.service";
import { delegateToResponsible, deleteDialog, listDialogRuns, runDialogs, saveDialog, saveIntent, scoreIntent, setDialogActive, setIntentActive, testIntents } from "@/server/services/chat-dialogs.service";
import { runChatExtras, setExtrasSettings } from "@/server/services/chat-extras.service";
import { chatReportExtra, getReportSchedule, runReportSchedules, saveReportSchedule } from "@/server/services/chat-report.service";
import { addLibraryFile, createLabelPreset, findMentions, forwardMessage, listChatStatuses, runAutoArchive, saveChatStatus, saveChecklist, sendChecklist, sendLibraryFile, setChatStatus } from "@/server/services/chat-tools.service";
import { transcribeMessage, transcriptsFor } from "@/server/services/chat-transcribe.service";
import { checkOrgAccess, hasModule, listOrgSessions, revokeOrgSession, saveSecuritySettings, assertModule } from "@/server/services/org-security.service";
import { connectAccount } from "@/server/services/whatsapp-account.service";
import { addNote } from "@/server/services/whatsapp.service";
import { handleWebhook } from "@/server/services/whatsapp-webhook.service";
import { APP_SECRET, inbound, startFakeWhatsapp, WA_TOKEN } from "./fake-whatsapp";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { addMember, META, makeOrgWithOwner } from "./helpers";

const fake = startFakeWhatsapp();
const saved = { ...process.env };
const P1 = "720000001";
const MARIA = "5571999990001";
const JOSE = "5571999990002";
const ANA_CLIENT = "5571999990003";
const post = (b: { body: string; signature: string }) => handleWebhook(b.body, b.signature);
const sentTo = (pnid: string) => fake.requests.filter((r) => r.method === "POST" && r.path.includes(`/${pnid}/messages`));
const lastText = () => JSON.stringify(sentTo(P1).at(-1)?.body ?? {});

describe("4.0 — Chat: robô 2.0, campanhas, relatórios, segurança e módulos", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let mariaId: string;
  let joseId: string;
  let convMaria: string;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const url = await fake.start();
    Object.assign(process.env, { WHATSAPP_API_URL: url, WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: "verifica-0123456789" });
    A = await makeOrgWithOwner("f40-a");
    ana = await addMember(A.org.id, "ASSISTANT", "f40-ana");
    const en = await startEnrollment(A.owner.id, A.owner.email);
    await confirmEnrollment(A.owner.id, totpCode(en.secret, totpStep()), META);
    await connectAccount(A.ctx, { label: "Principal", phoneNumberId: P1, token: WA_TOKEN });
    // O sistema decide "hoje" pelo fuso do escritório; o teste precisa usar o mesmo dia (entre 21h e meia-noite em Brasília o dia em UTC já é o seguinte).
    const [, month, day] = todayYmd("America/Sao_Paulo").split("-").map(Number);
    const bday = new Date(Date.UTC(1990, month! - 1, day!));
    mariaId = (await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Maria Souza", phone: MARIA, birthDate: bday } })).id;
    joseId = (await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "José Lima", phone: JOSE } })).id;
  });
  afterAll(async () => {
    __setTranscriberForTests(undefined);
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    await fake.stop();
    process.env = { ...saved };
  });

  // ---------------------------------------------------------------- segurança
  it("IP permitido: valida entradas, aceita faixa CIDR e NÃO deixa ligar sem o IP de quem configura", async () => {
    expect(normalizeIpEntry("200.10.0.5")).toBe("200.10.0.5");
    expect(normalizeIpEntry("200.10.0.0/24")).toBe("200.10.0.0/24");
    expect(normalizeIpEntry("abc")).toBeNull();
    expect(normalizeIpEntry("300.1.1.1")).toBeNull();
    expect(ipAllowed("200.10.0.77", ["200.10.0.0/24"])).toBe(true);
    expect(ipAllowed("200.10.1.77", ["200.10.0.0/24"])).toBe(false);
    expect(ipAllowed("::ffff:200.10.0.5", ["200.10.0.5"])).toBe(true);
    expect(ipAllowed(null, ["200.10.0.5"])).toBe(false);

    const mine = { ...A.ctx, meta: { ...A.ctx.meta, ipAddress: "200.10.0.7" } };
    await expect(saveSecuritySettings(ana.ctx, { ipAllowlist: [], ipEnforced: false, idleLogoutMinutes: null })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveSecuritySettings(mine, { ipAllowlist: ["xx"], ipEnforced: false, idleLogoutMinutes: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveSecuritySettings(mine, { ipAllowlist: [], ipEnforced: true, idleLogoutMinutes: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveSecuritySettings(mine, { ipAllowlist: ["9.9.9.9"], ipEnforced: true, idleLogoutMinutes: null })).rejects.toBeInstanceOf(ConflictError); // trava anti-bloqueio
    await expect(saveSecuritySettings(mine, { ipAllowlist: ["200.10.0.0/24"], ipEnforced: false, idleLogoutMinutes: 5 })).rejects.toBeInstanceOf(ValidationError); // mínimo 10 min
    await saveSecuritySettings(mine, { ipAllowlist: ["200.10.0.0/24"], ipEnforced: true, idleLogoutMinutes: 30 });
    const now = new Date();
    expect(await checkOrgAccess(A.org.id, "200.10.0.99", now)).toBe("ok");
    expect(await checkOrgAccess(A.org.id, "8.8.8.8", now)).toBe("ip");
    expect(await checkOrgAccess(A.org.id, "200.10.0.99", new Date(now.getTime() - 31 * 60_000))).toBe("idle");
    expect(await checkOrgAccess(A.org.id, "200.10.0.99", new Date(now.getTime() - 29 * 60_000))).toBe("ok");
    await saveSecuritySettings(mine, { ipAllowlist: [], ipEnforced: false, idleLogoutMinutes: null });
    expect(await checkOrgAccess(A.org.id, "8.8.8.8", new Date(0))).toBe("ok");
  });

  it("sessões da equipe: admin lista e encerra; de outro escritório não aparece", async () => {
    const s = await db.session.create({ data: { userId: ana.user.id, tokenHash: `h-${Math.random()}`, expiresAt: new Date(Date.now() + 3600_000), ipAddress: "1.2.3.4" } });
    const list = await listOrgSessions(A.ctx);
    expect(list.some((x) => x.id === s.id)).toBe(true);
    await expect(listOrgSessions(ana.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    const B = await makeOrgWithOwner("f40-b");
    await expect(revokeOrgSession(B.ctx, s.id)).rejects.toThrow(/não encontrada/);
    await revokeOrgSession(A.ctx, s.id);
    expect((await db.session.findUniqueOrThrow({ where: { id: s.id } })).revokedAt).not.toBeNull();
  });

  // ---------------------------------------------------------------- módulos
  it("módulos por plano: plano sem 'mod:' libera tudo; com 'mod:' libera só o listado", async () => {
    expect(await hasModule(A.org.id, "campanhas")).toBe(true);
    const plan = await db.plan.create({ data: { key: `f40-${Math.random().toString(36).slice(2, 8)}`, name: "Básico F40", features: ["mod:ia"] } });
    const prevSub = await db.subscription.findUniqueOrThrow({ where: { organizationId: A.org.id } });
    await db.subscription.update({ where: { organizationId: A.org.id }, data: { planId: plan.id, status: "ACTIVE" } });
    expect(await hasModule(A.org.id, "ia")).toBe(true);
    expect(await hasModule(A.org.id, "campanhas")).toBe(false);
    await expect(assertModule(A.org.id, "cofre")).rejects.toThrow(/não está incluído/);
    await expect(createCampaign(A.ctx, { name: "Teste", text: "Oi {nome}", clientIds: [mariaId] })).rejects.toThrow();
    await db.subscription.update({ where: { organizationId: A.org.id }, data: { planId: prevSub.planId, status: prevSub.status } });
    await db.plan.delete({ where: { id: plan.id } });
    expect(await hasModule(A.org.id, "campanhas")).toBe(true);
  });

  // ---------------------------------------------------------------- etiquetas, menções, status, biblioteca
  it("etiquetas prontas sem duplicar, menção a colega, status de chat e checklist enviável", async () => {
    const r = await createLabelPreset(A.ctx, "area");
    expect(r.created.length).toBeGreaterThan(5);
    const again = await createLabelPreset(A.ctx, "area");
    expect(again.created).toEqual([]);
    expect(again.skipped.length).toBe(r.created.length);
    await expect(createLabelPreset(ana.ctx, "origem")).rejects.toBeInstanceOf(ForbiddenError);

    await post(inbound(P1, { id: "wamid.40A", from: MARIA, name: "Maria", text: "Olá, preciso de ajuda" }));
    convMaria = (await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: MARIA } })).id;
    expect(findMentions("oi @f40-ana veja", [{ id: ana.user.id, name: ana.user.name }, { id: "x", name: "Outro" }]).length).toBeGreaterThanOrEqual(0);
    await addNote(A.ctx, convMaria, `Caso para ${ana.user.name.split(" ")[0]}: @${ana.user.name.split(" ")[0]} ${ana.user.name.split(" ").slice(1).join(" ")} por favor veja`);

    const st = await saveChatStatus(A.ctx, null, { name: "Aguardando documentos", color: "#2563eb" });
    await setChatStatus(A.ctx, convMaria, st.id);
    expect((await db.whatsappConversation.findUniqueOrThrow({ where: { id: convMaria } })).chatStatusId).toBe(st.id);
    expect((await listChatStatuses(A.ctx)).length).toBe(1);
    await setChatStatus(A.ctx, convMaria, null);

    const ck = await saveChecklist(A.ctx, null, { title: "Documentos", items: ["RG", "CPF", "Comprovante"] });
    const before = sentTo(P1).length;
    await sendChecklist(A.ctx, convMaria, ck.id);
    expect(sentTo(P1).length).toBe(before + 1);
    expect(lastText()).toContain("CPF");

    const lib = await addLibraryFile(A.ctx, { title: "Modelo de procuração", file: { name: "procuracao.pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") } });
    await expect(sendLibraryFile(A.ctx, convMaria, lib.id)).resolves.toBeDefined();
  });

  it("encaminhar a vários chats e arquivamento automático (só encerra, não escreve ao cliente)", async () => {
    await post(inbound(P1, { id: "wamid.40B", from: JOSE, name: "José", text: "Boa tarde" }));
    const convJose = (await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: JOSE } })).id;
    const msg = await db.whatsappMessage.findFirstOrThrow({ where: { conversationId: convMaria, direction: "IN" } });
    const res = await forwardMessage(A.ctx, msg.id, [convJose]);
    expect(res[0]!.ok).toBe(true);

    await setExtrasSettings(A.ctx, { archiveEnabled: true, archiveDays: 3 });
    await db.whatsappConversation.update({ where: { id: convJose }, data: { lastMessageAt: new Date(Date.now() - 5 * 86_400_000) } });
    const out = before();
    const r = await runAutoArchive(new Date());
    expect(r.closed).toBeGreaterThanOrEqual(1);
    expect((await db.whatsappConversation.findUniqueOrThrow({ where: { id: convJose } })).status).toBe("CLOSED");
    expect(sentTo(P1).length).toBe(out()); // nada foi escrito ao cliente
    await setExtrasSettings(A.ctx, { archiveEnabled: false });
    await db.whatsappConversation.update({ where: { id: convJose }, data: { status: "OPEN" } });
  });

  // ---------------------------------------------------------------- diálogos
  it("diálogo de aniversário: nasce desligado, envia uma vez, respeita 'parar' e não repete", async () => {
    await expect(saveDialog(ana.ctx, null, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveDialog(A.ctx, null, { kind: "BIRTHDAY", name: "Parabéns", text: "Feliz aniversário, {nome}!", config: { sendHour: 99 } })).rejects.toBeInstanceOf(ValidationError);
    const d = await saveDialog(A.ctx, null, { kind: "BIRTHDAY", name: "Parabéns", text: "Feliz aniversário, {nome}!", config: { sendHour: 0 } });
    expect(d.active).toBe(false);
    const before1 = sentTo(P1).length;
    await runDialogs();
    expect(sentTo(P1).length).toBe(before1); // desligado: nada
    await setDialogActive(A.ctx, d.id, true);
    await runDialogs();
    expect(sentTo(P1).length).toBe(before1 + 1);
    expect(lastText()).toContain("Feliz aniversário, Maria!");
    await runDialogs();
    expect(sentTo(P1).length).toBe(before1 + 1); // idempotente
    expect((await listDialogRuns(A.ctx)).filter((r) => r.status === "SENT").length).toBe(1);
    await deleteDialog(A.ctx, d.id);
  });

  it("diálogo de horário responde a perguntas; opt-out bloqueia aviso de audiência", async () => {
    const h = await saveDialog(A.ctx, null, { kind: "HOURS", name: "Horário", text: "Estamos abertos! Atendemos de segunda a sexta.", config: { keywords: "horário, funcionamento", closedText: "Estamos fechados agora, voltamos no próximo dia útil." } });
    await setDialogActive(A.ctx, h.id, true);
    const b = sentTo(P1).length;
    await post(inbound(P1, { id: "wamid.40C", from: MARIA, name: "Maria", text: "Qual o horário de vocês?" }));
    expect(sentTo(P1).length).toBe(b + 1);
    expect(lastText()).toMatch(/abertos|fechados/);
    await post(inbound(P1, { id: "wamid.40D", from: MARIA, name: "Maria", text: "obrigada" }));
    expect(sentTo(P1).length).toBe(b + 1);

    const hearing = await saveDialog(A.ctx, null, { kind: "HEARING", name: "Audiência", text: "Olá {nome}, lembrete: {titulo} em {data} às {hora}.", config: { daysBefore: 0, sendHour: 0 } });
    await setDialogActive(A.ctx, hearing.id, true);
    const startsAt = new Date(ymdToDate(todayYmd("America/Sao_Paulo")).getTime() + 15 * 3600_000); // meio-dia de hoje em Brasília, qualquer que seja a hora em que o teste rode
    await db.agendaEvent.create({ data: { organizationId: A.org.id, title: "Audiência de instrução", kind: "HEARING", startsAt, clientId: joseId } });
    await db.agendaEvent.create({ data: { organizationId: A.org.id, title: "Audiência da Maria", kind: "HEARING", startsAt, clientId: mariaId } });
    await db.whatsappBillingOptout.create({ data: { organizationId: A.org.id, waId: JOSE } });
    await runDialogs();
    const runs = await listDialogRuns(A.ctx, 20);
    expect(runs.some((r) => r.status === "SKIPPED" && /não receber/.test(r.message ?? ""))).toBe(true);
    await db.whatsappBillingOptout.delete({ where: { organizationId_waId: { organizationId: A.org.id, waId: JOSE } } });
    await deleteDialog(A.ctx, h.id);
    await deleteDialog(A.ctx, hearing.id);
  });

  it("delegar ao advogado responsável do processo (com a chave ligada)", async () => {
    const c = await db.case.create({ data: { organizationId: A.org.id, title: "Caso delegado", status: "ACTIVE" } });
    await db.caseMember.create({ data: { organizationId: A.org.id, caseId: c.id, userId: ana.user.id, role: "RESPONSIBLE" } });
    const anaClient = await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Cliente da Ana", phone: ANA_CLIENT } });
    await db.caseParty.create({ data: { organizationId: A.org.id, caseId: c.id, clientId: anaClient.id, role: "PLAINTIFF", name: "Cliente da Ana", isOurClient: true } });
    await post(inbound(P1, { id: "wamid.40E", from: ANA_CLIENT, name: "Cliente", text: "Oi" }));
    const conv = await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: ANA_CLIENT } });
    expect(conv.assignedToId).not.toBe(ana.user.id); // chave desligada: não delega
    await db.whatsappConversation.update({ where: { id: conv.id }, data: { assignedToId: null } });
    await setExtrasSettings(A.ctx, { delegateEnabled: true });
    expect(await delegateToResponsible(A.org.id, conv.id)).toBe(ana.user.id);
    expect((await db.whatsappConversation.findUniqueOrThrow({ where: { id: conv.id } })).assignedToId).toBe(ana.user.id);
    expect(await delegateToResponsible(A.org.id, conv.id)).toBeNull(); // já tem responsável
    await setExtrasSettings(A.ctx, { delegateEnabled: false });
  });

  // ---------------------------------------------------------------- intenções
  it("intenções por pontuação: pontua, escolhe a melhor, executa as ações e não repete", async () => {
    expect(scoreIntent("Quero saber da AUDIÊNCIA e do prazo", [{ term: "audiencia", weight: 3 }, { term: "prazo", weight: 2 }, { term: "boleto", weight: 5 }])).toBe(5);
    const label = await db.whatsappLabel.findFirstOrThrow({ where: { organizationId: A.org.id } });
    await expect(saveIntent(A.ctx, null, { name: "x", terms: [], threshold: 3, actions: [] })).rejects.toBeInstanceOf(ValidationError);
    const i = await saveIntent(A.ctx, null, { name: "Dúvida de audiência", terms: [{ term: "audiência", weight: 3 }, { term: "perícia", weight: 3 }, { term: "data", weight: 1 }], threshold: 4, actions: [{ type: "ADD_LABEL", labelId: label.id }] });
    expect(i.active).toBe(false);
    const t = await testIntents(A.ctx, "qual a data da audiência e da perícia?");
    expect(t[0]!.score).toBe(7);
    await setIntentActive(A.ctx, i.id, true);
    await post(inbound(P1, { id: "wamid.40F", from: MARIA, name: "Maria", text: "qual a data da audiência?" })); // 4 pontos
    const rotulada = async () => db.whatsappConversationLabel.count({ where: { conversationId: convMaria, labelId: label.id } });
    expect(await rotulada()).toBe(0); // chave global desligada
    await setExtrasSettings(A.ctx, { intentsEnabled: true });
    await post(inbound(P1, { id: "wamid.40G", from: MARIA, name: "Maria", text: "e a perícia, quando?" })); // 3 pontos: abaixo do limite
    expect(await rotulada()).toBe(0);
    await post(inbound(P1, { id: "wamid.40H", from: MARIA, name: "Maria", text: "data da audiência e da perícia" })); // 7
    expect(await rotulada()).toBe(1);
    const notes = await db.whatsappMessage.count({ where: { conversationId: convMaria, direction: "NOTE", body: { startsWith: "Intenção “Dúvida de audiência”" } } });
    await post(inbound(P1, { id: "wamid.40I", from: MARIA, name: "Maria", text: "data da audiência e da perícia de novo" }));
    expect(await db.whatsappMessage.count({ where: { conversationId: convMaria, direction: "NOTE", body: { startsWith: "Intenção “Dúvida de audiência”" } } })).toBe(notes);
    await setExtrasSettings(A.ctx, { intentsEnabled: false });
  });

  // ---------------------------------------------------------------- campanhas
  it("campanhas: desligada por padrão, exige modelo na Meta, aprovação humana, opt-out, envio em lote e relatório", async () => {
    const input = { name: "Aviso de recesso", text: "Olá {nome}, o escritório estará fechado na sexta.", clientIds: [mariaId, joseId] };
    await expect(createCampaign(A.ctx, input)).rejects.toThrow(/desligadas/);
    await setExtrasSettings(A.ctx, { campaignsEnabled: true });
    await expect(createCampaign(A.ctx, input)).rejects.toBeInstanceOf(ValidationError); // Meta: sem modelo
    const tpl = await db.whatsappTemplate.create({ data: { organizationId: A.org.id, name: "recesso", language: "pt_BR", status: "APPROVED", body: "Olá {{1}}, aviso do escritório.", variableCount: 1 } });
    await db.whatsappBillingOptout.create({ data: { organizationId: A.org.id, waId: JOSE } });
    const camp = await createCampaign(A.ctx, { ...input, templateId: tpl.id });
    const rep0 = await campaignReport(A.ctx, camp.id);
    expect(rep0.recipients.find((r) => r.name === "José Lima")!.status).toBe("SKIPPED");
    expect(camp.status).toBe("DRAFT");

    const b0 = sentTo(P1).length;
    await runCampaigns();
    expect(sentTo(P1).length).toBe(b0); // rascunho nunca sai
    await expect(approveCampaign(ana.ctx, camp.id)).rejects.toBeInstanceOf(ForbiddenError);
    await approveCampaign(A.ctx, camp.id);
    const r = await runCampaigns();
    expect(r.sent).toBe(1);
    expect(r.finished).toBe(1);
    expect(sentTo(P1).length).toBe(b0 + 1);
    const rep = await campaignReport(A.ctx, camp.id);
    expect(rep.campaign.status).toBe("DONE");
    expect(rep.recipients.filter((x) => x.status === "SENT").map((x) => x.name)).toEqual(["Maria Souza"]);
    await runCampaigns();
    expect(sentTo(P1).length).toBe(b0 + 1);

    // desligar a chave pausa; cancelar impede envio
    const c2 = await createCampaign(A.ctx, { ...input, name: "Outra", clientIds: [mariaId], templateId: tpl.id });
    await approveCampaign(A.ctx, c2.id);
    await setExtrasSettings(A.ctx, { campaignsEnabled: false });
    await runCampaigns();
    expect((await db.whatsappCampaign.findUniqueOrThrow({ where: { id: c2.id } })).status).toBe("PAUSED");
    expect(sentTo(P1).length).toBe(b0 + 1);
    await cancelCampaign(A.ctx, c2.id);
    await db.whatsappBillingOptout.delete({ where: { organizationId_waId: { organizationId: A.org.id, waId: JOSE } } });
  });

  // ---------------------------------------------------------------- relatórios
  it("relatórios novos e resumo agendado por e-mail", async () => {
    const range = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 3600_000) };
    const x = await chatReportExtra(A.ctx, range);
    expect(x.added.reduce((s, d) => s + d.count, 0)).toBeGreaterThanOrEqual(3);
    expect(x.addedByNumber[0]!.label).toBe("Principal");
    expect(Array.isArray(x.responseByUser)).toBe(true);
    await expect(chatReportExtra(ana.ctx, range)).rejects.toBeInstanceOf(ForbiddenError);

    await expect(saveReportSchedule(A.ctx, { enabled: true, frequency: "WEEKLY", recipients: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveReportSchedule(A.ctx, { enabled: true, frequency: "WEEKLY", recipients: ["isso-nao-e-email"] })).rejects.toBeInstanceOf(ValidationError);
    await saveReportSchedule(A.ctx, { enabled: true, frequency: "DAILY", recipients: ["Gestao@Exemplo.com.br", "gestao@exemplo.com.br"] });
    expect((await getReportSchedule(A.ctx)).recipients).toEqual(["gestao@exemplo.com.br"]);
    await expect(runReportSchedules()).resolves.toBeDefined();
    await saveReportSchedule(A.ctx, { enabled: false, frequency: "DAILY", recipients: [] });
  });

  // ---------------------------------------------------------------- transcrição
  it("transcrição de áudio (Gemini simulado): exige chaves, usa cache, cobra créditos uma vez", async () => {
    const key = `${A.org.id}/${randomUUID()}`;
    await putObject(key, Buffer.from("OggS-fake-audio"));
    const conv = await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: MARIA } });
    const m = await db.whatsappMessage.create({ data: { organizationId: A.org.id, conversationId: conv.id, direction: "IN", type: "audio", status: "RECEIVED", mediaKey: key, mediaMime: "audio/ogg; codecs=opus", mediaSize: 15, waMessageId: "wamid.AUDIO1" } });
    let calls = 0;
    __setTranscriberForTests({ name: "gemini", model: "gemini-teste", async transcribe() { calls++; return { text: "Oi doutora, quero saber do meu processo.", inputTokens: 30, outputTokens: 12 }; } });
    await expect(transcribeMessage(A.ctx, m.id)).rejects.toThrow(/desligada/); // chave do Chat
    await setExtrasSettings(A.ctx, { transcribeEnabled: true });
    await expect(transcribeMessage(A.ctx, m.id)).rejects.toThrow(/IA está desligada/);
    await db.organization.update({ where: { id: A.org.id }, data: { aiEnabled: true, creditsEnabled: true } });
    await expect(transcribeMessage(A.ctx, m.id)).rejects.toThrow(/Créditos insuficientes/);
    expect(calls).toBe(0);
    await db.creditGrant.create({ data: { organizationId: A.org.id, amount: 5, remaining: 5 } });
    const r1 = await transcribeMessage(A.ctx, m.id);
    expect(r1).toEqual({ text: "Oi doutora, quero saber do meu processo.", cached: false });
    expect((await db.creditGrant.aggregate({ where: { organizationId: A.org.id }, _sum: { remaining: true } }))._sum.remaining).toBe(3); // 2 créditos
    const r2 = await transcribeMessage(A.ctx, m.id);
    expect(r2.cached).toBe(true);
    expect(calls).toBe(1);
    expect((await db.creditGrant.aggregate({ where: { organizationId: A.org.id }, _sum: { remaining: true } }))._sum.remaining).toBe(3);
    expect((await transcriptsFor(A.ctx, [m.id]))[m.id]).toContain("meu processo");
    const txt = await db.whatsappMessage.create({ data: { organizationId: A.org.id, conversationId: conv.id, direction: "IN", type: "text", status: "RECEIVED", body: "oi", waMessageId: "wamid.TXT1" } });
    await expect(transcribeMessage(A.ctx, txt.id)).rejects.toThrow(/não é um áudio/);
  });

  it("a rotina de 1 minuto roda todas as partes sem derrubar nenhuma", async () => {
    const r = await runChatExtras();
    expect(r["erro"]).toBeUndefined();
    expect(Object.keys(r).some((k) => k.endsWith("erro"))).toBe(false);
  });
});

function before() {
  const n = sentTo(P1).length;
  return () => n;
}
