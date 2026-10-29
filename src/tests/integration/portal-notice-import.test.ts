import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { importPortalNotices } from "@/server/services/portal-notice-import.service";
import { portalObservationKey } from "@/lib/pje/portal-import";
import { makeOrgWithOwner } from "./helpers";
import * as apiKeys from "@/server/services/apikey.service";
import { POST } from "@/app/api/v1/portal/notices/route";
const caseNumber = `0000001-${computeCnjCheck({ sequence: "0000001", year: "2026", segment: "4", court: "03", origin: "6342" })}.2026.4.03.6342`;
const item = { caseNumber, reference: "12345678", title: "Decisão", communicatedAt: "2026-10-13 15:42" };
const batch = { sourceOrigin: "https://pje1g.trf3.jus.br", sourcePath: "/pje/Painel/painel_usuario/advogado.seam", confirmed: true, items: [item] };
describe("PJe/TRF3 → Box: importação assistida", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>, B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  beforeAll(async () => { A = await makeOrgWithOwner("portal-import-a"); B = await makeOrgWithOwner("portal-import-b"); });
  it("cria na caixa com procedência honesta, sem inventar identificador oficial, ciência ou prazo", async () => {
    expect(await importPortalNotices(A.ctx, batch)).toEqual({ created: 1, known: 0, received: 1 });
    const n = await db.courtNotice.findFirstOrThrow({ where: { organizationId: A.org.id, externalKey: portalObservationKey(item) } });
    expect(n).toMatchObject({ status: "NEW", originKind: "IMPORT", sourceSystem: "pje-portal-assisted", officialId: null, officialAckAt: null, caseNumber, publishedAt: null });
    expect(n.content).toContain("Não contém o teor");
    expect(await db.deadline.count({ where: { organizationId: A.org.id } })).toBe(0);
  });
  it("deduplica reenvio e concorrência, isolando escritórios e mantendo referências distintas", async () => {
    const results = await Promise.all([importPortalNotices(A.ctx, batch), importPortalNotices(A.ctx, batch)]);
    expect(results.every(r => r.created === 0 && r.known === 1)).toBe(true);
    expect(await importPortalNotices(B.ctx, batch)).toMatchObject({ created: 1 });
    const next = { ...batch, items: [{ ...item, reference: "12345679" }] };
    const fresh = await Promise.all([importPortalNotices(A.ctx, next), importPortalNotices(A.ctx, next)]);
    expect(fresh.reduce((sum, r) => sum + r.created, 0)).toBe(1);
    expect(await db.courtNotice.count({ where: { organizationId: A.org.id } })).toBe(2);
  });
  it("recusa lote não confirmado ou contendo cookies e não faz gravação parcial de lote inválido", async () => {
    await expect(importPortalNotices(A.ctx, { ...batch, confirmed: false })).rejects.toThrow();
    await expect(importPortalNotices(A.ctx, { ...batch, cookies: "not-accepted" })).rejects.toThrow();
    await expect(importPortalNotices(A.ctx, { ...batch, items: [{ ...item, reference: "999999" }, { ...item, caseNumber: "invalid" }] })).rejects.toThrow();
    expect(await db.courtNotice.count({ where: { organizationId: A.org.id } })).toBe(2);
  });
  it("a rota exige escopo próprio e permissão vigente; a chave antiga de CNJs não importa", async () => {
    const auth = vi.spyOn(apiKeys, "authenticateApiKey");
    const request = () => new Request("http://localhost/api/v1/portal/notices", { method: "POST", headers: { authorization: "Bearer synthetic-test-token", "content-type": "application/json" }, body: JSON.stringify(batch) });
    try {
      auth.mockResolvedValue({ keyId: "synthetic", scopes: new Set(["pje:discover"]), ctx: A.ctx });
      expect((await POST(request(), { params: Promise.resolve({}) })).status).toBe(403);
      auth.mockResolvedValue({ keyId: "synthetic", scopes: new Set(["portal:import"]), ctx: { ...A.ctx, permissions: new Set() } });
      expect((await POST(request(), { params: Promise.resolve({}) })).status).toBe(403);
      auth.mockResolvedValue({ keyId: "synthetic", scopes: new Set(["portal:import"]), ctx: A.ctx });
      const response = await POST(request(), { params: Promise.resolve({}) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ created: 0, known: 1 });
    } finally { auth.mockRestore(); }
  });
});
