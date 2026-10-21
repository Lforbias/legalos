import { describe, expect, it } from "vitest";
import { isOutsideHours } from "@/lib/whatsapp/hours";
import { normalizeWaId, phoneCandidates, formatWaId } from "@/lib/whatsapp/phone";
import { parseWebhook } from "@/lib/whatsapp/parse";
import { signBody, verifySignature } from "@/lib/whatsapp/signature";
import { isWindowOpen } from "@/lib/whatsapp/constants";
import { checkProductionEnv } from "@/lib/config/prod-check";

describe("telefones", () => {
  it("normaliza para wa_id com 55", () => {
    expect(normalizeWaId("(71) 99999-8888")).toBe("5571999998888");
    expect(normalizeWaId("+55 71 3333-4444")).toBe("557133334444");
    expect(normalizeWaId("123")).toBeNull();
  });
  it("candidatos tentam com e sem o nono dígito", () => {
    const a = phoneCandidates("5571999998888");
    expect(a).toContain("557199998888");
    expect(a).toContain("71999998888");
    expect(a).toContain("7199998888");
    const b = phoneCandidates("557199998888");
    expect(b).toContain("5571999998888");
    expect(phoneCandidates("5571333344445".slice(0, 12))).not.toContain("55719333344");
  });
  it("formata", () => {
    expect(formatWaId("5571999998888")).toBe("+55 (71) 99999-8888");
  });
});

describe("assinatura do webhook", () => {
  it("aceita a correta e recusa adulterada, ausente ou malformada", () => {
    const body = '{"a":1}';
    const sig = signBody(body, "s3gredo");
    expect(verifySignature(body, sig, "s3gredo")).toBe(true);
    expect(verifySignature(body + " ", sig, "s3gredo")).toBe(false);
    expect(verifySignature(body, sig, "outro")).toBe(false);
    expect(verifySignature(body, null, "s3gredo")).toBe(false);
    expect(verifySignature(body, "sha256=zz", "s3gredo")).toBe(false);
    expect(verifySignature(body, sig, "")).toBe(false);
  });
});

describe("leitura do webhook", () => {
  const wrap = (value: unknown) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value }] }] });
  it("lê texto, mídia e status; ignora o que não conhece", () => {
    const r = parseWebhook(wrap({
      metadata: { phone_number_id: "111" },
      contacts: [{ wa_id: "5571999998888", profile: { name: "Maria" } }],
      messages: [
        { id: "m1", from: "5571999998888", timestamp: "1700000000", type: "text", text: { body: "oi" } },
        { id: "m2", from: "5571999998888", type: "image", image: { id: "img1", mime_type: "image/jpeg", caption: "foto" } },
        { id: "m3", from: "5571999998888", type: "reaction", reaction: {} },
        { from: "x", type: "text" },
      ],
      statuses: [{ id: "w1", status: "read", recipient_id: "5571999998888" }, { id: "w2", status: "banana" }],
    }));
    expect(r).toHaveLength(1);
    expect(r[0]!.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(r[0]!.messages[0]!.contactName).toBe("Maria");
    expect(r[0]!.messages[1]!.media?.id).toBe("img1");
    expect(r[0]!.messages[1]!.text).toBe("foto");
    expect(r[0]!.statuses.map((s) => s.status)).toEqual(["read"]);
  });
  it("lixo não quebra", () => {
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ object: "page" })).toEqual([]);
    expect(parseWebhook(wrap({ metadata: {} }))).toEqual([]);
  });
});

describe("expediente e janela", () => {
  it("fora do expediente (fuso de São Paulo)", () => {
    const days = [1, 2, 3, 4, 5];
    expect(isOutsideHours(new Date("2026-10-19T15:00:00Z"), "America/Sao_Paulo", "09:00", "18:00", days)).toBe(false); // seg 12:00
    expect(isOutsideHours(new Date("2026-10-19T22:00:00Z"), "America/Sao_Paulo", "09:00", "18:00", days)).toBe(true); // seg 19:00
    expect(isOutsideHours(new Date("2026-10-19T11:00:00Z"), "America/Sao_Paulo", "09:00", "18:00", days)).toBe(true); // seg 08:00
    expect(isOutsideHours(new Date("2026-10-17T15:00:00Z"), "America/Sao_Paulo", "09:00", "18:00", days)).toBe(true); // sábado
  });
  it("janela de 24 horas", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(isWindowOpen(new Date("2026-10-18T13:00:00Z"), now)).toBe(true);
    expect(isWindowOpen(new Date("2026-10-18T11:00:00Z"), now)).toBe(false);
    expect(isWindowOpen(null, now)).toBe(false);
  });
});

describe("check:prod do WhatsApp", () => {
  const base = { NODE_ENV: "production" } as Record<string, string>;
  const find = (env: Record<string, string>, id: string) => checkProductionEnv({ ...base, ...env }).find((i) => i.code === id);
  it("avisa quando desligado e erra quando incompleto", () => {
    expect(find({}, "WHATSAPP_OFF")).toBeTruthy();
    expect(find({ WHATSAPP_APP_SECRET: "x" }, "WHATSAPP_VERIFY")?.level).toBe("error");
    expect(find({ WHATSAPP_VERIFY_TOKEN: "a".repeat(16) }, "WHATSAPP_SECRET")?.level).toBe("error");
  });
});
