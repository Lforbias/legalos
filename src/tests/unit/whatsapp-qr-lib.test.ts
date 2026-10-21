import { describe, expect, it } from "vitest";
import { chatFromKey, statusFromProto } from "@/lib/whatsapp/qr/jid";
import { makeAuthState } from "@/lib/whatsapp/qr/auth-state";
import { jidOfChat, type AuthKv } from "@/lib/whatsapp/qr/types";
import { formatWaId } from "@/lib/whatsapp/phone";

describe("QR: identificadores", () => {
  it("conversa individual a partir da chave; ignora grupos, status e canais", () => {
    expect(chatFromKey({ remoteJid: "5571999998888@s.whatsapp.net" })).toBe("5571999998888");
    expect(chatFromKey({ remoteJid: "5571999998888:12@s.whatsapp.net" })).toBe("5571999998888");
    expect(chatFromKey({ remoteJid: "123456@lid", remoteJidAlt: "5571999998888@s.whatsapp.net" })).toBe("5571999998888");
    expect(chatFromKey({ remoteJid: "123456@lid" })).toBe("lid:123456");
    expect(chatFromKey({ remoteJid: "1203630@g.us" })).toBeNull();
    expect(chatFromKey({ remoteJid: "status@broadcast" })).toBeNull();
    expect(chatFromKey({ remoteJid: "1@newsletter" })).toBeNull();
    expect(chatFromKey({})).toBeNull();
  });
  it("ida e volta do JID e formatação", () => {
    expect(jidOfChat("5571999998888")).toBe("5571999998888@s.whatsapp.net");
    expect(jidOfChat("lid:123456")).toBe("123456@lid");
    expect(formatWaId("lid:998877665544")).toContain("5544");
    expect(formatWaId("lid:998877665544")).not.toContain("+");
  });
  it("status do protocolo", () => {
    expect([0, 2, 3, 4, 5, 1, null].map((n) => statusFromProto(n))).toEqual(["failed", "sent", "delivered", "read", "read", null, null]);
  });
});

describe("QR: estado de autenticação no banco", () => {
  const memKv = (): AuthKv & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, get: async (k) => m.get(k) ?? null, set: async (es) => { for (const [k, v] of es) { if (v === null) m.delete(k); else m.set(k, v); } }, clear: async () => m.clear() };
  };
  const lib = {
    BufferJSON: {
      replacer: (_: string, v: unknown) => (v instanceof Buffer ? { type: "Buffer", data: v.toString("base64") } : v),
      reviver: (_: string, v: unknown) => (v && typeof v === "object" && (v as { type?: string }).type === "Buffer" ? Buffer.from((v as { data: string }).data, "base64") : v),
    },
    initAuthCreds: () => ({ fresh: true }) as never,
    proto: { Message: { AppStateSyncKeyData: { fromObject: (o: object) => o } } },
  };
  it("cria credenciais novas, grava e relê chaves (com Buffer) e apaga", async () => {
    const kv = memKv();
    const a = await makeAuthState(kv, lib);
    expect((a.state.creds as unknown as { fresh: boolean }).fresh).toBe(true);
    await a.saveCreds();
    expect(kv.m.has("creds")).toBe(true);
    await a.state.keys.set({ "pre-key": { "1": { private: Buffer.from("abc"), public: Buffer.from("def") } as never } });
    const got = await a.state.keys.get("pre-key", ["1", "2"]);
    expect(Buffer.isBuffer((got["1"] as unknown as { private: Buffer }).private)).toBe(true);
    expect((got["1"] as unknown as { private: Buffer }).private.toString()).toBe("abc");
    expect(got["2"]).toBeUndefined();
    await a.state.keys.set({ "pre-key": { "1": null as never } });
    expect((await a.state.keys.get("pre-key", ["1"]))["1"]).toBeUndefined();
    const b = await makeAuthState(kv, lib); // reabre com as credenciais salvas
    expect((b.state.creds as unknown as { fresh: boolean }).fresh).toBe(true);
  });
});
