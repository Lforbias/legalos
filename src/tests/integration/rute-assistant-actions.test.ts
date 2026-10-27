import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { AiProviderError } from "@/lib/ai/provider";
import { __setToolChatForTests } from "@/lib/ai/tool-chat";
import { createConversation, getConversation, sendMessage } from "@/server/services/rute-assistant.service";
import { setRuteFeature } from "@/server/services/rute-settings.service";
import { setOrgAiEnabled } from "@/server/services/ai.service";
import { makeOrgWithOwner } from "./helpers";

describe("Assistant direct actions", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  beforeAll(async () => {
    a = await makeOrgWithOwner("assistant-actions");
    await setOrgAiEnabled(a.ctx, true);
    await setRuteFeature(a.ctx, "assistant", true);
  });
  afterEach(() => __setToolChatForTests(undefined));
  it("executes once, persists action references and exposes permitted actions", async () => {
    __setToolChatForTests({ name: "test", model: "test", async run(i) {
      expect(i.tools.some(t => t.name === "criar_tarefa")).toBe(true);
      const args = { title: "Assistant direct task" };
      expect(await i.runTool("criar_tarefa", args)).toEqual(await i.runTool("criar_tarefa", args));
      return { text: "Task created.", inputTokens: 10, outputTokens: 5, model: "test", toolCalls: 2 };
    } });
    const c = await createConversation(a.ctx);
    const r = await sendMessage(a.ctx, c.id, "Crie uma tarefa para conferir documentos");
    expect(r.refs.filter(r => r.type === "action")).toHaveLength(1);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: "Assistant direct task" } })).toBe(1);
    const history = await getConversation(a.ctx, c.id);
    expect(history.messages[1]?.refs).toEqual(r.refs);
  });
  it("preserves saved result when provider fails after executing", async () => {
    __setToolChatForTests({ name: "test", model: "test", async run(i) {
      await i.runTool("criar_tarefa", { title: "Saved before provider failure" });
      throw new AiProviderError("Provider failed");
    } });
    const c = await createConversation(a.ctx);
    const r = await sendMessage(a.ctx, c.id, "Crie outra tarefa");
    expect(r.refs.some(r => r.type === "action")).toBe(true);
    expect(r.answer).toContain("LegalOS");
    expect((await getConversation(a.ctx, c.id)).messages).toHaveLength(2);
  });
  it("does not advertise actions without domain permission and rejects invented calls", async () => {
    const limited = { ...a.ctx, isOwner: false, permissions: new Set(["ai:use"] as const) };
    __setToolChatForTests({ name: "test", model: "test", async run(i) {
      expect(i.tools.some(t => t.name === "criar_tarefa")).toBe(false);
      await i.runTool("criar_tarefa", { title: "Forbidden task" });
      return { text: "Permission denied.", inputTokens: 10, outputTokens: 5, model: "test", toolCalls: 1 };
    } });
    const c = await createConversation(limited);
    const r = await sendMessage(limited, c.id, "Crie uma tarefa");
    expect(r.refs.some(r => r.type === "action")).toBe(false);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: "Forbidden task" } })).toBe(0);
  });
  it("replays the same request without repeating a creation and rejects changed payload", async () => {
    let calls = 0;
    __setToolChatForTests({ name: "test", model: "test", async run(i) {
      calls++;
      await i.runTool("criar_tarefa", { title: "Idempotent assistant task" });
      return { text: "Tarefa salva.", inputTokens: 10, outputTokens: 5, model: "test", toolCalls: 1 };
    } });
    const c = await createConversation(a.ctx);
    const options = { requestId: randomUUID(), mode: "act" as const };
    const first = await sendMessage(a.ctx, c.id, "Crie minha tarefa", options);
    expect(await sendMessage(a.ctx, c.id, "Crie minha tarefa", options)).toEqual(first);
    expect(calls).toBe(1);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: "Idempotent assistant task" } })).toBe(1);
    expect((await getConversation(a.ctx, c.id)).messages).toHaveLength(2);
    await expect(sendMessage(a.ctx, c.id, "Crie outra tarefa", options)).rejects.toThrow("outro texto ou modo");
  });
  it("enforces consultation mode even if the provider invents a write call", async () => {
    __setToolChatForTests({ name: "test", model: "test", async run(i) {
      expect(i.tools.some(t => t.name === "criar_tarefa" || t.name.startsWith("propor_"))).toBe(false);
      expect(i.system).toContain("MODO CONSULTA");
      expect(await i.runTool("criar_tarefa", { title: "Must never write in consultation" })).toContain("permissão");
      return { text: "Selecione o modo de ações.", inputTokens: 10, outputTokens: 5, model: "test", toolCalls: 1 };
    } });
    const c = await createConversation(a.ctx);
    await sendMessage(a.ctx, c.id, "Como criar uma tarefa?", { mode: "consult" });
    expect(await db.task.count({ where: { organizationId: a.org.id, title: "Must never write in consultation" } })).toBe(0);
  });
  it("carries lookup IDs into the next turn so the model can resolve follow-up requests", async () => {
    const client = await db.client.create({ data: { organizationId: a.org.id, name: "Cliente Contexto RUTE", type: "PERSON" } });
    let calls = 0;
    __setToolChatForTests({ name: "test", model: "test", async run(i) {
      if (++calls === 1) await i.runTool("buscar_clientes", { q: "Cliente Contexto RUTE" });
      else {
        expect(i.history.some(turn => turn.text.includes(client.id) && turn.text.includes("records"))).toBe(true);
        expect(i.system).toContain("Data e hora no escritório:");
      }
      return { text: "Cliente localizado.", inputTokens: 10, outputTokens: 5, model: "test", toolCalls: calls === 1 ? 1 : 0 };
    } });
    const c = await createConversation(a.ctx);
    const first = await sendMessage(a.ctx, c.id, "Encontre Cliente Contexto RUTE", { mode: "consult" });
    expect(first.refs[0]?.records).toContainEqual({ id: client.id, label: client.name });
    await sendMessage(a.ctx, c.id, "Quais são as pendências dele?", { mode: "consult" });
  });
  it("does not repeat an interrupted request even when no answer was saved", async () => {
    let calls = 0;
    __setToolChatForTests({ name: "test", model: "test", async run() { calls++; throw new AiProviderError("Provider interrupted"); } });
    const c = await createConversation(a.ctx);
    const options = { requestId: randomUUID(), mode: "act" as const };
    await expect(sendMessage(a.ctx, c.id, "Crie uma tarefa pendente", options)).rejects.toThrow("Provider interrupted");
    await expect(sendMessage(a.ctx, c.id, "Crie uma tarefa pendente", options)).rejects.toThrow("interrompida");
    expect(calls).toBe(1);
  });

  it("blocks concurrent requests in the same conversation", async () => {
    let release!: () => void;
    let ready!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { ready = resolve; });
    __setToolChatForTests({ name: "test", model: "test", async run() {
      ready(); await gate;
      return { text: "Consulta concluída.", inputTokens: 10, outputTokens: 5, model: "test", toolCalls: 0 };
    } });
    const c = await createConversation(a.ctx);
    const first = sendMessage(a.ctx, c.id, "Confira minhas pendências", { requestId: randomUUID(), mode: "consult" });
    await entered;
    try {
      await expect(sendMessage(a.ctx, c.id, "Confira outra informação", { requestId: randomUUID(), mode: "consult" })).rejects.toThrow("andamento");
    } finally { release(); await first; }
  });

});
