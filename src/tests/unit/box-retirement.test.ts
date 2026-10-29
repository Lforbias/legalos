import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { BOX_AVAILABLE, isBoxPath } from "@/lib/box-retirement";
import { can, type TenantContext } from "@/server/context";
import { SETTINGS_ITEMS } from "@/config/settings";
import { SPACES, MODULES, INTEGRATIONS } from "@/config/showcase";
import { drainQueue } from "@/server/robots/pje-runner";
import { runDjenAll } from "@/server/services/djen.service";
import { runMniAll } from "@/server/services/mni.service";
import { runDueSchedules } from "@/server/services/petition-queue.service";
import { enqueueDueSyncs } from "@/server/services/portal-access.service";
import { runAutosQueue } from "@/server/services/autos-queue.service";

describe("retirada provisória do Box", () => {
  it("bloqueia páginas, ações antigas e API da extensão antes da autenticação ou execução", () => {
    expect(BOX_AVAILABLE).toBe(false);
    for (const path of ["/box", "/box/conexoes", "/caixa-de-entrada/id", "/peticoes/nova", "/certificados", "/integracoes/pje", "/configuracoes/credenciais", "/processos/id/autos", "/downloads/legalos-pje.zip"]) {
      expect(proxy(new NextRequest(`https://example.test${path}`, { method: "POST" })).status).toBe(404);
    }
    for (const path of ["/api/v1/pje/discoveries", "/api/v1/notices", "/api/certificates", "/api/box/events", "/api/cron/djen", "/api/cron/mni", "/api/cron/robots", "/api/cron/petition-queue"]) {
      expect(proxy(new NextRequest(`https://example.test${path}`, { method: "POST" })).status).toBe(410);
    }
  });
  it("mantém caminhos compartilhados e permissões de Func, Chat, API e documentos", () => {
    for (const path of ["/dashboard", "/atendimento", "/integracoes", "/api/v1/tools", "/api/ready", "/documentos", "/processos/id"]) expect(isBoxPath(path)).toBe(false);
    const ctx: TenantContext = { userId: "test", organizationId: "test", membershipId: "test", roleId: "test", roleKey: "OWNER", isOwner: true, timezone: "America/Sao_Paulo", meta: {}, permissions: new Set(["inbox:read", "petitions:write", "certificates:manage", "cases:read", "whatsapp:write", "integrations:manage", "documents:write"]) };
    expect(can(ctx, "inbox:read")).toBe(false); expect(can(ctx, "petitions:write")).toBe(false); expect(can(ctx, "certificates:manage")).toBe(false);
    expect(can(ctx, "cases:read")).toBe(true); expect(can(ctx, "whatsapp:write")).toBe(true); expect(can(ctx, "integrations:manage")).toBe(true); expect(can(ctx, "documents:write")).toBe(true);
  });
  it("para capturas, protocolo e robô antes de qualquer leitura da fila ou abertura de navegador", async () => {
    const openPage = vi.fn();
    expect(await drainQueue({ openPage })).toBe(0);
    expect(openPage).not.toHaveBeenCalled();
    for (const run of [() => runDjenAll(), () => runMniAll(), () => runDueSchedules(), () => runAutosQueue(), () => enqueueDueSyncs()]) await expect(run()).rejects.toThrow("retirado temporariamente");
  });
  it("retira atalhos, apresentação comercial e agendamentos do Box", () => {
    expect(SETTINGS_ITEMS.some(item => isBoxPath(item.href))).toBe(false);
    expect(SPACES.some(s => s.name === "LegalOS Box")).toBe(false);
    expect(MODULES.some(m => m.id === "caixa")).toBe(false);
    expect(INTEGRATIONS.some(i => i.name === "DJEN" || i.name === "PJe / MNI")).toBe(false);
    const cron = fs.readFileSync("scripts/server/install-cron.sh", "utf8");
    for (const job of ["djen", "mni", "robots", "petition-queue", "autos-queue", "monitoring"]) expect(cron).not.toContain(`cron-call.sh ${job}`);
    expect(cron).toContain("cron-call.sh chat-sla"); expect(cron).toContain("backup-docker.sh");
  });
});
