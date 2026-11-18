import { describe, expect, it } from "vitest";
import { LOGIN_INTRO_KEY, LOGIN_INTRO_TTL_MS, consumeLoginIntro, firstName, greetingFor, markLoginIntro } from "@/modules/auth/login-intro";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe("animação de entrada após o login", () => {
  it("toca uma única vez depois do login", () => {
    const s = memoryStorage();
    markLoginIntro(s, 1_000);
    expect(consumeLoginIntro(s, 1_500)).toBe(true);
    expect(consumeLoginIntro(s, 1_600)).toBe(false);
    expect(s.data.has(LOGIN_INTRO_KEY)).toBe(false);
  });

  it("não toca sem login recente nem com carimbo velho ou inválido", () => {
    const s = memoryStorage();
    expect(consumeLoginIntro(s, 0)).toBe(false);
    markLoginIntro(s, 1_000);
    expect(consumeLoginIntro(s, 1_000 + LOGIN_INTRO_TTL_MS + 1)).toBe(false);
    expect(s.data.has(LOGIN_INTRO_KEY)).toBe(false);
    s.setItem(LOGIN_INTRO_KEY, "abc");
    expect(consumeLoginIntro(s, 0)).toBe(false);
  });

  it("segue sem animação quando o armazenamento falha", () => {
    const broken = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => undefined,
    };
    expect(() => markLoginIntro(broken)).not.toThrow();
    expect(consumeLoginIntro(broken)).toBe(false);
    expect(consumeLoginIntro(null)).toBe(false);
  });

  it("saúda pelo horário e pelo primeiro nome", () => {
    expect(greetingFor(8)).toBe("Bom dia");
    expect(greetingFor(14)).toBe("Boa tarde");
    expect(greetingFor(21)).toBe("Boa noite");
    expect(greetingFor(2)).toBe("Boa noite");
    expect(firstName("  Ana Maria Souza ")).toBe("Ana");
    expect(firstName("")).toBe("");
  });
});
