import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { sealBytes } from "@/lib/security/pfx";
import { autoAssign, deleteQueue, distributePending, distributeWaiting, listAgents, listQueues, myAvailability, saveQueue, setMyAvailability, transferToQueue } from "@/server/services/chat-queue.service";
import { ingestMessage } from "@/server/services/whatsapp-ingest.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const saved = { ...process.env };

describe("LegalOS Chat — filas e distribuição", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let a1: Awaited<ReturnType<typeof addMember>>;
  let a2: Awaited<ReturnType<typeof addMember>>;
  let outsider: Awaited<ReturnType<typeof addMember>>;
  let accountId: string;
  let teamId: string;
  let seq = 0;

  const conv = async (extra: object = {}) =>
    (await db.whatsappConversation.create({ data: { organizationId: A.org.id, accountId, waId: `55719000${String(++seq).padStart(5, "0")}`, lastInboundAt: new Date(Date.now() - (100 - seq) * 1000), ...extra } })).id;
  const get = (id: string) => db.whatsappConversation.findUniqueOrThrow({ where: { id } });
  const reset = async () => {
    await db.whatsappConversation.deleteMany({ where: { organizationId: A.org.id } });
    await db.whatsappAgent.deleteMany({ where: { organizationId: A.org.id } });
    await db.whatsappQueue.deleteMany({ where: { organizationId: A.org.id } });
  };

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    A = await makeOrgWithOwner("fila-a");
    B = await makeOrgWithOwner("fila-b");
    a1 = await addMember(A.org.id, "ASSISTANT", "fila-ana");
    a2 = await addMember(A.org.id, "ASSISTANT", "fila-bia");
    outsider = await addMember(A.org.id, "ASSISTANT", "fila-fora");
    teamId = (await db.workTeam.create({ data: { organizationId: A.org.id, name: "Atendimento" } })).id;
    await db.workTeamMember.createMany({ data: [a1, a2].map((m) => ({ teamId, organizationId: A.org.id, userId: m.user.id })) });
    accountId = (await db.whatsappAccount.create({ data: { organizationId: A.org.id, label: "t", phoneNumberId: "9100", tokenEnc: sealBytes(Buffer.from("x".repeat(30)), Buffer.alloc(32, 7)), createdById: A.owner.id } })).id;
  });
  afterAll(async () => {
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
    process.env = { ...saved };
  });

  it("rodízio: reparte pela ordem de quem recebeu há mais tempo e só dentro da equipe da fila", async () => {
    await reset();
    const q = await saveQueue(A.ctx, null, { name: "Geral", teamId, strategy: "ROUND_ROBIN", isDefault: true });
    const got: string[] = [];
    for (let i = 0; i < 4; i++) {
      const c = await conv();
      const ag = await autoAssign(A.org.id, c);
      got.push(ag!.id);
      expect((await get(c)).queueId).toBe(q.id);
    }
    expect(new Set(got)).toEqual(new Set([a1.user.id, a2.user.id]));
    expect(got[0]).not.toBe(got[1]);
    expect(got[0]).toBe(got[2]);
    expect(got).not.toContain(outsider.user.id);
    expect(await db.whatsappMessage.count({ where: { organizationId: A.org.id, direction: "NOTE", body: { contains: "Distribuída automaticamente" } } })).toBe(4);
    expect(await db.notification.count({ where: { organizationId: A.org.id, kind: "chat.assigned" } })).toBeGreaterThanOrEqual(4);
  });

  it("menor carga: quem tem menos conversas abertas recebe", async () => {
    await reset();
    await saveQueue(A.ctx, null, { name: "Carga", teamId, strategy: "LEAST_LOAD", isDefault: true });
    for (let i = 0; i < 3; i++) await conv({ assignedToId: a1.user.id, assignedAt: new Date() });
    const c = await conv();
    expect((await autoAssign(A.org.id, c))!.id).toBe(a2.user.id);
    await db.whatsappConversation.updateMany({ where: { organizationId: A.org.id, assignedToId: a1.user.id }, data: { status: "CLOSED" } });
    const d = await conv();
    expect((await autoAssign(A.org.id, d))!.id).toBe(a1.user.id); // a1 ficou sem abertas
  });

  it("manual: fica esperando; atendente em pausa é pulado; ao voltar assume a espera", async () => {
    await reset();
    const q = await saveQueue(A.ctx, null, { name: "Manual", strategy: "MANUAL", isDefault: true });
    const c = await conv();
    expect(await autoAssign(A.org.id, c)).toBeNull();
    expect((await get(c)).assignedToId).toBeNull();
    expect((await get(c)).queueId).toBe(q.id);
    await saveQueue(A.ctx, q.id, { name: "Manual", teamId, strategy: "ROUND_ROBIN", isDefault: true });
    await setMyAvailability(a1.ctx, false);
    await setMyAvailability(a2.ctx, false);
    expect(await myAvailability(a1.ctx)).toBe(false);
    expect(await autoAssign(A.org.id, c)).toBeNull(); // ninguém disponível → espera
    expect((await listQueues(A.ctx))[0]!.waiting).toBe(1);
    await setMyAvailability(a2.ctx, true); // volta e assume a espera
    expect((await get(c)).assignedToId).toBe(a2.user.id);
    expect((await listQueues(A.ctx))[0]!.waiting).toBe(0);
    const agents = await listAgents(A.ctx);
    expect(agents.find((x) => x.id === a1.user.id)!.available).toBe(false);
    expect(agents.find((x) => x.id === a2.user.id)!.open).toBe(1);
  });

  it("mantém o atendente atual se ele está disponível; reatribui se entrou em pausa; não sobrescreve atribuição manual", async () => {
    await reset();
    await saveQueue(A.ctx, null, { name: "Geral", teamId, strategy: "ROUND_ROBIN", isDefault: true });
    const c = await conv({ assignedToId: a1.user.id });
    expect(await autoAssign(A.org.id, c)).toBeNull();
    expect((await get(c)).assignedToId).toBe(a1.user.id);
    await setMyAvailability(a1.ctx, false);
    expect((await autoAssign(A.org.id, c))!.id).toBe(a2.user.id);
    await setMyAvailability(a1.ctx, true);
  });

  it("transferir para outra fila redistribui conforme a regra daquela fila", async () => {
    await reset();
    await saveQueue(A.ctx, null, { name: "Geral", strategy: "MANUAL", isDefault: true });
    const fin = await saveQueue(A.ctx, null, { name: "Financeiro", teamId, strategy: "ROUND_ROBIN" });
    const c = await conv({ assignedToId: outsider.user.id });
    const r = await transferToQueue(a1.ctx, c, fin.id);
    expect([a1.user.name, a2.user.name]).toContain(r.agent);
    const row = await get(c);
    expect(row.queueId).toBe(fin.id);
    expect([a1.user.id, a2.user.id]).toContain(row.assignedToId);
    const off = await saveQueue(A.ctx, fin.id, { name: "Financeiro", teamId, strategy: "ROUND_ROBIN", active: false });
    await expect(transferToQueue(a1.ctx, c, off.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await transferToQueue(a1.ctx, c, null)).agent).toBeNull();
    expect((await get(c)).queueId).toBeNull();
  });

  it("validações, permissão, fila padrão única e exclusão", async () => {
    await reset();
    await expect(saveQueue(A.ctx, null, { name: "x", strategy: "ROUND_ROBIN" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveQueue(A.ctx, null, { name: "Fila", strategy: "ROUND_ROBIN", teamId: B.org.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveQueue(a1.ctx, null, { name: "Fila", strategy: "ROUND_ROBIN" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(distributePending(a1.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    const q1 = await saveQueue(A.ctx, null, { name: "Um", strategy: "ROUND_ROBIN", isDefault: true });
    const q2 = await saveQueue(A.ctx, null, { name: "Dois", strategy: "ROUND_ROBIN", isDefault: true });
    expect((await db.whatsappQueue.findUniqueOrThrow({ where: { id: q1.id } })).isDefault).toBe(false);
    expect((await db.whatsappQueue.findUniqueOrThrow({ where: { id: q2.id } })).isDefault).toBe(true);
    await expect(saveQueue(A.ctx, null, { name: "Um", strategy: "ROUND_ROBIN" })).rejects.toBeInstanceOf(ValidationError); // nome repetido
    const c = await conv({ queueId: q1.id });
    await deleteQueue(A.ctx, q1.id);
    expect((await get(c)).queueId).toBeNull(); // conversa não some
    await expect(deleteQueue(A.ctx, q1.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("isola escritórios", async () => {
    await reset();
    const q = await saveQueue(A.ctx, null, { name: "Geral", strategy: "ROUND_ROBIN", isDefault: true });
    const c = await conv();
    await expect(transferToQueue(B.ctx, c, q.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteQueue(B.ctx, q.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listQueues(B.ctx)).toHaveLength(0);
    expect(await autoAssign(B.org.id, c)).toBeNull();
  });

  it("distribuir pendentes: esvazia a espera da mais antiga para a mais nova", async () => {
    await reset();
    await saveQueue(A.ctx, null, { name: "Geral", teamId, strategy: "ROUND_ROBIN", isDefault: true });
    await setMyAvailability(a1.ctx, false);
    await setMyAvailability(a2.ctx, false);
    const ids = [await conv(), await conv(), await conv()];
    expect(await distributeWaiting(A.org.id)).toBe(0);
    await db.whatsappAgent.updateMany({ where: { organizationId: A.org.id }, data: { available: true } });
    expect((await distributePending(A.ctx)).assigned).toBe(3);
    for (const id of ids) expect((await get(id)).assignedToId).not.toBeNull();
    await setMyAvailability(a1.ctx, true);
  });

  it("recepção distribui sozinha (mensagem nova e conversa reaberta)", async () => {
    await reset();
    await saveQueue(A.ctx, null, { name: "Geral", teamId, strategy: "ROUND_ROBIN", isDefault: true });
    const acc = await db.whatsappAccount.findUniqueOrThrow({ where: { id: accountId } });
    const mk = (id: string, body: string) => ingestMessage({ ...acc, awayMessage: null }, { waMessageId: id, waId: "5571955554444", contactName: "Cliente Novo", type: "text", text: body, timestamp: new Date(), fromMe: false, media: null });
    await mk("w-in-1", "Olá, preciso de ajuda");
    const c = await db.whatsappConversation.findFirstOrThrow({ where: { organizationId: A.org.id, waId: "5571955554444" } });
    expect(c.assignedToId).not.toBeNull();
    expect(c.queueId).not.toBeNull();
    const first = c.assignedToId;
    await db.whatsappConversation.update({ where: { id: c.id }, data: { status: "CLOSED" } });
    await mk("w-in-2", "Voltei");
    const again = await get(c.id);
    expect(again.status).toBe("OPEN");
    expect(again.assignedToId).toBe(first); // mesmo atendente, ainda disponível
  });
});
