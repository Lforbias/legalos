import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { AiProviderError } from "@/lib/ai/provider";
import { AnthropicToolChat, GeminiToolChat, OpenAiToolChat, type ToolChatInput } from "@/lib/ai/tool-chat";
import { mcpUrl } from "@/lib/mcp/http";
import { encryptSecret, mfaKey } from "@/lib/security/totp";
import { GET as metaAuth } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as metaRes } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { POST as mcpPost, GET as mcpGet } from "@/app/api/mcp/route";
import { POST as registerPost } from "@/app/api/oauth/register/route";
import { POST as tokenPost } from "@/app/api/oauth/token/route";
import { createApiKey } from "@/server/services/apikey.service";
import { createAuthCode } from "@/server/services/mcp-auth.service";
import { setOrgAiEnabled } from "@/server/services/ai.service";
import { setRuteFeature } from "@/server/services/rute-settings.service";
import { makeOrgWithOwner } from "./helpers";

type Captured = { url: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> };

function fake(handler: (n: number, c: Captured) => { status?: number; json: unknown }) {
  const calls: Captured[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const c = { url: req.url ?? "", headers: req.headers, body: JSON.parse(raw || "{}") as Record<string, unknown> };
      calls.push(c);
      const r = handler(calls.length, c);
      res.writeHead(r.status ?? 200, { "content-type": "application/json" });
      res.end(JSON.stringify(r.json));
    });
  });
  return new Promise<{ base: string; calls: Captured[]; close: () => void }>((resolve) => server.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls, close: () => server.close() })));
}

const input = (runTool: ToolChatInput["runTool"], maxSteps = 4): ToolChatInput => ({
  system: "SISTEMA", history: [{ role: "user", text: "pergunta" }], tools: [{ name: "hoje", description: "d", input: { type: "object", properties: {} } }, { name: "ver_cliente", description: "c", input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }], runTool, maxTokens: 500, maxSteps,
});

describe("6.0 — adaptadores de IA com servidores falsos", () => {
  it("Anthropic: pede ferramenta, recebe resultado e responde", async () => {
    const s = await fake((n) => (n === 1 ? { json: { content: [{ type: "tool_use", id: "tu1", name: "hoje", input: {} }], usage: { input_tokens: 10, output_tokens: 2 } } } : { json: { content: [{ type: "text", text: "Pronto" }], usage: { input_tokens: 20, output_tokens: 3 }, model: "claude-x" } }));
    const asked: unknown[] = [];
    const r = await new AnthropicToolChat("KEY", "claude-x", s.base).run(input(async (name, args) => { asked.push([name, args]); return "DADOS"; }));
    s.close();
    expect(r).toMatchObject({ text: "Pronto", inputTokens: 30, outputTokens: 5, toolCalls: 1 });
    expect(asked).toEqual([["hoje", {}]]);
    expect(s.calls[0]?.headers["x-api-key"]).toBe("KEY");
    expect((s.calls[0]?.body.tools as { input_schema: unknown }[])[0]?.input_schema).toBeTruthy();
    expect(s.calls[0]?.body.system).toBe("SISTEMA");
    const second = JSON.stringify(s.calls[1]?.body.messages);
    expect(second).toContain("tool_result");
    expect(second).toContain("DADOS");
  });
  it("OpenAI: tool_calls com argumentos JSON em texto", async () => {
    const s = await fake((n) => (n === 1 ? { json: { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "ver_cliente", arguments: '{"id":"abc"}' } }] } }], usage: { prompt_tokens: 5, completion_tokens: 1 } } } : { json: { choices: [{ message: { role: "assistant", content: "Feito" } }], usage: { prompt_tokens: 8, completion_tokens: 2 } } }));
    const asked: unknown[] = [];
    const r = await new OpenAiToolChat("OKEY", "gpt-x", s.base).run(input(async (n, a) => { asked.push([n, a]); return "OK"; }));
    s.close();
    expect(r).toMatchObject({ text: "Feito", inputTokens: 13, outputTokens: 3, toolCalls: 1 });
    expect(asked).toEqual([["ver_cliente", { id: "abc" }]]);
    expect(s.calls[0]?.headers.authorization).toBe("Bearer OKEY");
    expect(s.calls[0]?.url).toBe("/v1/chat/completions");
    expect((s.calls[0]?.body.messages as { role: string }[])[0]?.role).toBe("system");
    expect(JSON.stringify(s.calls[1]?.body.messages)).toContain('"role":"tool"');
  });
  it("Gemini: functionCall/functionResponse e ferramenta sem argumentos sem parameters", async () => {
    const s = await fake((n) => (n === 1 ? { json: { candidates: [{ content: { parts: [{ functionCall: { name: "hoje", args: {} } }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 1 } } } : { json: { candidates: [{ content: { parts: [{ text: "Resposta Gemini" }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } } }));
    const r = await new GeminiToolChat("GKEY", "gemini-x", s.base).run(input(async () => "RES"));
    s.close();
    expect(r).toMatchObject({ text: "Resposta Gemini", inputTokens: 16, outputTokens: 5, toolCalls: 1 });
    expect(s.calls[0]?.headers["x-goog-api-key"]).toBe("GKEY");
    const decls = ((s.calls[0]?.body.tools as { functionDeclarations: { name: string; parameters?: unknown }[] }[])[0]?.functionDeclarations) ?? [];
    expect(decls.find((d) => d.name === "hoje")?.parameters).toBeUndefined();
    expect(decls.find((d) => d.name === "ver_cliente")?.parameters).toBeTruthy();
    expect(JSON.stringify(s.calls[1]?.body.contents)).toContain("functionResponse");
  });
  it("mapeia 401/429/500 e respeita o limite de passos", async () => {
    for (const [status, re] of [[401, /recusada/], [429, /limite de uso/], [500, /erro \(500\)/]] as const) {
      const s = await fake(() => ({ status, json: {} }));
      await expect(new OpenAiToolChat("k", "m", s.base).run(input(async () => ""))).rejects.toThrow(re);
      s.close();
    }
    const loop = await fake(() => ({ json: { content: [{ type: "tool_use", id: "x", name: "hoje", input: {} }], usage: {} } }));
    const r = await new AnthropicToolChat("k", "m", loop.base).run(input(async () => "x", 3));
    loop.close();
    expect(r.text).toMatch(/limite de consultas/);
    expect(loop.calls).toHaveLength(3);
    const empty = await fake(() => ({ json: { content: [], usage: {} } }));
    await expect(new AnthropicToolChat("k", "m", empty.base).run(input(async () => ""))).rejects.toBeInstanceOf(AiProviderError);
    empty.close();
  });
});

const post = (url: string, init: { body?: string; headers?: Record<string, string> }) => new Request(url, { method: "POST", body: init.body, headers: { "content-type": "application/json", ...init.headers } });
const rpc = (token: string | null, body: unknown, extra: Record<string, string> = {}) => mcpPost(post("http://localhost:3000/api/mcp", { body: JSON.stringify(body), headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra } }));

describe("6.0 — rotas HTTP (MCP e OAuth)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let key: string;
  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    A = await makeOrgWithOwner("r6h");
    await db.userMfa.upsert({ where: { userId: A.owner.id }, create: { userId: A.owner.id, secretEnc: encryptSecret("S", mfaKey()!), enabledAt: new Date() }, update: { enabledAt: new Date() } });
    await setOrgAiEnabled(A.ctx, true);
    key = (await createApiKey(A.ctx, { name: "Chave HTTP", scopes: ["mcp:read"] })).token;
  });
  afterAll(() => undefined);

  it("metadados de descoberta (RFC 9728 e RFC 8414)", async () => {
    const res = (await (await metaRes()).json()) as { resource: string; authorization_servers: string[] };
    expect(res.resource).toBe(mcpUrl());
    expect(res.authorization_servers).toHaveLength(1);
    const as = (await (await metaAuth()).json()) as Record<string, unknown>;
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.registration_endpoint).toMatch(/\/api\/oauth\/register$/);
    expect(as.token_endpoint).toMatch(/\/api\/oauth\/token$/);
    expect(as.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });
  it("sem credencial: 401 com WWW-Authenticate apontando para os metadados", async () => {
    const r = await rpc(null, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain(`resource_metadata="`);
    expect(r.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource/api/mcp");
    expect((await rpc("lgos_00000000_" + "a".repeat(43), { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
  });
  it("desligado: 403 com mensagem; ligado: funciona; GET não é permitido; Origin estranha é recusada", async () => {
    const off = await rpc(key, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(off.status).toBe(403);
    expect(((await off.json()) as { error: { message: string } }).error.message).toMatch(/desligada/);
    await setRuteFeature(A.ctx, "mcp", true, { consent: true });
    const ok = await rpc(key, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe("legalos-rute");
    expect((await rpc(key, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    expect((await rpc(key, { jsonrpc: "2.0", id: 2, method: "ping" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await rpc(key, { jsonrpc: "2.0", id: 2, method: "ping" }, { origin: "https://claude.ai" })).status).toBe(200);
    expect((await mcpGet()).status).toBe(405);
    expect((await mcpPost(post("http://localhost:3000/api/mcp", { body: "{nao-json", headers: { authorization: `Bearer ${key}` } }))).status).toBe(400);
    const batch = await rpc(key, [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
    expect(((await batch.json()) as unknown[]).length).toBe(2);
    const call = await rpc(key, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "hoje", arguments: {} } });
    expect(((await call.json()) as { result: { isError: boolean } }).result.isError).toBe(false);
  });
  it("OAuth pelas rotas: registro, código, token (form), renovação e erros no formato RFC", async () => {
    const reg = await registerPost(post("http://localhost:3000/api/oauth/register", { body: JSON.stringify({ client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/connector/oauth/abc"] }) }));
    expect(reg.status).toBe(201);
    const c = (await reg.json()) as { client_id: string; token_endpoint_auth_method: string };
    expect(c.token_endpoint_auth_method).toBe("none");
    const bad = await registerPost(post("http://localhost:3000/api/oauth/register", { body: JSON.stringify({ redirect_uris: ["http://evil.com/cb"] }) }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("invalid_redirect_uri");

    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const redirect = "https://chatgpt.com/connector/oauth/abc";
    const { code } = await createAuthCode(A.ctx, { clientId: c.client_id, redirectUri: redirect, codeChallenge: challenge, scopes: ["mcp:read"] });
    const form = (o: Record<string, string>) => new Request("http://localhost:3000/api/oauth/token", { method: "POST", body: new URLSearchParams(o).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } });
    const wrong = await tokenPost(form({ grant_type: "authorization_code", code, client_id: c.client_id, redirect_uri: redirect, code_verifier: randomBytes(32).toString("base64url") }));
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: string }).error).toBe("invalid_grant");
    const { code: code2 } = await createAuthCode(A.ctx, { clientId: c.client_id, redirectUri: redirect, codeChallenge: challenge, scopes: ["mcp:read"] });
    const tok = await tokenPost(form({ grant_type: "authorization_code", code: code2, client_id: c.client_id, redirect_uri: redirect, code_verifier: verifier }));
    expect(tok.status).toBe(200);
    expect(tok.headers.get("cache-control")).toBe("no-store");
    const t = (await tok.json()) as { access_token: string; refresh_token: string; expires_in: number };
    expect(t.expires_in).toBe(3600);
    const viaOauth = await rpc(t.access_token, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(viaOauth.status).toBe(200);
    const ref = await tokenPost(form({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: c.client_id }));
    expect(ref.status).toBe(200);
    expect((await tokenPost(form({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: c.client_id }))).status).toBe(400);
    expect(((await (await tokenPost(form({ grant_type: "password" }))).json()) as { error: string }).error).toBe("unsupported_grant_type");
  });
});
