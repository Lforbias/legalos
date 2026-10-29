import { beforeAll, describe, expect, it, vi } from "vitest";
// Unlike legacy compatibility tests, exercise the REAL production policy here.
vi.unmock("@/lib/box-retirement");
import { db } from "@/lib/db/client";
import { BOX_AVAILABLE } from "@/lib/box-retirement";
import { can } from "@/server/context";
import { runDjenAll, syncDjen } from "@/server/services/djen.service";
import { runMniAll } from "@/server/services/mni.service";
import { drainQueue } from "@/server/robots/pje-runner";
import { listClients } from "@/server/services/client.service";
import { listApiKeys } from "@/server/services/apikey.service";
import { makeOrgWithOwner } from "./helpers";

describe("retirada real do Box: sem mock de disponibilidade", () => {
  let office: Awaited<ReturnType<typeof makeOrgWithOwner>>, monitorId: string, noticeId: string;
  beforeAll(async () => {
    office = await makeOrgWithOwner("box-retired");
    monitorId = (await db.djenMonitor.create({ data: { organizationId: office.org.id, createdById: office.owner.id, label: "Histórico de teste", oabUf: "SP", oabNumber: "123456", enabled: true } })).id;
    noticeId = (await db.courtNotice.create({ data: { organizationId: office.org.id, title: "Registro histórico preservado", content: "Conteúdo fictício do histórico, sem dados reais.", contentHash: "retired-fixture", receivedAt: new Date("2026-10-29T00:00:00Z") } })).id;
  });
  it("nega acesso mesmo ao titular e não deixa flags antigas reativarem a política", () => {
    expect(BOX_AVAILABLE).toBe(false);
    expect(can(office.ctx, "inbox:read")).toBe(false);
    expect(can(office.ctx, "certificates:manage")).toBe(false);
    expect(can(office.ctx, "cases:read")).toBe(true);
    expect(can(office.ctx, "whatsapp:read")).toBe(true);
  });
  it("suspende monitores e worker sem apagar ou alterar o estado persistido", async () => {
    const beforeMonitor = await db.djenMonitor.findUniqueOrThrow({ where: { id: monitorId } });
    const beforeNotice = await db.courtNotice.findUniqueOrThrow({ where: { id: noticeId } });
    await expect(runDjenAll()).rejects.toThrow("retirado temporariamente");
    await expect(syncDjen(office.ctx, monitorId)).rejects.toThrow("retirado temporariamente");
    await expect(runMniAll()).rejects.toThrow("retirado temporariamente");
    const openPage = vi.fn(); expect(await drainQueue({ openPage })).toBe(0); expect(openPage).not.toHaveBeenCalled();
    expect(await db.djenMonitor.findUniqueOrThrow({ where: { id: monitorId } })).toEqual(beforeMonitor);
    expect(await db.courtNotice.findUniqueOrThrow({ where: { id: noticeId } })).toEqual(beforeNotice);
  });
  it("mantém a consulta de clientes do Func sem depender do Box", async () => {
    await db.client.create({ data: { organizationId: office.org.id, name: "Cliente fictício Func", type: "PERSON", status: "ACTIVE" } });
    const result = await listClients(office.ctx, {});
    expect(JSON.stringify(result)).toContain("Cliente fictício Func");
  });
  it("não apresenta chave exclusiva do Box como ativa e preserva seu registro", async () => {
    const key = await db.apiKey.create({ data: { organizationId: office.org.id, createdById: office.owner.id, name: "Chave histórica fictícia", prefix: "ab12cd34", keyHash: "0".repeat(64), scopes: ["pje:discover"] } });
    expect((await listApiKeys(office.ctx)).find(k => k.id === key.id)?.status).toBe("SUSPENDED");
    expect((await db.apiKey.findUniqueOrThrow({ where: { id: key.id } })).revokedAt).toBeNull();
  });
});
