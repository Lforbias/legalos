import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { approveProposal, createProposal, getProposal, rejectProposal, updateProposal } from "@/server/services/rute-proposal.service";
import { setRuteFeature } from "@/server/services/rute-settings.service";
import { callTool, toolCatalog } from "@/server/services/rute-tools.service";
import { makeOrgWithOwner } from "./helpers";

const origin = { via: "API" as const, connection: null };
describe("Operações da RUTE compartilhadas com REST e MCP", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  beforeAll(async () => {
    a = await makeOrgWithOwner("rute-operacoes");
    await setRuteFeature(a.ctx, "mcp", true, { consent: true });
    await setRuteFeature(a.ctx, "proposals", true);
  });
  it("cadastra cliente somente na aprovação; atualização parcial preserva contatos", async () => {
    const p = await createProposal(a.ctx, origin, { kind: "CLIENT_CREATE", payload: { name: "Cliente da proposta" } });
    expect(await db.client.count({ where: { organizationId: a.org.id } })).toBe(0);
    const result = await approveProposal(a.ctx, p.id);
    const c = await db.client.findUniqueOrThrow({ where: { id: result.id } });
    expect(c.name).toBe("Cliente da proposta");
    await db.client.update({ where: { id: c.id }, data: { email: "preservado@example.test", phone: "11999999999" } });
    const update = await createProposal(a.ctx, origin, { kind: "CLIENT_UPDATE", payload: { clientId: c.id, name: "Nome corrigido" } });
    await approveProposal(a.ctx, update.id);
    const fresh = await db.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(fresh.name).toBe("Nome corrigido"); expect(fresh.email).toBe("preservado@example.test"); expect(fresh.phone).toBe("11999999999");
  });
  it("edita e comenta tarefa; concluir exige confirmação reforçada e não executa duas vezes", async () => {
    const t = await db.task.create({ data: { organizationId: a.org.id, title: "Tarefa original", description: "Descrição preservada" } });
    const p = await createProposal(a.ctx, origin, { kind: "TASK_UPDATE", payload: { taskId: t.id, title: "Tarefa revisada" } });
    await expect(updateProposal(a.ctx, p.id, { taskId: crypto.randomUUID() })).rejects.toBeInstanceOf(ValidationError);
    await approveProposal(a.ctx, p.id);
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).description).toBe("Descrição preservada");
    const comment = await createProposal(a.ctx, origin, { kind: "TASK_COMMENT", payload: { taskId: t.id, body: "Conferência realizada" } });
    await approveProposal(a.ctx, comment.id);
    expect(await db.taskComment.count({ where: { taskId: t.id } })).toBe(1);
    const done = await createProposal(a.ctx, origin, { kind: "TASK_STATUS", payload: { taskId: t.id, status: "DONE" } });
    await expect(approveProposal(a.ctx, done.id)).rejects.toBeInstanceOf(ValidationError);
    await approveProposal(a.ctx, done.id, { confirmHighRisk: true });
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("DONE");
    await expect(approveProposal(a.ctx, done.id, { confirmHighRisk: true })).rejects.toBeInstanceOf(ConflictError);
    const cancel = await createProposal(a.ctx, origin, { kind: "TASK_STATUS", payload: { taskId: t.id, status: "CANCELED" } });
    await approveProposal(a.ctx, cancel.id, { confirmHighRisk: true });
    const list = await callTool(a.ctx, new Set(["read"]), { via: "API", provider: "teste", connection: null }, "listar_tarefas", { status: "CANCELED" });
    expect(list.ok).toBe(true); expect(JSON.stringify(list.data)).toContain(t.id);
  });
  it("cria compromisso no fuso do escritório, altera campos e cancela após confirmação", async () => {
    const p = await createProposal(a.ctx, origin, { kind: "EVENT_CREATE", payload: { title: "Reunião de revisão", date: "2026-12-01", startTime: "10:00" } });
    const result = await approveProposal(a.ctx, p.id);
    const event = await db.agendaEvent.findUniqueOrThrow({ where: { id: result.id } });
    expect(event.startsAt.toISOString()).toBe("2026-12-01T13:00:00.000Z");
    const update = await createProposal(a.ctx, origin, { kind: "EVENT_UPDATE", payload: { eventId: event.id, location: "Sala 2" } });
    await approveProposal(a.ctx, update.id);
    expect((await db.agendaEvent.findUniqueOrThrow({ where: { id: event.id } })).title).toBe(event.title);
    const cancel = await createProposal(a.ctx, origin, { kind: "EVENT_CANCEL", payload: { eventId: event.id } });
    await approveProposal(a.ctx, cancel.id, { confirmHighRisk: true });
    expect((await db.agendaEvent.findUniqueOrThrow({ where: { id: event.id } })).deletedAt).not.toBeNull();
  });
  it("bloqueia destino externo e versões alteradas depois da proposta", async () => {
    const b = await makeOrgWithOwner("rute-operacoes-b");
    const task = await db.task.create({ data: { organizationId: b.org.id, title: "Outra organização" } });
    await expect(createProposal(a.ctx, origin, { kind: "TASK_UPDATE", payload: { taskId: task.id, title: "Alterar" } })).rejects.toBeInstanceOf(NotFoundError);
    const c = await db.client.findFirstOrThrow({ where: { organizationId: a.org.id } });
    const p = await createProposal(a.ctx, origin, { kind: "CLIENT_UPDATE", payload: { clientId: c.id, name: "Proposta antiga" } });
    await db.client.update({ where: { id: c.id }, data: { name: "Alterado por outra pessoa", updatedAt: new Date(c.updatedAt.getTime() + 2000) } });
    await expect(approveProposal(a.ctx, p.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await getProposal(a.ctx, p.id)).status).toBe("PENDING");
    await rejectProposal(a.ctx, p.id);
  });
  it("catálogo tem 35 ferramentas, esquemas de criação coerentes e descoberta respeita o escopo", async () => {
    const tools = toolCatalog(a.ctx, new Set(["read", "propose"]));
    expect(tools).toHaveLength(35);
    const schema = tools.find(t => t.name === "propor_compromisso")!.inputSchema;
    expect(schema.required).toContain("date");
    expect(Object.keys(schema.properties)).not.toContain("expectedUpdatedAt");
    const r = await callTool(a.ctx, new Set(["read"]), { via: "API", provider: "teste", connection: null }, "capacidades", {});
    expect(r.ok).toBe(true); expect(r.truncated).toBe(false);
    expect(JSON.stringify(r.data)).not.toContain("propor_cliente");
    const p = await callTool(a.ctx, new Set(["propose"]), { via: "API", provider: "teste", connection: null }, "propor_cliente", { name: "Cliente pelo calling" });
    expect(p.ok).toBe(true);
  });
});
