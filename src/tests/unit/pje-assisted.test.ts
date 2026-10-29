import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { parseCourtOtpSecret } from "@/lib/pje/otp";
import { base32Encode, totpCode, totpStep } from "@/lib/security/totp";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { courtOrigin, normalizedCnj, API_ORIGIN } from "../../../extensions/legalos-pje/common.mjs";
const secret = base32Encode(Buffer.from("12345678901234567890"));
const parts = { sequence: "0000001", year: "2026", segment: "8", court: "05", origin: "0001" };
const cnj = `${parts.sequence}-${computeCnjCheck(parts)}.2026.8.05.0001`;

describe("PJe assistido: autenticador e extensão", () => {
  it("importa chave/otpauth e reproduz o vetor oficial de OTP sem inventar uma chave", () => {
    expect(parseCourtOtpSecret(`otpauth://totp/PJe?secret=${secret}&issuer=PJe`)).toBe(secret);
    expect(parseCourtOtpSecret(secret.toLowerCase())).toBe(secret);
    expect(totpCode(parseCourtOtpSecret(secret), totpStep(59_000))).toBe("287082");
  });
  it("recusa parâmetros TOTP não suportados, HOTP e configurações ambíguas", () => {
    for (const suffix of ["&algorithm=SHA256", "&digits=8", "&period=60", `&secret=${secret}`]) expect(() => parseCourtOtpSecret(`otpauth://totp/pje?secret=${secret}${suffix}`)).toThrow();
    expect(() => parseCourtOtpSecret(`otpauth://hotp/pje?secret=${secret}`)).toThrow();
    expect(() => parseCourtOtpSecret("chave-inventada")).toThrow();
  });
  it("restringe a origem ao tribunal HTTPS e confere dígitos verificadores no navegador", () => {
    expect(courtOrigin("https://pje.tjba.jus.br/pje/Painel.seam?token=nao-copiar")).toBe("https://pje.tjba.jus.br");
    for (const url of ["https://tjba.jus.br.evil.test", "http://pje.tjba.jus.br", "https://pje.tjba.jus.br:8443", "https://user:pass@pje.tjba.jus.br"]) expect(courtOrigin(url)).toBeNull();
    expect(normalizedCnj(cnj.replace(/\D/g, ""))).toBe(cnj);
    expect(normalizedCnj(cnj.replace(/-\d{2}/, "-00"))).toBeNull();
  });
  it("lê só CNJs do texto visível e não captura em formulários de senha", async () => {
    const source = fs.readFileSync("extensions/legalos-pje/content.js", "utf8");
    const messages: unknown[] = []; let timer: (() => Promise<void>) | undefined;
    const context = { window: { addEventListener: vi.fn() }, document: { hidden: false, body: { innerText: `Processo ${cnj}; repetido ${cnj}. Texto que não deve sair.` }, querySelector: vi.fn(() => null), addEventListener: vi.fn() }, chrome: { runtime: { sendMessage: vi.fn(async (message: unknown) => { messages.push(message); return { ok: true }; }) } }, MutationObserver: class { observe() {} }, setTimeout: (fn: () => Promise<void>) => { timer = fn; return 1; }, clearTimeout: vi.fn() };
    vm.runInNewContext(source, context);
    await timer?.();
    expect(messages).toEqual([{ type: "CAPTURE", numbers: [cnj] }]);
    expect(JSON.stringify(messages)).not.toContain("Texto que não deve sair");
    const blocked = { ...context, window: { addEventListener: vi.fn() }, document: { ...context.document, querySelector: vi.fn(() => ({})) } };
    vm.runInNewContext(source, blocked); await timer?.();
    expect(messages).toHaveLength(1);
  });
  it("isola comandos privilegiados do content script, retém falhas e apaga fila ao trocar chave", async () => {
    const state: Record<string, unknown> = {};
    type Listener = (message: unknown, sender: unknown, respond: (value: unknown) => void) => boolean;
    let listener: Listener | undefined;
    let failPost = true;
    const postBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { method: string; body?: string }) => {
      if (init.method === "POST") { postBodies.push(init.body ?? ""); return { ok: !failPost, status: failPost ? 503 : 200, json: async () => ({ received: 1 }) }; }
      return { ok: true, status: 200, json: async () => ({ organizationName: "Escritório teste" }) };
    });
    const chrome = { storage: { local: { setAccessLevel: vi.fn(async () => {}), get: vi.fn(async () => structuredClone(state)), set: vi.fn(async (v: Record<string, unknown>) => { Object.assign(state, v); }), remove: vi.fn(async (keys: string[]) => { keys.forEach(key => delete state[key]); }) } }, runtime: { getURL: () => "chrome-extension://fixture/", onMessage: { addListener: (fn: Listener) => { listener = fn; } } }, alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } }, scripting: {}, permissions: { contains: vi.fn(async () => true) } };
    const source = fs.readFileSync("extensions/legalos-pje/background.mjs", "utf8").replace(/^import .*common\.mjs.*$/m, "");
    vm.runInNewContext(source, { chrome, fetch: fetchMock, crypto: webcrypto, AbortSignal, API_ORIGIN, courtOrigin, normalizedCnj, structuredClone, URL, console });
    const popup = { url: "chrome-extension://fixture/popup.html" };
    const page = { url: "https://pje.tjba.jus.br/pje/painel", tab: { id: 1 }, frameId: 0 };
    const send = (message: unknown, sender: unknown = popup) => new Promise<unknown>(resolve => listener!(message, sender, resolve));
    expect(await send({ type: "CONNECT", token: `lgos_12345678_${"A".repeat(43)}` }, page)).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await send({ type: "CONNECT", token: `lgos_12345678_${"A".repeat(43)}` })).toMatchObject({ ok: true });
    state.origins = ["https://pje.tjba.jus.br"];
    expect(await send({ type: "CAPTURE", numbers: [cnj] }, page)).toMatchObject({ ok: true });
    expect(await send({ type: "CAPTURE", numbers: [cnj] }, page)).toMatchObject({ ok: true });
    expect(state.queue).toHaveLength(1);
    expect(await send({ type: "STATE" })).not.toHaveProperty("token");
    expect(await send({ type: "SYNC" })).toMatchObject({ ok: false });
    expect(state.queue).toHaveLength(1);
    failPost = false;
    expect(await send({ type: "SYNC" })).toMatchObject({ ok: true });
    expect(state.queue).toHaveLength(0);
    // Importing metadata is a separate, explicit permission and never a content-script command.
    expect(await send({ type: "NOTICE_CONNECT", token: `lgos_12345678_${"A".repeat(43)}` }, page)).toMatchObject({ ok: false });
    expect(await send({ type: "NOTICE_IMPORT", batch: {} }, page)).toMatchObject({ ok: false });
    expect(await send({ type: "NOTICE_CONNECT", token: `lgos_12345678_${"A".repeat(43)}` })).toMatchObject({ ok: true });
    const noticeState = await send({ type: "NOTICE_STATE" }) as { binding: string };
    expect(noticeState).not.toHaveProperty("token");
    const countBefore = fetchMock.mock.calls.length;
    expect(await send({ type: "NOTICE_IMPORT", binding: "old-connection", batch: {} })).toMatchObject({ ok: false });
    expect(fetchMock.mock.calls).toHaveLength(countBefore);
    expect(await send({ type: "NOTICE_IMPORT", binding: noticeState.binding, batch: {} })).toMatchObject({ ok: true });
    await send({ type: "NOTICE_CONNECT", token: `lgos_87654321_${"B".repeat(43)}` });
    expect(await send({ type: "NOTICE_IMPORT", binding: noticeState.binding, batch: {} })).toMatchObject({ ok: false });
    expect(JSON.parse(postBodies[0]!)).toEqual({ sourceOrigin: "https://pje.tjba.jus.br", numbers: [cnj] });
    await send({ type: "CAPTURE", numbers: [cnj] }, page);
    await send({ type: "AUTO", enabled: true });
    await send({ type: "CONNECT", token: `lgos_87654321_${"B".repeat(43)}` });
    expect(state.queue).toHaveLength(0);
    expect(state.config).toMatchObject({ auto: false });
    chrome.permissions.contains.mockResolvedValue(false);
    expect(await send({ type: "CAPTURE", numbers: [cnj] }, page)).toMatchObject({ ok: false });
    expect(state.queue).toHaveLength(0);
  });
});
