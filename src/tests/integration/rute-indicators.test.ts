import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { getDashboard } from "@/server/services/dashboard.service";
import { createClient } from "@/server/services/client.service";
import { setRuteFeature } from "@/server/services/rute-settings.service";
import { callTool } from "@/server/services/rute-tools.service";
import { makeOrgWithOwner } from "./helpers";

const scopes = new Set(["read"] as const);
const origin = { via: "ASSISTANT" as const, connection: null, provider: "teste" };
const decode = (text: string) => JSON.parse(text.slice(text.indexOf("\n") + 1));
describe("Indicadores da RUTE", () => {
  it("totais correspondem ao painel, não são limitados pela busca e respeitam escritório e permissões", async () => {
    const a = await makeOrgWithOwner("rute-totais");
    const b = await makeOrgWithOwner("rute-outro");
    const base = { type: "PERSON" as const, status: "ACTIVE" as const, name: "Cliente ativo", tradeName: "", document: "", email: "", phone: "", birthDate: "", tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "" };
    for (let i = 0; i < 23; i++) await createClient(a.ctx, { ...base, name: `Ativo ${i}` });
    await createClient(a.ctx, { ...base, name: "Inativo", status: "INACTIVE" });
    await createClient(b.ctx, { ...base, name: "Outro escritório" });
    await db.client.create({ data: { organizationId: a.org.id, name: "Excluído", type: "PERSON", status: "ACTIVE", deletedAt: new Date() } });
    await setRuteFeature(a.ctx, "assistant", true);
    const dashboard = await getDashboard(a.ctx);
    const result = await callTool(a.ctx, scopes, origin, "indicadores_escritorio", {});
    expect(result.ok).toBe(true);
    const data = decode(result.text);
    expect(data.clientes_ativos).toBe(23);
    expect(data.clientes_ativos).toBe(dashboard.legal.activeClients);
    expect(data.membros_ativos).toBe(dashboard.members.active);
    expect(data.fonte.caminho).toBe("/");
    const restricted = { ...a.ctx, permissions: new Set(["ai:use"] as const), isOwner: false };
    const limited = decode((await callTool(restricted, scopes, origin, "indicadores_escritorio", {})).text);
    expect(limited).not.toHaveProperty("clientes_ativos");
    expect(limited).not.toHaveProperty("membros_ativos");
    expect(limited).not.toHaveProperty("processos_em_andamento");
    const inactive = await callTool(a.ctx, scopes, origin, "buscar_clientes", { status: "INACTIVE" });
    expect(decode(inactive.text).map((c: { nome: string }) => c.nome)).toEqual(["Inativo"]);
  });
});
