import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { getBot, saveBot } from "@/server/services/chat-bot.service";
import { saveField, saveLabel } from "@/server/services/chat-meta.service";
import { saveQueue } from "@/server/services/chat-queue.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { connectAccount, removeAccount } from "@/server/services/whatsapp-account.service";
import { sendMessage } from "@/server/services/whatsapp.service";
import { handleWebhook } from "@/server/services/whatsapp-webhook.service";
import { APP_SECRET, inbound, startFakeWhatsapp, WA_TOKEN } from "./fake-whatsapp";
import { addMember, META, makeOrgWithOwner } from "./helpers";

const fake = startFakeWhatsapp();
const saved = { ...process.env };
const PNID = "400500600";
const post = (b: { body: string; signature: string }) => handleWebhook(b.body, b.signature);
let seq = 0;
const say = (from: string, text: string) => post(inbound(PNID, { id: `wamid.BT${++seq}`, from, text, name: "Cliente Bot" }));
const sentTexts = () => fake.requests.filter(r=>r.method==="POST"&&/\/messages$/.test(r.path)).map(r=>{
 const b=r.body as {type:string;text?:{body:string};interactive?:{body:{text:string};action:{buttons?:{reply:{id:string;title:string}}[];sections?:{rows:{id:string;title:string}[]}[]}}};
 if(b.type==="text")return b.text!.body;
 if(b.type!=="interactive")return "";
 const i=b.interactive!;const rows=i.action.buttons?.map(b=>b.reply)??i.action.sections?.flatMap(s=>s.rows)??[];
 return i.body.text+"\n\n"+rows.filter(r=>r.id!=="legalos:triage:0").map(r=>`${r.id.replace("legalos:triage:","")} - ${r.title}`).join("\n")+"\n\n0 - Falar com um atendente";
});
const conv = (waId: string) => db.whatsappConversation.findFirstOrThrow({ where: { waId }, include: { labels: { select: { label: { select: { name: true } } } }, fieldValues: true } });
const notes = (id: string) => db.whatsappMessage.findMany({ where: { conversationId: id, direction: "NOTE" }, orderBy: { createdAt: "asc" }, select: { body: true } });

describe("LegalOS Chat — menu de triagem", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let labelId: string;
  let queueId: string;
  let fieldNome: string;
  let fieldData: string;

  const config = (over: object = {}) => ({
    enabled: true, greeting: "Olá! Escolha:", invalidText: "Não entendi.", handoffText: "Um atendente vai falar com você.",
    options: [
      { label: "Já sou cliente", reply: "Certo, vamos ver seu processo.", actions: [{ type: "ADD_LABEL", labelId }], questions: [] },
      { label: "Novo caso", reply: "Ótimo! Perguntas rápidas.", actions: [{ type: "TRANSFER_QUEUE", queueId }, { type: "CREATE_TASK", title: "Retornar {{contato}} (novo caso)", dueDays: 1, assigneeId: null }], questions: [{ text: "Qual o seu nome completo?", fieldId: fieldNome }, { text: "Qual a data do ocorrido? (AAAA-MM-DD)", fieldId: fieldData }, { text: "Conte em poucas palavras.", fieldId: null }] },
    ],
    ...over,
  });
  const reset = async () => {
    await db.whatsappConversation.deleteMany({ where: { organizationId: A.org.id } });
    await db.task.deleteMany({ where: { organizationId: A.org.id } });
  };

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const url = await fake.start();
    Object.assign(process.env, { WHATSAPP_API_URL: url, WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: "verifica-0123456789" });
    A = await makeOrgWithOwner("bot-a");
    B = await makeOrgWithOwner("bot-b");
    ana = await addMember(A.org.id, "ASSISTANT", "bot-ana");
    const s = await startEnrollment(A.owner.id, A.owner.email);
    await confirmEnrollment(A.owner.id, totpCode(s.secret, totpStep()), META);
    await connectAccount(A.ctx, { label: "Atendimento", phoneNumberId: PNID, token: WA_TOKEN });
    labelId = (await saveLabel(A.ctx, null, { name: "Cliente antigo", color: "#16a34a" })).id;
    queueId = (await saveQueue(A.ctx, null, { name: "Novos casos", strategy: "MANUAL" })).id;
    fieldNome = (await saveField(A.ctx, null, { name: "Nome completo", kind: "TEXT" })).id;
    fieldData = (await saveField(A.ctx, null, { name: "Data do ocorrido", kind: "DATE" })).id;
  });
  afterAll(async () => {
    await removeAccount(A.ctx).catch(() => undefined);
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    await fake.stop();
    process.env = { ...saved };
  });

  it("validações, permissão e isolamento da configuração", async () => {
    await expect(saveBot(ana.ctx, config())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveBot(A.ctx, config({ options: [] }))).rejects.toBeInstanceOf(ValidationError);
    await expect(saveBot(A.ctx, config({ greeting: "" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(saveBot(A.ctx, config({ options: [{ label: "Igual", reply: "", actions: [], questions: [] }, { label: "igual", reply: "", actions: [], questions: [] }] }))).rejects.toBeInstanceOf(ValidationError);
    await expect(saveBot(A.ctx, config({ options: [{ label: "Opção", reply: "", actions: [{ type: "SEND_REPLY", text: "oi" }], questions: [] }] }))).rejects.toBeInstanceOf(ValidationError);
    await expect(saveBot(A.ctx, config({ options: [{ label: "Opção", reply: "", actions: [], questions: [{ text: "Pergunta?", fieldId: "6f1d1b64-1f55-4c6e-8c0a-000000000000" }] }] }))).rejects.toBeInstanceOf(ValidationError);
    expect(await getBot(A.ctx)).toBeNull();
    await saveBot(A.ctx, config());
    expect((await getBot(A.ctx))!.options).toHaveLength(2);
    expect(await getBot(B.ctx)).toBeNull(); // outro escritório não vê
    await expect(saveBot(B.ctx, config())).rejects.toBeInstanceOf(ValidationError); // etiqueta/fila de A não existem em B
  });

  it("conversa nova recebe o menu; opção simples aplica a etiqueta, responde e encaminha", async () => {
    await reset();
    await saveBot(A.ctx, config());
    await say("5571966660001", "Oi");
    expect(fake.requests.filter(r=>r.path.endsWith("/messages")).at(-1)?.body).toMatchObject({type:"interactive",interactive:{type:"button"}});
    expect(sentTexts().at(-1)).toBe("Olá! Escolha:\n\n1 - Já sou cliente\n2 - Novo caso\n\n0 - Falar com um atendente");
    await say("5571966660001", "1");
    const t = sentTexts();
    expect(t.at(-2)).toBe("Certo, vamos ver seu processo.");
    expect(t.at(-1)).toBe("Um atendente vai falar com você.");
    const c = await conv("5571966660001");
    expect(c.labels.map((l) => l.label.name)).toEqual(["Cliente antigo"]);
    expect(c.status).toBe("OPEN");
    expect((await notes(c.id)).some((n) => n.body?.startsWith("Triagem concluída: opção “Já sou cliente”"))).toBe(true);
    const n = sentTexts().length;
    await say("5571966660001", "obrigado"); // triagem acabou: robô quieto
    expect(sentTexts()).toHaveLength(n);
  });

  it("pré-atendimento: perguntas, campo validado (data), respostas na nota e nos campos, fila e tarefa", async () => {
    await reset();
    await saveBot(A.ctx, config());
    await say("5571966660002", "Bom dia");
    await say("5571966660002", "Novo caso"); // pelo texto da opção
    expect(sentTexts().at(-1)).toBe("Qual o seu nome completo?");
    await say("5571966660002", "Maria de Souza");
    expect(sentTexts().at(-1)).toBe("Qual a data do ocorrido? (AAAA-MM-DD)");
    await say("5571966660002", "semana passada"); // data inválida: pergunta de novo
    expect(sentTexts().at(-1)).toContain("Qual a data do ocorrido?");
    expect(sentTexts().at(-1)).toContain("informe uma data válida");
    await say("5571966660002", "2026-09-30");
    expect(sentTexts().at(-1)).toBe("Conte em poucas palavras.");
    await say("5571966660002", "Fui demitida sem receber as verbas.");
    expect(sentTexts().at(-1)).toBe("Um atendente vai falar com você.");
    const c = await conv("5571966660002");
    expect(c.queueId).toBe(queueId);
    const vals = Object.fromEntries(c.fieldValues.map((f) => [f.fieldId, f.value]));
    expect(vals).toEqual({ [fieldNome]: "Maria de Souza", [fieldData]: "2026-09-30" });
    const done = (await notes(c.id)).find((n) => n.body?.startsWith("Triagem concluída"))!;
    expect(done.body).toContain("Qual o seu nome completo? Maria de Souza");
    expect(done.body).toContain("Conte em poucas palavras. Fui demitida sem receber as verbas.");
    expect((await db.task.findFirstOrThrow({ where: { organizationId: A.org.id } })).title).toBe("Retornar Cliente Bot (novo caso)");
  });

  it("'0' chama atendente na hora; opção inválida repete o menu e na 3ª passa para uma pessoa", async () => {
    await reset();
    await saveBot(A.ctx, config());
    await say("5571966660003", "oi");
    await say("5571966660003", "0");
    expect(sentTexts().at(-1)).toBe("Um atendente vai falar com você.");
    expect((await notes((await conv("5571966660003")).id)).some((n) => n.body?.includes("o cliente pediu um atendente"))).toBe(true);

    await say("5571966660004", "oi");
    await say("5571966660004", "quero falar de outra coisa");
    expect(sentTexts().at(-1)).toContain("Não entendi.");
    expect(sentTexts().at(-1)).toContain("1 - Já sou cliente");
    await say("5571966660004", "blá");
    await say("5571966660004", "9"); // opção inexistente: terceira tentativa
    expect(sentTexts().at(-1)).toBe("Um atendente vai falar com você.");
  });

  it("quando uma pessoa responde, o robô se cala; conversa reaberta recebe o menu de novo; desligado não responde", async () => {
    await reset();
    await saveBot(A.ctx, config());
    await say("5571966660005", "oi");
    const c = await conv("5571966660005");
    await sendMessage(A.ctx, c.id, "Oi, aqui é a Dra.!"); // pessoa assumiu
    const n = sentTexts().length;
    await say("5571966660005", "1");
    expect(sentTexts()).toHaveLength(n); // robô calado
    expect((await db.whatsappBotSession.findUniqueOrThrow({ where: { conversationId: c.id } })).state).toBe("DONE");

    await db.whatsappConversation.update({ where: { id: c.id }, data: { status: "CLOSED" } });
    await say("5571966660005", "voltei");
    expect(sentTexts().at(-1)).toContain("Olá! Escolha:"); // novo ciclo

    await saveBot(A.ctx, config({ enabled: false }));
    const m = sentTexts().length;
    await say("5571966660006", "oi");
    expect(sentTexts()).toHaveLength(m);
  });

  it("sessão parada por mais de 24 h é encerrada (não responde a mensagem solta)", async () => {
    await reset();
    await saveBot(A.ctx, config());
    await say("5571966660007", "oi");
    const c = await conv("5571966660007");
    await db.whatsappBotSession.update({ where: { conversationId: c.id }, data: { updatedAt: new Date(Date.now() - 25 * 3600_000) } });
    const n = sentTexts().length;
    await say("5571966660007", "1");
    expect(sentTexts()).toHaveLength(n);
  });
});
