import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { saveLabel, setConversationLabels } from "@/server/services/chat-meta.service";
import { deleteAutomation, listAutomationRuns, listAutomations, saveAutomation, setAutomationActive } from "@/server/services/chat-automation.service";
import { saveQueue } from "@/server/services/chat-queue.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { connectAccount, removeAccount, updateSettings } from "@/server/services/whatsapp-account.service";
import { handleWebhook } from "@/server/services/whatsapp-webhook.service";
import { APP_SECRET, inbound, startFakeWhatsapp, WA_TOKEN } from "./fake-whatsapp";
import { addMember, META, makeOrgWithOwner } from "./helpers";

const fake = startFakeWhatsapp();
const saved = { ...process.env };
const PNID = "300400500";
const post = (b: { body: string; signature: string }) => handleWebhook(b.body, b.signature);
const out = () => fake.requests.filter((r) => r.method === "POST" && /\/messages$/.test(r.path));
let seq = 0;
const msg = (from: string, text: string) => post(inbound(PNID, { id: `wamid.AU${++seq}`, from, text, name: "Cliente Auto" }));
const conv = (waId: string) => db.whatsappConversation.findFirstOrThrow({ where: { waId }, include: { labels: { select: { label: { select: { name: true } } } } } });

describe("LegalOS Chat — automações", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let urgent: string;
  let queueId: string;

  const reset = async () => {
    await db.whatsappAutomation.deleteMany({ where: { organizationId: A.org.id } });
    await db.whatsappConversation.deleteMany({ where: { organizationId: A.org.id } });
  };

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const url = await fake.start();
    Object.assign(process.env, { WHATSAPP_API_URL: url, WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: "verifica-0123456789" });
    A = await makeOrgWithOwner("auto-a");
    B = await makeOrgWithOwner("auto-b");
    ana = await addMember(A.org.id, "ASSISTANT", "auto-ana");
    const s = await startEnrollment(A.owner.id, A.owner.email);
    await confirmEnrollment(A.owner.id, totpCode(s.secret, totpStep()), META);
    await connectAccount(A.ctx, { label: "Atendimento", phoneNumberId: PNID, token: WA_TOKEN });
    urgent = (await saveLabel(A.ctx, null, { name: "Urgente", color: "#dc2626" })).id;
    queueId = (await saveQueue(A.ctx, null, { name: "Previdenciário", strategy: "MANUAL" })).id;
  });
  afterAll(async () => {
    await removeAccount(A.ctx).catch(() => undefined);
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    await fake.stop();
    process.env = { ...saved };
  });

  it("palavra-chave (sem acento/maiúscula): etiqueta, fila, tarefa, aviso e nota; roda uma vez por conversa", async () => {
    await reset();
    const a = await saveAutomation(A.ctx, null, {
      name: "Audiência urgente", trigger: "KEYWORD", triggerValue: "audiência, perícia", oncePerConversation: true, active: true,
      actions: [
        { type: "ADD_LABEL", labelId: urgent },
        { type: "TRANSFER_QUEUE", queueId },
        { type: "CREATE_TASK", title: "Ligar para {{contato}} sobre audiência", dueDays: 2, assigneeId: ana.user.id },
        { type: "NOTIFY", userId: ana.user.id },
      ],
    });
    await msg("5571977770001", "Bom dia"); // não bate
    expect(await db.whatsappAutomationRun.count({ where: { automationId: a.id } })).toBe(0);
    await msg("5571977770001", "Tenho AUDIENCIA amanhã, e agora?");
    const c = await conv("5571977770001");
    expect(c.labels.map((l) => l.label.name)).toEqual(["Urgente"]);
    expect(c.queueId).toBe(queueId);
    const task = await db.task.findFirstOrThrow({ where: { organizationId: A.org.id, title: { contains: "audiência" } } });
    expect(task.title).toBe("Ligar para Cliente Auto sobre audiência");
    expect(task.assigneeId).toBe(ana.user.id);
    expect(task.description).toContain("AUDIENCIA amanhã");
    expect(await db.notification.count({ where: { organizationId: A.org.id, userId: ana.user.id, kind: "chat.automation" } })).toBe(1);
    expect(await db.whatsappMessage.count({ where: { conversationId: c.id, direction: "NOTE", body: { startsWith: "Automação “Audiência urgente”" } } })).toBe(1);
    await msg("5571977770001", "Sobre a perícia também"); // mesma conversa: não repete
    expect(await db.task.count({ where: { organizationId: A.org.id, title: { contains: "audiência" } } })).toBe(1);
    await msg("5571977770002", "Marcaram minha perícia"); // outra conversa: roda
    expect(await db.task.count({ where: { organizationId: A.org.id, title: { contains: "audiência" } } })).toBe(2);
    const runs = await listAutomationRuns(A.ctx);
    expect(runs.filter((r) => r.status === "DONE")).toHaveLength(2);
  });

  it("conversa nova: responde ao cliente (automática) e atribui; o cliente que volta não recebe de novo", async () => {
    await reset();
    await saveAutomation(A.ctx, null, { name: "Boas-vindas", trigger: "NEW_CONVERSATION", oncePerConversation: true, active: true, actions: [{ type: "SEND_REPLY", text: "Olá, {{contato}}! Recebemos sua mensagem." }, { type: "ASSIGN", userId: ana.user.id }] });
    const n = out().length;
    await msg("5571977770003", "Oi");
    const sent = out().slice(n);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toMatchObject({ text: { body: "Olá, Cliente Auto! Recebemos sua mensagem." } });
    const c = await conv("5571977770003");
    expect(c.assignedToId).toBe(ana.user.id);
    expect(await db.whatsappMessage.count({ where: { conversationId: c.id, automatic: true } })).toBe(1);
    await msg("5571977770003", "Voltei");
    expect(out().slice(n)).toHaveLength(1);
  });

  it("fora do expediente dispara; dentro do expediente não", async () => {
    await reset();
    await saveAutomation(A.ctx, null, { name: "Plantão", trigger: "OUTSIDE_HOURS", oncePerConversation: false, active: true, actions: [{ type: "ADD_LABEL", labelId: urgent }] });
    await updateSettings(A.ctx, { awayEnabled: false, awayMessage: "", openFrom: "00:00", openUntil: "23:59", openDays: [0, 1, 2, 3, 4, 5, 6] });
    await msg("5571977770004", "Dentro do horário");
    expect((await conv("5571977770004")).labels).toHaveLength(0);
    await updateSettings(A.ctx, { awayEnabled: false, awayMessage: "", openFrom: "00:00", openUntil: "00:00", openDays: [] });
    await msg("5571977770005", "Fora do horário");
    expect((await conv("5571977770005")).labels.map((l) => l.label.name)).toEqual(["Urgente"]);
    await updateSettings(A.ctx, { awayEnabled: false, awayMessage: "", openFrom: "09:00", openUntil: "18:00", openDays: [1, 2, 3, 4, 5] });
  });

  it("etiqueta colocada por pessoa dispara; colocada por automação não encadeia", async () => {
    await reset();
    const normal = (await saveLabel(A.ctx, null, { name: "Prioridade", color: "#2563eb" })).id;
    await saveAutomation(A.ctx, null, { name: "Urgente vira tarefa", trigger: "LABEL_ADDED", triggerValue: urgent, oncePerConversation: true, active: true, actions: [{ type: "CREATE_TASK", title: "Tratar urgente de {{contato}}", dueDays: 0, assigneeId: null }] });
    await saveAutomation(A.ctx, null, { name: "Palavra põe urgente", trigger: "KEYWORD", triggerValue: "socorro", oncePerConversation: true, active: true, actions: [{ type: "ADD_LABEL", labelId: urgent }] });
    await msg("5571977770006", "socorro");
    const c = await conv("5571977770006");
    expect(c.labels.map((l) => l.label.name)).toEqual(["Urgente"]);
    expect(await db.task.count({ where: { organizationId: A.org.id, title: { startsWith: "Tratar urgente" } } })).toBe(0); // automação não aciona automação
    await msg("5571977770007", "oi");
    const c2 = await conv("5571977770007");
    await setConversationLabels(ana.ctx, c2.id, [normal]);
    expect(await db.task.count({ where: { organizationId: A.org.id, title: { startsWith: "Tratar urgente" } } })).toBe(0);
    await setConversationLabels(ana.ctx, c2.id, [normal, urgent]);
    const t = await db.task.findFirstOrThrow({ where: { organizationId: A.org.id, title: { startsWith: "Tratar urgente" } } });
    expect(t.title).toBe("Tratar urgente de Cliente Auto");
    expect(t.assigneeId).toBeNull(); // conversa sem responsável
  });

  it("proteções: teto de respostas automáticas, ação que falha não derruba as outras, desligada não roda", async () => {
    await reset();
    const a = await saveAutomation(A.ctx, null, { name: "Eco", trigger: "KEYWORD", triggerValue: "eco", oncePerConversation: false, active: true, actions: [{ type: "SEND_REPLY", text: "Recebido." }, { type: "ADD_LABEL", labelId: urgent }] });
    const n = out().length;
    for (let i = 0; i < 5; i++) await msg("5571977770008", `eco ${i}`);
    expect(out().slice(n)).toHaveLength(3); // teto: 3 a cada 10 min
    const runs = (await listAutomationRuns(A.ctx)).filter((r) => r.automation.name === "Eco");
    expect(runs).toHaveLength(5);
    expect(runs.filter((r) => r.status === "PARTIAL")).toHaveLength(2);
    expect(runs.find((r) => r.status === "PARTIAL")!.message).toContain("limite de respostas automáticas");
    expect((await conv("5571977770008")).labels.map((l) => l.label.name)).toEqual(["Urgente"]); // a etiqueta saiu mesmo assim

    await setAutomationActive(A.ctx, a.id, false);
    const before = await db.whatsappAutomationRun.count({ where: { automationId: a.id } });
    await msg("5571977770008", "eco de novo");
    expect(await db.whatsappAutomationRun.count({ where: { automationId: a.id } })).toBe(before);
  });

  it("validações, permissão e isolamento", async () => {
    await reset();
    const ok = { name: "Regra", trigger: "NEW_CONVERSATION", oncePerConversation: true, active: true, actions: [{ type: "ADD_LABEL", labelId: urgent }] };
    await expect(saveAutomation(ana.ctx, null, ok)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveAutomation(A.ctx, null, { ...ok, name: "ab" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveAutomation(A.ctx, null, { ...ok, actions: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveAutomation(A.ctx, null, { ...ok, trigger: "KEYWORD", triggerValue: " " })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveAutomation(A.ctx, null, { ...ok, trigger: "LABEL_ADDED", triggerValue: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveAutomation(A.ctx, null, { ...ok, trigger: "LABEL_ADDED", triggerValue: urgent, actions: [{ type: "SEND_REPLY", text: "x" }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveAutomation(A.ctx, null, { ...ok, actions: [{ type: "SEND_REPLY", text: "a" }, { type: "SEND_REPLY", text: "b" }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveAutomation(A.ctx, null, { ...ok, actions: [{ type: "ADD_LABEL", labelId: "6f1d1b64-1f55-4c6e-8c0a-000000000000" }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveAutomation(A.ctx, null, { ...ok, actions: [{ type: "ASSIGN", userId: B.owner.id }] })).rejects.toBeInstanceOf(ValidationError); // pessoa de outro escritório
    const a = await saveAutomation(A.ctx, null, ok);
    await expect(saveAutomation(A.ctx, null, { ...ok, name: "regra" })).rejects.toBeInstanceOf(ValidationError); // nome repetido
    expect(await listAutomations(B.ctx)).toHaveLength(0);
    const bLabel = (await saveLabel(B.ctx, null, { name: "De B", color: "#2563eb" })).id;
    await expect(saveAutomation(B.ctx, a.id, { ...ok, actions: [{ type: "ADD_LABEL", labelId: bLabel }] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteAutomation(B.ctx, a.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setAutomationActive(B.ctx, a.id, false)).rejects.toBeInstanceOf(NotFoundError);
    await deleteAutomation(A.ctx, a.id);
    expect(await listAutomations(A.ctx)).toHaveLength(0);
  });
});
