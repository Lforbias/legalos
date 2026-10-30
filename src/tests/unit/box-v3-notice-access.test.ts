import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/context";
const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: { courtNotice: { findFirst: mocks.findFirst } } }));
import { assertNoticeUsable } from "@/server/services/notice-guard";

const ctx: TenantContext = { userId: "user", organizationId: "office", membershipId: "member", roleId: "role", roleKey: "LAWYER", isOwner: false, timezone: "America/Sao_Paulo", meta: {}, permissions: new Set(["inbox:read"]) };

describe("Box V3 — acesso interno à comunicação de origem", () => {
  beforeEach(() => { vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("LEGALOS_BOX3_PREVIEW", "1"); mocks.findFirst.mockReset(); mocks.findFirst.mockResolvedValue({ id: "notice" }); });
  afterEach(() => vi.unstubAllEnvs());
  it("permite vínculo V3 autorizado, exigindo escritório e processo correspondentes", async () => {
    await assertNoticeUsable(ctx, "notice", "v3", "case");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "notice", organizationId: "office", caseId: "case", deletedAt: null }) }));
  });
  it("mantém o caminho legado bloqueado mesmo com a prévia ligada", async () => {
    await expect(assertNoticeUsable(ctx, "notice")).rejects.toThrow();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("nega antes da consulta quando não há permissão ou a prévia está desligada", async () => {
    await expect(assertNoticeUsable({ ...ctx, permissions: new Set() }, "notice", "v3")).rejects.toThrow();
    vi.stubEnv("LEGALOS_BOX3_PREVIEW", "0");
    await expect(assertNoticeUsable(ctx, "notice", "v3")).rejects.toThrow();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("nega comunicação ausente ou fora do escopo visível", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(assertNoticeUsable(ctx, "notice", "v3", "other-case")).rejects.toThrow("Intimação não encontrada");
  });
});
