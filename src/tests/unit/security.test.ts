import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { RateLimiter } from "@/lib/security/rate-limit";
import { safeNext } from "@/lib/security/safe-next";
import { redactForLog } from "@/lib/logging/logger";

describe("senhas", () => {
  it("gera hashes distintos (salt) e verifica corretamente", async () => {
    const a = await hashPassword("SenhaForte123");
    const b = await hashPassword("SenhaForte123");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("SenhaForte123", a)).toBe(true);
    expect(await verifyPassword("senhaforte123", a)).toBe(false);
  });

  it("rejeita formatos de hash inválidos sem lançar exceção", async () => {
    expect(await verifyPassword("x", "lixo")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });
});

describe("tokens", () => {
  it("são aleatórios, longos e o hash é determinístico e diferente do token", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(t1)).toBe(hashToken(t1));
    expect(hashToken(t1)).not.toBe(t1);
    expect(hashToken(t1)).toHaveLength(64);
  });
});

describe("rate limiter", () => {
  it("bloqueia após o limite dentro da janela e libera depois", () => {
    const rl = new RateLimiter(3, 1000);
    const t = 1_000_000;
    expect([1, 2, 3].map(() => rl.check("k", t))).toEqual([true, true, true]);
    expect(rl.check("k", t + 10)).toBe(false);
    expect(rl.check("outra", t + 10)).toBe(true);
    expect(rl.check("k", t + 1500)).toBe(true);
  });

  it("reset libera a chave", () => {
    const rl = new RateLimiter(1, 10_000);
    expect(rl.check("k", 0)).toBe(true);
    expect(rl.check("k", 1)).toBe(false);
    rl.reset("k");
    expect(rl.check("k", 2)).toBe(true);
  });
});

describe("safeNext (open redirect)", () => {
  it("aceita só caminhos internos", () => {
    expect(safeNext("/configuracoes/equipe?x=1")).toBe("/configuracoes/equipe?x=1");
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNext(bad as string | null | undefined)).toBe("/dashboard");
    }
  });
});

describe("log redaction", () => {
  it("mascara campos sensíveis em qualquer nível", () => {
    const out = redactForLog({ user: "a", password: "x", nested: { sessionToken: "t", cpf: "1", ok: 1 }, list: [{ authorization: "Bearer z" }] }) as Record<string, unknown>;
    expect(out.password).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).sessionToken).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).cpf).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect(((out.list as Record<string, unknown>[])[0] as Record<string, unknown>).authorization).toBe("[REDACTED]");
    expect(out.user).toBe("a");
  });
});
