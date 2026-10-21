import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { endpoint: string; payload: string }[] = [];
let failWith: number | null = null;
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      if (failWith) throw Object.assign(new Error("push falhou"), { statusCode: failWith });
      sent.push({ endpoint: sub.endpoint, payload });
      return { statusCode: 201 };
    },
  },
}));

import { db } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { getPushView, runPushDue, saveOrgPush, savePrefs, sendTest, subscribe, unsubscribe } from "@/server/services/push.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const saved = { ...process.env };
const TZ = "America/Sao_Paulo";
const today = todayYmd(TZ);
const d = (n: number) => ymdToDate(addDays(today, n));
const noon = new Date(`${today}T15:00:00Z`); // 12h em São Paulo
const night = new Date(`${today}T04:00:00Z`); // 1h em São Paulo
const ep = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}-${"x".repeat(30)}`;
const sub = (n: string) => ({ endpoint: ep(n), keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } });

describe("2.0-F14 — avisos no celular (push)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let bia: Awaited<ReturnType<typeof addMember>>;
  let caseId: string;

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = "BPublicKeyDeTeste".padEnd(87, "x");
    process.env.VAPID_PRIVATE_KEY = "PrivateKeyDeTeste".padEnd(43, "x");
    A = await makeOrgWithOwner("push-a");
    ana = await addMember(A.org.id, "ASSISTANT", "push-ana");
    bia = await addMember(A.org.id, "ASSISTANT", "push-bia");
    caseId = (await db.case.create({ data: { organizationId: A.org.id, title: "Processo Segredo Alfa", createdById: A.owner.id } })).id;
  });
  beforeEach(() => { sent.length = 0; failWith = null; });
  afterAll(async () => {
    process.env = { ...saved };
  });

  it("nasce desligado; só quem administra o escritório liga; exige chaves no servidor; fica na auditoria", async () => {
    expect((await getPushView(A.ctx)).orgEnabled).toBe(false);
    await expect(saveOrgPush(ana.ctx, { enabled: true })).rejects.toBeInstanceOf(ForbiddenError);
    const keep = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    await expect(saveOrgPush(A.ctx, { enabled: true })).rejects.toBeInstanceOf(ValidationError);
    expect((await getPushView(A.ctx)).configured).toBe(false);
    process.env.VAPID_PRIVATE_KEY = keep;
    await saveOrgPush(A.ctx, { enabled: true });
    expect((await getPushView(A.ctx)).orgEnabled).toBe(true);
    await saveOrgPush(A.ctx, { enabled: false });
    const acts = (await db.auditLog.findMany({ where: { organizationId: A.org.id, action: { startsWith: "push." } }, select: { action: true } })).map((a) => a.action);
    expect(acts).toContain("push.enable");
    expect(acts).toContain("push.disable");
  });

  it("aceita só endereços de serviços de push conhecidos e limita a 5 aparelhos por pessoa", async () => {
    await expect(subscribe(ana.ctx, { endpoint: "http://fcm.googleapis.com/x".padEnd(60, "y"), keys: sub("a").keys })).rejects.toBeInstanceOf(ValidationError);
    await expect(subscribe(ana.ctx, { endpoint: "https://127.0.0.1/push/".padEnd(60, "y"), keys: sub("a").keys })).rejects.toBeInstanceOf(ValidationError);
    await expect(subscribe(ana.ctx, { endpoint: "https://evil.example.com/fcm.googleapis.com/".padEnd(60, "y"), keys: sub("a").keys })).rejects.toBeInstanceOf(ValidationError);
    for (let i = 0; i < 5; i++) await subscribe(bia.ctx, sub(`bia${i}`));
    await expect(subscribe(bia.ctx, sub("bia-extra"))).rejects.toBeInstanceOf(ConflictError);
    await subscribe(bia.ctx, sub("bia0")); // o mesmo aparelho de novo não conta
    expect((await getPushView(bia.ctx)).devices).toHaveLength(5);
    await unsubscribe(bia.ctx, ep("bia0"));
    expect((await getPushView(bia.ctx)).devices).toHaveLength(4);
    // Outra pessoa não consegue remover o aparelho alheio.
    await unsubscribe(ana.ctx, ep("bia1"));
    expect((await getPushView(bia.ctx)).devices).toHaveLength(4);
  });

  it("teste: exige aparelho ativado, manda texto genérico e tem limite de frequência", async () => {
    await expect(sendTest(A.ctx, new Date(noon.getTime()))).rejects.toBeInstanceOf(ValidationError);
    await subscribe(A.ctx, sub("owner1"));
    // o limite de frequência já foi consumido pela tentativa anterior? não: só conta quando há envio — zere esperando o intervalo
    const r = await sendTest(A.ctx, new Date(noon.getTime() + 60_000));
    expect(r).toEqual({ sent: 1, failed: 0 });
    const p = JSON.parse(sent[0]!.payload);
    expect(p.title).toContain("teste");
    await expect(sendTest(A.ctx, new Date(noon.getTime() + 61_000))).rejects.toBeInstanceOf(ConflictError);
  });

  it("não avisa com o escritório desligado nem de madrugada; avisa com texto genérico quando liga", async () => {
    await db.task.create({ data: { organizationId: A.org.id, title: "Tarefa SEGREDO do cliente Fulano", dueDate: d(0), assigneeId: A.owner.id } });
    await db.deadline.create({ data: { organizationId: A.org.id, caseId, title: "Prazo SEGREDO contestação", dueDate: d(1), responsibleId: A.owner.id } });
    expect((await runPushDue(noon)).orgs).toBe(0);
    expect(sent).toHaveLength(0);

    await saveOrgPush(A.ctx, { enabled: true });
    const n = await runPushDue(night);
    expect(n.skippedNight).toBeGreaterThanOrEqual(1);
    expect(sent).toHaveLength(0);

    const r = await runPushDue(noon);
    expect(r.pushes).toBeGreaterThanOrEqual(1);
    const mine = sent.filter((s) => s.endpoint === ep("owner1"));
    expect(mine).toHaveLength(1);
    const text = mine[0]!.payload;
    expect(text).toContain("1 prazo e 1 tarefa");
    expect(text).not.toMatch(/SEGREDO|Fulano|Alfa|contestação/);
    expect(JSON.parse(text).url).toBe("/alertas");
  });

  it("não repete o mesmo item; avisa de novo só do que for novo", async () => {
    expect((await runPushDue(noon)).pushes).toBe(0);
    expect(sent).toHaveLength(0);
    await db.task.create({ data: { organizationId: A.org.id, title: "Outra tarefa", dueDate: d(0), assigneeId: A.owner.id } });
    await runPushDue(noon);
    const p = JSON.parse(sent.find((s) => s.endpoint === ep("owner1"))!.payload);
    expect(p.body).toContain("1 tarefa");
    expect(p.body).not.toContain("prazo");
    expect(p.url).toBe("/tarefas");
  });

  it("respeita as preferências de cada pessoa (antecedência e tipos) e ignora o muito atrasado", async () => {
    await subscribe(ana.ctx, sub("ana1"));
    await db.task.create({ data: { organizationId: A.org.id, title: "T amanhã", dueDate: d(1), assigneeId: ana.user.id } });
    await db.task.create({ data: { organizationId: A.org.id, title: "T atrasada 10 dias", dueDate: d(-10), assigneeId: ana.user.id } });
    await savePrefs(ana.ctx, { deadlines: true, tasks: true, leadDays: 0 });
    await runPushDue(noon);
    expect(sent.filter((s) => s.endpoint === ep("ana1"))).toHaveLength(0); // amanhã ainda não; atrasada demais não
    await savePrefs(ana.ctx, { deadlines: true, tasks: false, leadDays: 3 });
    await runPushDue(noon);
    expect(sent.filter((s) => s.endpoint === ep("ana1"))).toHaveLength(0); // tarefas desligadas
    await savePrefs(ana.ctx, { deadlines: true, tasks: true, leadDays: 1 });
    await runPushDue(noon);
    const got = sent.filter((s) => s.endpoint === ep("ana1"));
    expect(got).toHaveLength(1);
    expect(got[0]!.payload).toContain("1 tarefa");
    await expect(savePrefs(ana.ctx, { deadlines: true, tasks: true, leadDays: 9 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("não vaza entre pessoas nem entre escritórios; aparelho removido pelo serviço (410) sai da lista", async () => {
    const B = await makeOrgWithOwner("push-b");
    await db.pushSettings.create({ data: { organizationId: B.org.id, enabled: true } });
    await subscribe(B.ctx, sub("orgb1"));
    await db.task.create({ data: { organizationId: B.org.id, title: "Tarefa B", dueDate: d(0), assigneeId: B.owner.id } });
    await runPushDue(noon);
    expect(sent.map((s) => s.endpoint)).toEqual([ep("orgb1")]);
    // Pessoa sem itens não recebe nada.
    expect(sent.some((s) => s.endpoint === ep("bia2"))).toBe(false);

    await db.task.create({ data: { organizationId: B.org.id, title: "Tarefa B2", dueDate: d(0), assigneeId: B.owner.id } });
    sent.length = 0;
    failWith = 410;
    await runPushDue(noon);
    expect(await db.pushSubscription.count({ where: { endpoint: ep("orgb1") } })).toBe(0);
    // Itens não foram marcados como avisados (nada chegou); ao reativar, serão avisados.
    expect(await db.pushDelivery.count({ where: { userId: B.owner.id } })).toBe(1); // só o item do primeiro envio; o novo ficou pendente
  });
});
