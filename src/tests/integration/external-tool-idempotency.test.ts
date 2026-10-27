import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { GET as openapi } from "@/app/api/v1/openapi/route";
import { POST as rest } from "@/app/api/v1/tools/[name]/route";
import { POST as mcp } from "@/app/api/mcp/route";
import { createApiKey, revokeApiKey } from "@/server/services/apikey.service";
import { setEmergencyStop, setRuteFeature } from "@/server/services/rute-settings.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { totpCode, totpStep } from "@/lib/security/totp";
import { makeOrgWithOwner, META } from "./helpers";

describe("External tool idempotency", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let restToken: string, mcpToken: string;
  const post = (key: string | undefined, args: unknown, name = "criar_tarefa", token = restToken) => rest(new Request(`http://localhost/api/v1/tools/${name}`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(args),
  }), { params: Promise.resolve({ name }) });
  const rpc = (id: number, args: unknown, name = "criar_tarefa") => mcp(new Request("http://localhost/api/mcp", { method: "POST", headers: { authorization: `Bearer ${mcpToken}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) }));
  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    a = await makeOrgWithOwner("external-dedup");
    const enrollment = await startEnrollment(a.owner.id, a.owner.email);
    await confirmEnrollment(a.owner.id, totpCode(enrollment.secret, totpStep()), META);
    restToken = (await createApiKey(a.ctx, { name: "REST dedup", scopes: ["tools:execute", "tools:read"] })).token;
    mcpToken = (await createApiKey(a.ctx, { name: "MCP dedup", scopes: ["mcp:execute", "mcp:read"] })).token;
    await setRuteFeature(a.ctx, "mcp", true, { consent: true });
  });
  it("requires keys only for writes", async () => {
    expect((await post(undefined, { title: "No key" })).status).toBe(422);
    expect((await post(undefined, {}, "indicadores_escritorio")).status).toBe(200);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: "No key" } })).toBe(0);
  });
  it("replays REST writes, accepts reordered arguments, and rejects key reuse for a new payload", async () => {
    const key = randomUUID();
    const first = await (await post(key, { title: "REST exactly once", description: "Teste" })).json();
    const replay = await (await post(key, { description: "Teste", title: "REST exactly once" })).json();
    expect(first.meta.replayed).toBe(false); expect(replay.meta.replayed).toBe(true);
    expect(replay.data).toEqual(first.data);
    expect((await post(key, { title: "Different task" })).status).toBe(409);
    expect((await post(key, { name: "Different client" }, "criar_cliente")).status).toBe(409);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: "REST exactly once" } })).toBe(1);
  });
  it("protects simultaneous REST retries", async () => {
    const key = randomUUID(), args = { title: "Concurrent REST task" };
    const results = await Promise.all([post(key, args), post(key, args)]);
    expect(results.every(r => [200, 409].includes(r.status))).toBe(true);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: args.title } })).toBe(1);
  });
  it("uses a per-call MCP argument, independently of JSON-RPC IDs", async () => {
    const args = { title: "MCP exactly once", idempotencyKey: randomUUID() };
    const first = await (await rpc(1, args)).json();
    const replay = await (await rpc(99, args)).json();
    expect(first.result.isError).toBe(false); expect(replay.id).toBe(99);
    expect(replay.result._meta["legalos/replayed"]).toBe(true);
    expect(replay.result.content).toEqual(first.result.content);
    const conflict = await (await rpc(100, { ...args, title: "Changed MCP title" })).json();
    expect(conflict.result._meta["legalos/error-code"]).toBe("idempotency_conflict");
    const missing = await (await rpc(101, { title: "Missing MCP key" })).json();
    expect(missing.result.isError).toBe(true);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: args.title } })).toBe(1);
  });
  it("does not retry uncertain results and respects emergency stop on cached requests", async () => {
    const key = randomUUID(), args = { title: "Uncertain task" };
    expect((await post(key, args)).status).toBe(200);
    await db.$executeRaw`UPDATE external_tool_requests SET state='UNKNOWN' WHERE organization_id=${a.org.id}::uuid AND idempotency_key=${key}`;
    const unknown = await post(key, args);
    expect(unknown.status).toBe(409); expect((await unknown.json()).error.code).toBe("idempotency_outcome_unknown");
    const savedKey = randomUUID(); await post(savedKey, { title: "Before stop" });
    await setEmergencyStop(a.ctx, true);
    try { expect((await post(savedKey, { title: "Before stop" })).status).toBe(409); }
    finally { await setEmergencyStop(a.ctx, false); }
    expect(await db.task.count({ where: { organizationId: a.org.id, title: args.title } })).toBe(1);
  });
  it("authenticates retries again instead of serving cached data to revoked keys", async () => {
    const credential = await createApiKey(a.ctx, { name: "Revocable dedup", scopes: ["tools:execute"] });
    const key = randomUUID(), args = { title: "Before revoke" };
    expect((await post(key, args, "criar_tarefa", credential.token)).status).toBe(200);
    await revokeApiKey(a.ctx, credential.id);
    expect((await post(key, args, "criar_tarefa", credential.token)).status).toBe(401);
  });
  it("publishes the required key in OpenAPI and MCP schemas and accepts per-call metadata", async () => {
    const doc = await (await openapi(new Request("http://localhost/api/v1/openapi", { headers: { authorization: `Bearer ${restToken}` } }), { params: Promise.resolve({}) })).json();
    expect(doc.paths["/api/v1/tools/criar_tarefa"].post.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    const listing = await (await mcp(new Request("http://localhost/api/mcp", { method: "POST", headers: { authorization: `Bearer ${mcpToken}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }))).json();
    expect(listing.result.tools.find((t: {name: string}) => t.name === "criar_tarefa").inputSchema.required).toContain("idempotencyKey");
    const key = randomUUID();
    const request = () => mcp(new Request("http://localhost/api/mcp", { method: "POST", headers: { authorization: `Bearer ${mcpToken}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 55, method: "tools/call", params: { name: "criar_tarefa", arguments: { title: "MCP metadata task" }, _meta: { "legalos/idempotency-key": key } } }) }));
    expect((await (await request()).json()).result.isError).toBe(false);
    expect((await (await request()).json()).result._meta["legalos/replayed"]).toBe(true);
    expect(await db.task.count({ where: { organizationId: a.org.id, title: "MCP metadata task" } })).toBe(1);
  });

});
