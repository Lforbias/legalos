import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as catalog } from "@/app/api/v1/tools/route";
import { POST as execute } from "@/app/api/v1/tools/[name]/route";
import { GET as openapi } from "@/app/api/v1/openapi/route";
import { db } from "@/lib/db/client";
import { totpCode, totpStep } from "@/lib/security/totp";
import { createApiKey, revokeApiKey } from "@/server/services/apikey.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { setEmergencyStop, setRuteFeature } from "@/server/services/rute-settings.service";
import { callTool, toolCatalog } from "@/server/services/rute-tools.service";
import { makeOrgWithOwner, META } from "./helpers";

const request = (token: string | null, body?: unknown) => new Request("http://localhost/api/v1/tools/test", { method: body === undefined ? "GET" : "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", "Idempotency-Key": randomUUID() }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const invoke = (token: string | null, name: string, body: unknown = {}) => execute(request(token, body), { params: Promise.resolve({ name }) });
const list = (token: string | null) => catalog(request(token), { params: Promise.resolve({}) });
describe("REST, RUTE e MCP compartilham ferramentas", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let read: string, propose: string, legacy: string;
  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    a = await makeOrgWithOwner("tool-api");
    const user = await db.user.findUniqueOrThrow({ where: { id: a.ctx.userId } });
    const enrollment = await startEnrollment(user.id, user.email);
    await confirmEnrollment(user.id, totpCode(enrollment.secret, totpStep()), META);
    read = (await createApiKey(a.ctx, { name: "Consultas ferramentas", scopes: ["tools:read"] })).token;
    propose = (await createApiKey(a.ctx, { name: "Propostas ferramentas", scopes: ["tools:propose"] })).token;
    legacy = (await createApiKey(a.ctx, { name: "Somente clientes", scopes: ["clients:read"] })).token;
    await setRuteFeature(a.ctx, "mcp", true, { consent: true });
    await setRuteFeature(a.ctx, "proposals", true);
  });
  it("exige autenticação e escopos próprios; catálogo tem paridade com a RUTE/MCP", async () => {
    expect((await list(null)).status).toBe(401);
    expect((await list(legacy)).status).toBe(403);
    const r = await list(read);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.data.map((t: { name: string }) => t.name)).toEqual(toolCatalog(a.ctx, new Set(["read"])).map(t => t.name));
    expect(j.data.some((t: { name: string }) => t.name === "ver_tarefa")).toBe(true);
    expect(j.data.some((t: { name: string }) => t.name.startsWith("propor_"))).toBe(false);
    const doc = await (await openapi(request(read), { params: Promise.resolve({}) })).json();
    expect(doc.openapi).toBe("3.1.0");
    for (const t of j.data) expect(doc.paths[`/api/v1/tools/${t.name}`].post.requestBody.content["application/json"].schema).toEqual(t.inputSchema);
  });
  it("devolve resultado estruturado e erros HTTP, sem ultrapassar escopos", async () => {
    const r = await invoke(read, "indicadores_escritorio");
    expect(r.status).toBe(200);
    expect((await r.json()).data.membros_ativos).toBe(1);
    expect((await invoke(read, "inexistente")).status).toBe(404);
    expect((await invoke(read, "ver_tarefa", { id: "invalido" })).status).toBe(422);
    expect((await invoke(read, "propor_tarefa", { title: "Teste" })).status).toBe(403);
  });
  it("proposta pela REST não executa a ação; registra origem API e exige decisão humana", async () => {
    const before = await db.task.count({ where: { organizationId: a.org.id } });
    const r = await invoke(propose, "propor_tarefa", { title: "Tarefa proposta via REST" });
    expect(r.status).toBe(200);
    expect(await db.task.count({ where: { organizationId: a.org.id } })).toBe(before);
    const p = await db.aiProposal.findFirstOrThrow({ where: { organizationId: a.org.id, via: "API" } });
    expect(p.status).toBe("PENDING");
  });
  it("detalhes de tarefas e prazos não atravessam escritórios; equipe não expõe e-mail", async () => {
    const b = await makeOrgWithOwner("tool-api-outro");
    const task = await db.task.create({ data: { organizationId: b.org.id, title: "Outro escritório" } });
    expect((await invoke(read, "ver_tarefa", { id: task.id })).status).toBe(404);
    const team = await (await invoke(read, "listar_equipe")).json();
    expect(team.data.total).toBe(1);
    expect(JSON.stringify(team.data)).not.toContain("@example.test");
    const blocked = { ...a.ctx, permissions: new Set(["ai:use"] as const), isOwner: false };
    const result = await callTool(blocked, new Set(["read"]), { via: "API", provider: "API", connection: null }, "listar_equipe", {});
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });
  it("detalhes compartilham as regras dos serviços e o conteúdo é mascarado", async () => {
    const c = await db.case.create({ data: { organizationId: a.org.id, title: "Caso de teste" } });
    const task = await db.task.create({ data: { organizationId: a.org.id, caseId: c.id, title: "Conferir documento", description: "Contato: pessoa@example.test" } });
    const deadline = await db.deadline.create({ data: { organizationId: a.org.id, caseId: c.id, title: "Prazo rascunho", dueDate: new Date("2026-12-01T00:00:00Z") } });
    const event = await db.agendaEvent.create({ data: { organizationId: a.org.id, caseId: c.id, title: "Reunião", startsAt: new Date("2026-12-01T14:00:00Z") } });
    const taskJson = await (await invoke(read, "ver_tarefa", { id: task.id })).json();
    expect(taskJson.data.titulo).toBe("Conferir documento");
    expect(JSON.stringify(taskJson.data)).not.toContain("pessoa@example.test");
    expect((await (await invoke(read, "ver_prazo", { id: deadline.id })).json()).data.situacao).toBe("DRAFT");
    expect((await (await invoke(read, "ver_compromisso", { id: event.id })).json()).data.titulo).toBe("Reunião");
  });
  it("parada de emergência e revogação cortam as chamadas", async () => {
    await setEmergencyStop(a.ctx, true);
    expect((await list(read)).status).toBe(409);
    expect((await invoke(read, "indicadores_escritorio")).status).toBe(409);
    await setEmergencyStop(a.ctx, false);
    const key = await createApiKey(a.ctx, { name: "Revogar ferramentas", scopes: ["tools:read"] });
    await revokeApiKey(a.ctx, key.id);
    expect((await list(key.token)).status).toBe(401);
  });
});
