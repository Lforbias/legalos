import { beforeAll, describe, expect, it, vi } from "vitest";
vi.unmock("@/lib/box-retirement");
import { db } from "@/lib/db/client";
import { BOX_AVAILABLE } from "@/lib/box-retirement";
import { callTool, toolList, type Origin } from "@/server/services/rute-tools.service";
import { makeOrgWithOwner } from "./helpers";

/**
 * Box 3.0 — ferramentas novas da RUTE para a caixa pública (`caixa_v3_listar`, `caixa_v3_ver`,
 * `caixa_v3_cobertura`), que precisam continuar alcançáveis mesmo com o Box autenticado antigo retirado.
 * Elas declaram `permission: "ai:use"` (não "inbox:read") de propósito: `can()`/`assertCan()` zeram qualquer
 * permissão `inbox:*` enquanto BOX_AVAILABLE for falso, e se o catálogo dependesse disso aqui a ferramenta
 * ficaria invisível para sempre — o mesmo bug já corrigido em src/server/services/djen.service.ts e em
 * src/app/api/box/v3/capabilities/route.ts. A autorização real é a permissão bruta do cargo, checada dentro
 * de cada `run()` (via `assertBoxV3Read` em box-v3.service.ts, ou diretamente em caixa_v3_cobertura).
 */
const ORIGIN: Origin = { via: "MCP", connection: "teste", provider: "ANTHROPIC" };

describe("Box 3.0: ferramentas da RUTE para a caixa pública não dependem do Box autenticado retirado", () => {
  let office: Awaited<ReturnType<typeof makeOrgWithOwner>>, noticeId: string;

  beforeAll(async () => {
    office = await makeOrgWithOwner("box-v3-rute");
    await db.ruteSettings.upsert({
      where: { organizationId: office.org.id },
      create: { organizationId: office.org.id, mcpEnabled: true, assistantEnabled: true },
      update: { mcpEnabled: true, assistantEnabled: true },
    });
    noticeId = (await db.courtNotice.create({
      data: {
        organizationId: office.org.id,
        title: "Publicação fictícia do DJEN para teste",
        content: "Conteúdo de teste, sem dado real.",
        contentHash: "rute-box-v3-fixture",
        receivedAt: new Date("2026-10-29T00:00:00Z"),
        originKind: "DJEN_PUBLICATION",
        sourceSystem: "djen",
      },
    })).id;
  });

  it("aparecem no catálogo (não batem no filtro isBoxTool nem dependem de BOX_AVAILABLE)", () => {
    expect(BOX_AVAILABLE).toBe(false);
    const names = toolList(office.ctx, new Set(["read"])).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["caixa_v3_listar", "caixa_v3_ver", "caixa_v3_cobertura"]));
  });

  it("caixa_v3_listar devolve a comunicação cadastrada, com a origem sempre identificada", async () => {
    const r = await callTool(office.ctx, new Set(["read"]), ORIGIN, "caixa_v3_listar", { folder: "entrada" });
    expect(r.ok).toBe(true);
    const data = r.data as { itens: Array<{ id: string; origem_tipo: string | null; origem_descricao: string }> };
    const item = data.itens.find((i) => i.id === noticeId);
    expect(item).toBeTruthy();
    expect(item?.origem_tipo).toBe("DJEN_PUBLICATION");
    expect(item?.origem_descricao).toBe("Publicação no DJEN");
  });

  it("caixa_v3_ver devolve o teor completo e nunca marca ciência oficial nem abertura interna", async () => {
    const r = await callTool(office.ctx, new Set(["read"]), ORIGIN, "caixa_v3_ver", { id: noticeId });
    expect(r.ok).toBe(true);
    const data = r.data as { id: string; conteudo: string; ciencia_oficial_em: string | null };
    expect(data.id).toBe(noticeId);
    expect(data.conteudo).toContain("Conteúdo de teste");
    expect(data.ciencia_oficial_em).toBeNull();
    const after = await db.courtNotice.findUniqueOrThrow({ where: { id: noticeId } });
    expect(after.officialAckAt).toBeNull();
    expect(after.firstViewedAt).toBeNull();
  });

  it("caixa_v3_cobertura devolve a matriz de conectores para quem tem a permissão bruta inbox:read", async () => {
    const r = await callTool(office.ctx, new Set(["read"]), ORIGIN, "caixa_v3_cobertura", { conector: "djen" });
    expect(r.ok).toBe(true);
    const data = r.data as { conectores: Array<{ chave: string }>; cobertura: unknown[] };
    expect(data.conectores.length).toBeGreaterThan(0);
    expect(Array.isArray(data.cobertura)).toBe(true);
  });

  it("caixa_v3_cobertura nega para quem não tem a permissão bruta inbox:read, mesmo listado por ai:use", async () => {
    const restricted = { ...office.ctx, permissions: new Set([...office.ctx.permissions].filter((p) => p !== "inbox:read")) };
    const r = await callTool(restricted, new Set(["read"]), ORIGIN, "caixa_v3_cobertura", {});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });
});
