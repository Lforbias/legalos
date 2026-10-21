import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, totpCode, totpStep, verifyTotp } from "@/lib/security/totp";

describe("TOTP (RFC 6238)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("base32 faz ida e volta", () => {
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("vetor oficial da RFC: T=59s → 287082 (6 dígitos)", () => {
    expect(totpCode(secret, totpStep(59_000))).toBe("287082");
    expect(totpCode(secret, totpStep(1111111109_000))).toBe("081804");
  });
  it("aceita ±1 passo e recusa fora da janela ou formato inválido", () => {
    const now = 1_700_000_000_000;
    const cur = totpStep(now);
    expect(verifyTotp(secret, totpCode(secret, cur), now)).toBe(cur);
    expect(verifyTotp(secret, totpCode(secret, cur - 1), now)).toBe(cur - 1);
    expect(verifyTotp(secret, totpCode(secret, cur + 2), now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
  });
  it("cifra AES-GCM: ida e volta; chave errada ou adulteração falham", () => {
    const key = Buffer.alloc(32, 7);
    const enc = encryptSecret("SEGREDO", key);
    expect(enc).not.toContain("SEGREDO");
    expect(decryptSecret(enc, key)).toBe("SEGREDO");
    expect(() => decryptSecret(enc, Buffer.alloc(32, 8))).toThrow();
    expect(() => decryptSecret(enc.slice(0, -4) + "AAAA", key)).toThrow();
  });
});
