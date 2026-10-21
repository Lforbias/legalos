import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderError, AnthropicProvider, getAiProvider, __setAiProviderForTests } from "@/lib/ai/provider";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  __setAiProviderForTests(undefined);
});

const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("provedor Anthropic", () => {
  it("envia chave no cabeçalho, devolve texto e consumo", async () => {
    const f = ok({ content: [{ type: "text", text: "Olá" }], usage: { input_tokens: 10, output_tokens: 3 }, model: "m1" });
    vi.stubGlobal("fetch", f);
    const r = await new AnthropicProvider("chave-secreta", "m1").complete({ system: "s", messages: [{ role: "user", content: "oi" }], maxTokens: 50 });
    expect(r).toEqual({ text: "Olá", inputTokens: 10, outputTokens: 3, model: "m1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("chave-secreta");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "m1", max_tokens: 50, system: "s" });
  });

  it("traduz erros do provedor para mensagens seguras (sem vazar chave nem corpo)", async () => {
    const p = new AnthropicProvider("chave-secreta", "m1");
    const run = () => p.complete({ system: "s", messages: [{ role: "user", content: "oi" }], maxTokens: 5 });
    vi.stubGlobal("fetch", ok({ error: "x chave-secreta" }, 401));
    await expect(run()).rejects.toThrow(/chave de IA/);
    vi.stubGlobal("fetch", ok({}, 429));
    await expect(run()).rejects.toThrow(/limite de uso/);
    vi.stubGlobal("fetch", ok({}, 500));
    await expect(run()).rejects.toBeInstanceOf(AiProviderError);
    vi.stubGlobal("fetch", ok({ content: [] }));
    await expect(run()).rejects.toThrow(/não devolveu texto/);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rede chave-secreta"); }));
    await expect(run()).rejects.toThrow(/Não foi possível falar/);
    await run().catch((e: Error) => expect(e.message).not.toContain("chave-secreta"));
  });

  it("sem ANTHROPIC_API_KEY o provedor não existe (recurso desligado)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(getAiProvider()).toBeNull();
    vi.stubEnv("ANTHROPIC_API_KEY", "abc");
    expect(getAiProvider()?.name).toBe("anthropic");
  });
});
