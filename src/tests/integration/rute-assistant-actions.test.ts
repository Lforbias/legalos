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
});
