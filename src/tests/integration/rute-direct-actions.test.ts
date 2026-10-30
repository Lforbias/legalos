import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { callTool, toolCatalog } from "@/server/services/rute-tools.service";
import { setEmergencyStop, setRuteFeature } from "@/server/services/rute-settings.service";
import { authenticateMcpBearer, parseScopes } from "@/server/services/mcp-auth.service";
import { createApiKey } from "@/server/services/apikey.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { totpCode, totpStep } from "@/lib/security/totp";
import { POST } from "@/app/api/v1/tools/[name]/route";
import { makeOrgWithOwner, META } from "./helpers";

const origin = { via: "API" as const, connection: "test", provider: "API" };
const scopes = new Set(["execute"] as const);
describe("Ações diretas com escopo explícito", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let b: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  beforeAll(async () => {
    a = await makeOrgWithOwner("direct-a"); b = await makeOrgWithOwner("direct-b");
    await setRuteFeature(a.ctx, "mcp", true, { consent: true });
  });
  it("descobre 20 ações sem ampliar escopos existentes ou o padrão OAuth", () => {
    expect(toolCatalog(a.ctx, scopes)).toHaveLength(20);
    expect(toolCatalog(a.ctx, new Set(["read", "propose"]))).toHaveLength(90);
    expect(parseScopes(null)).not.toContain("mcp:execute");
    expect(parseScopes("mcp:execute")).toEqual(["mcp:execute"]);
  });
  it("cria e altera cadastro imediatamente sem criar proposta", async () => {
    const r = await callTool(a.ctx, scopes, origin, "criar_cliente", { name: "Cliente direto" });
    expect(r.ok).toBe(true);
    const id = (r.data as {id: string}).id;
    expect(await db.client.findUnique({ where: { id } })).toMatchObject({ name: "Cliente direto", organizationId: a.org.id });
    const changed = await callTool(a.ctx, scopes, origin, "atualizar_cliente", { clientId: id, notes: "Alteração autorizada" });
    expect(changed.ok).toBe(true);
    expect(await db.client.findUnique({ where: { id } })).toMatchObject({ name: "Cliente direto", notes: "Alteração autorizada" });
    expect(await db.aiProposal.count({ where: { organizationId: a.org.id } })).toBe(0);
    expect(await db.aiToolLog.count({ where: { organizationId: a.org.id, tool: "criar_cliente", ok: true } })).toBe(1);
  });
  it("bloqueia leitura/proposta, falta de permissão, alvo externo e versão antiga", async () => {
    for (const scope of ["read", "propose"] as const) expect((await callTool(a.ctx, new Set([scope]), origin, "criar_tarefa", { title: "Sem acesso" })).status).toBe(403);
    const limited = { ...a.ctx, isOwner: false, permissions: new Set(["ai:use"] as const) };
    expect((await callTool(limited, scopes, origin, "criar_cliente", { name: "Negado" })).status).toBe(403);
    const external = await db.client.create({ data: { organizationId: b.org.id, name: "Externo", type: "PERSON" } });
    expect((await callTool(a.ctx, scopes, origin, "atualizar_cliente", { clientId: external.id, notes: "Não aplicar" })).ok).toBe(false);
    const own = await db.client.findFirstOrThrow({ where: { organizationId: a.org.id } });
    expect((await callTool(a.ctx, scopes, origin, "atualizar_cliente", { clientId: own.id, name: "Não aplicar", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" })).status).toBe(409);
    expect((await db.client.findUniqueOrThrow({ where: { id: own.id } })).name).toBe("Cliente direto");
  });
  it("cria tarefa ligada ao cliente e mantém validação e parada de emergência", async () => {
    const c = await db.client.findFirstOrThrow({ where: { organizationId: a.org.id } });
    const r = await callTool(a.ctx, scopes, origin, "criar_tarefa", { title: "Conferir documentos", clientId: c.id });
    expect(r.ok).toBe(true);
    expect(await db.task.findUnique({ where: { id: (r.data as {id: string}).id } })).toMatchObject({ clientId: c.id, status: "TODO" });
    expect((await callTool(a.ctx, scopes, origin, "criar_tarefa", { title: "Outra tarefa", campoInventado: true })).status).toBe(422);
    await setEmergencyStop(a.ctx, true);
    expect((await callTool(a.ctx, scopes, origin, "criar_cliente", { name: "Bloqueado" })).status).toBe(409);
    await setEmergencyStop(a.ctx, false);
  });
  it("expõe execução na REST e autentica chave MCP com escopo próprio", async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    const enrollment = await startEnrollment(a.owner.id, a.owner.email);
    await confirmEnrollment(a.owner.id, totpCode(enrollment.secret, totpStep()), META);
    const rest = await createApiKey(a.ctx, { name: "Execução REST", scopes: ["tools:execute"] });
    const req = new Request("http://localhost/api/v1/tools/criar_tarefa", { method: "POST", headers: { authorization: `Bearer ${rest.token}`, "content-type": "application/json", "Idempotency-Key": "direct-action-rest-test" }, body: JSON.stringify({ title: "Criada por REST" }) });
    const res = await POST(req, { params: Promise.resolve({ name: "criar_tarefa" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ executed: true, type: "task" });
    const mcp = await createApiKey(a.ctx, { name: "Execução MCP", scopes: ["mcp:execute"] });
    expect((await authenticateMcpBearer(mcp.token))?.scopes).toEqual(new Set(["execute"]));
    expect((await authenticateMcpBearer(rest.token))).toBeNull();
  });
});
