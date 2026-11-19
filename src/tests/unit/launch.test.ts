import { describe, expect, it } from "vitest";
import { interestSchema, LAUNCH_AT, launchCountdown } from "@/lib/launch";

describe("landing de lançamento", () => {
  it("lança em 5 de janeiro de 2027, meia-noite de Brasília", () => {
    expect(LAUNCH_AT.toISOString()).toBe("2027-01-05T03:00:00.000Z");
  });

  it("conta dias, horas, minutos e segundos e para no zero", () => {
    const c = launchCountdown(new Date("2027-01-03T22:58:30-03:00"));
    expect(c).toEqual({ done: false, days: 1, hours: 1, minutes: 1, seconds: 30 });
    expect(launchCountdown(new Date("2027-02-01T00:00:00Z")).done).toBe(true);
  });

  it("valida o formulário de interesse", () => {
    const ok = interestSchema.parse({ name: " Ana ", office: "", email: "ANA@Exemplo.com.br ", whatsapp: "(11) 98888-7777", consent: true });
    expect(ok).toMatchObject({ name: "Ana", office: null, email: "ana@exemplo.com.br", whatsapp: "11988887777" });
    expect(interestSchema.safeParse({ name: "Ana", email: "ana@x.com", consent: false }).success).toBe(false);
    expect(interestSchema.safeParse({ name: "Ana", email: "não é e-mail", consent: true }).success).toBe(false);
    expect(interestSchema.safeParse({ name: "Ana", email: "ana@x.com", whatsapp: "123", consent: true }).success).toBe(false);
  });
});
