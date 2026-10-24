import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { __setAiProviderForTests } from "@/lib/ai/provider";
import { ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { officeAiProvider } from "@/server/services/office-ai-provider.service";
import { getRuteSettings, setAssistantProvider } from "@/server/services/rute-settings.service";
import { aiStatus } from "@/server/services/ai.service";
import { addMember, makeOrgWithOwner } from "./helpers";

beforeEach(() => { vi.stubEnv("MFA_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64")); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); __setAiProviderForTests(undefined); });
describe("Configuração de IA por escritório", () => {
  it("Gemini salvo serve também às ferramentas de IA, sem expor a chave e sem alcançar outro escritório", async () => {
    const a = await makeOrgWithOwner("gemini-config");
    const b = await makeOrgWithOwner("gemini-isolado");
    const secret = "AQ.chave-ficticia-de-teste-123456789012345";
    await setAssistantProvider(a.ctx, { provider: "GEMINI", apiKey: secret });
    const settings = await getRuteSettings(a.ctx);
    expect(settings.hasOfficeKey).toBe(true);
    expect(JSON.stringify(settings)).not.toContain(secret);
    expect((await getRuteSettings(b.ctx)).hasOfficeKey).toBe(false);
    expect((await aiStatus(a.ctx)).providerConfigured).toBe(true);
    const fetchMock = vi.fn(async (_url, init) => {
      expect(new Headers(init.headers).get("x-goog-api-key")).toBe(secret);
      expect(String(init.body)).not.toContain("cliente");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = await officeAiProvider(a.org.id);
    expect(provider?.name).toBe("gemini");
    expect((await provider!.complete({ system: "Teste", messages: [{ role: "user", content: "OK" }], maxTokens: 64 })).text).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await setAssistantProvider(a.ctx, { provider: "GEMINI", model: "modelo-teste" });
    expect((await getRuteSettings(a.ctx)).hasOfficeKey).toBe(true);
    const raw = await db.ruteSettings.findUniqueOrThrow({ where: { organizationId: a.org.id } });
    expect(raw.apiKeyEnc).not.toContain(secret);
    await expect(setAssistantProvider(a.ctx, { provider: "GEMINI", apiKey: secret, clearKey: true })).rejects.toBeInstanceOf(ValidationError);
    await setAssistantProvider(a.ctx, { provider: "OPENAI" });
    expect((await getRuteSettings(a.ctx)).hasOfficeKey).toBe(false);
  });
  it("configuração exige permissão para administrar integrações", async () => {
    const a = await makeOrgWithOwner("gemini-permissao");
    const lawyer = await addMember(a.org.id, "LAWYER");
    await expect(setAssistantProvider(lawyer.ctx, { provider: "GEMINI", apiKey: "chave-ficticia-123456789012345" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
