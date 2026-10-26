import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { callTool, toolCatalog } from "@/server/services/rute-tools.service";
import { approveProposal, createProposal } from "@/server/services/rute-proposal.service";
import { setRuteFeature } from "@/server/services/rute-settings.service";
import { makeOrgWithOwner } from "./helpers";

const origin = {via: "API" as const, connection: null, provider: "test"};
const scopes = new Set(["read", "propose"] as const);
describe("Expansão do catálogo compartilhado", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let b: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  beforeAll(async () => {
    a = await makeOrgWithOwner("catalogo-a"); b = await makeOrgWithOwner("catalogo-b");
    await setRuteFeature(a.ctx, "mcp", true, {consent: true});
    await setRuteFeature(a.ctx, "proposals", true);
  });
  it("descobre todas as funções sem truncamento e filtra por nome e permissão", async () => {
    const names = new Set<string>();
    for (let page = 1; page <= 3; page++) {
      const r = await callTool(a.ctx, scopes, origin, "capacidades", {page, limit: 30});
      expect(r.ok).toBe(true); expect(r.truncated).toBe(false);
      const data = r.data as {ferramentas: {nome: string}[]};
      data.ferramentas.forEach(t => names.add(t.nome));
    }
    expect(names.size).toBe(82);
    expect(toolCatalog(a.ctx, scopes)).toHaveLength(names.size);
    const limited = {...a.ctx, isOwner: false, permissions: new Set(["ai:use"] as const)};
    expect((await callTool(limited, scopes, origin, "listar_contas_financeiras", {})).status).toBe(403);
    const found = await callTool(a.ctx, scopes, origin, "capacidades", {q: "custo"});
    expect(found.data).toMatchObject({total: 2});
  });
  it("rejeita filtros inexistentes em vez de executar uma consulta mais ampla", async () => {
    const r = await callTool(a.ctx, scopes, origin, "listar_atividades", { cliente: "Ana" });
    expect(r).toMatchObject({ ok: false, status: 422, code: "validation_error" });
    expect(r.text).toContain("cliente");
    const catalog = toolCatalog(a.ctx, scopes).find(t => t.name === "listar_atividades")!;
    expect(catalog.inputSchema.properties).toHaveProperty("clientId");
    expect(catalog.inputSchema.properties).toHaveProperty("includeClosed");
    expect((await callTool(a.ctx, scopes, origin, "capacidades", { name: "listar_atividades" })).data).toMatchObject({ nome: "listar_atividades", argumentos: { properties: { clientId: { type: "string" } } } });
  });
  it("consulta pendências do cliente por vínculo direto e por processo, sem misturar sigilo ou escritórios", async () => {
    const client = await db.client.create({ data: { organizationId: a.org.id, name: "Cliente relacional", type: "PERSON" } });
    const other = await db.client.create({ data: { organizationId: b.org.id, name: "Outro cliente", type: "PERSON" } });
    const process = await db.case.create({ data: { organizationId: a.org.id, title: "Caso do cliente", parties: { create: { organizationId: a.org.id, clientId: client.id, name: client.name, role: "PLAINTIFF", isOurClient: true } } } });
    const secret = await db.case.create({ data: { organizationId: a.org.id, title: "Caso restrito", confidential: true, parties: { create: { organizationId: a.org.id, clientId: client.id, name: client.name, role: "PLAINTIFF", isOurClient: true } } } });
    await db.task.createMany({ data: [
      { organizationId: a.org.id, title: "Direta", clientId: client.id },
      { organizationId: a.org.id, title: "Pelo processo", caseId: process.id },
      { organizationId: a.org.id, title: "Sigilosa", caseId: secret.id, clientId: client.id },
      { organizationId: b.org.id, title: "Externa", clientId: other.id },
    ] });
    const limited = { ...a.ctx, isOwner: false, permissions: new Set(["ai:use", "tasks:read"] as const) };
    const r = await callTool(limited, scopes, origin, "listar_atividades", { clientId: client.id });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ total: 2, items: expect.arrayContaining([expect.objectContaining({ title: "Direta" }), expect.objectContaining({ title: "Pelo processo" })]) });
    expect((await callTool(limited, scopes, origin, "listar_atividades", { clientId: other.id })).data).toMatchObject({ total: 0 });
  });
  it("financeiro só grava após aprovação e consulta não mistura escritórios", async () => {
    const p = await createProposal(a.ctx, origin, {kind: "FINANCE_COST_CENTER_CREATE", payload: {name: "Contencioso"}});
    expect(await db.costCenter.count({where: {organizationId: a.org.id}})).toBe(0);
    await approveProposal(a.ctx, p.id);
    await db.costCenter.create({data: {organizationId: b.org.id, name: "Externo"}});
    const r = await callTool(a.ctx, scopes, origin, "listar_centros_custo", {});
    expect(r.ok).toBe(true); expect(r.data).toMatchObject({total_observado: 1, items: [{name: "Contencioso"}]});
    await expect(approveProposal(a.ctx, p.id)).rejects.toThrow();
  });
  it("plano do dia respeita responsável, data, sigilo e fornece links", async () => {
    const secret = await db.case.create({data: {organizationId: a.org.id, title: "Reservado", confidential: true}});
    await db.task.createMany({data: [
      {organizationId: a.org.id, title: "Minha tarefa", assigneeId: a.owner.id, dueDate: new Date("2026-12-01")},
      {organizationId: a.org.id, title: "Sigilosa", assigneeId: a.owner.id, dueDate: new Date("2026-12-01"), caseId: secret.id},
      {organizationId: a.org.id, title: "Outro dia", assigneeId: a.owner.id, dueDate: new Date("2026-12-02")},
    ]});
    const limited = {...a.ctx, isOwner: false, permissions: new Set(["ai:use", "tasks:read"] as const)};
    const r = await callTool(limited, scopes, origin, "organizar_dia", {date: "2026-12-01"});
    expect(r.ok).toBe(true); expect(r.data).toMatchObject({total: 1, items: [{title: "Minha tarefa", href: expect.stringContaining("/tarefas/")}]});
    expect((await callTool(limited, scopes, origin, "listar_notas_processo", {caseId: secret.id})).status).toBe(403);
    expect((await callTool(a.ctx, scopes, origin, "organizar_dia", {date: "2026-02-30"})).status).toBe(422);
  });
  it("cria modelo e horas apenas pela aprovação; impede processo de outro escritório", async () => {
    const t = await createProposal(a.ctx, origin, {kind: "TEMPLATE_CREATE", payload: {name: "Modelo de teste", body: "Conteúdo revisável"}});
    const result = await approveProposal(a.ctx, t.id);
    expect((await callTool(a.ctx, scopes, origin, "ver_modelo_documento", {id: result.id})).data).toMatchObject({name: "Modelo de teste"});
    const p = await createProposal(a.ctx, origin, {kind: "TIME_CREATE", payload: {date: "2026-12-01", duration: "90min", description: "Revisão documental", caseId: ""}});
    const time = await approveProposal(a.ctx, p.id);
    expect(await db.timeEntry.findUnique({where: {id: time.id}})).toMatchObject({userId: a.owner.id, minutes: 90});
    const c = await db.case.create({data: {organizationId: b.org.id, title: "Outro escritório"}});
    await expect(createProposal(a.ctx, origin, {kind: "TIME_CREATE", payload: {date: "2026-12-01", duration: "1h", description: "Revisão", caseId: c.id}})).rejects.toThrow();
  });
});
