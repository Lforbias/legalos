import { describe, expect, it } from "vitest";
import { calculateDeadline, dayStatus, isRecess, nationalHolidays } from "@/lib/deadlines/calculator";
import { addDays, diffDays, isYmd, todayYmd, weekday } from "@/lib/dates/ymd";

describe("datas YMD", () => {
  it("valida, soma dias e calcula dia da semana", () => {
    expect(isYmd("2026-02-29")).toBe(false);
    expect(isYmd("2026-10-17")).toBe(true);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekday("2026-10-17")).toBe(6); // sábado
    expect(diffDays("2026-10-20", "2026-10-17")).toBe(3);
  });
  it("calcula 'hoje' no fuso do escritório", () => {
    const instant = new Date("2026-10-18T01:30:00Z"); // ainda dia 17 em São Paulo
    expect(todayYmd("America/Sao_Paulo", instant)).toBe("2026-10-17");
    expect(todayYmd("UTC", instant)).toBe("2026-10-18");
  });
});

describe("feriados nacionais e recesso", () => {
  it("calcula Sexta-feira Santa a partir da Páscoa", () => {
    expect(nationalHolidays(2026).get("2026-04-03")).toBe("Sexta-feira Santa");
    expect(nationalHolidays(2025).get("2025-04-18")).toBe("Sexta-feira Santa");
    expect(nationalHolidays(2024).get("2024-03-29")).toBe("Sexta-feira Santa");
  });
  it("Consciência Negra é nacional somente a partir de 2024", () => {
    expect(nationalHolidays(2023).has("2023-11-20")).toBe(false);
    expect(nationalHolidays(2026).has("2026-11-20")).toBe(true);
  });
  it("recesso de 20/12 a 20/01", () => {
    expect(isRecess("2026-12-19")).toBe(false);
    expect(isRecess("2026-12-20")).toBe(true);
    expect(isRecess("2027-01-20")).toBe(true);
    expect(isRecess("2027-01-21")).toBe(false);
  });
  it("dia útil comum e fins de semana", () => {
    expect(dayStatus("2026-10-19", { applyRecess: true }).business).toBe(true); // segunda
    expect(dayStatus("2026-10-17", { applyRecess: true }).reason).toBe("sábado");
  });
});

describe("calculadora de prazos", () => {
  it("15 dias úteis sem feriados no meio: começa no dia seguinte, não conta fins de semana", () => {
    // ciência na segunda 2026-10-05; 15 dias úteis → 2026-10-26 (12/10 é feriado, pulado)
    const r = calculateDeadline({ startDate: "2026-10-05", days: 15, countType: "BUSINESS" });
    expect(r.dueDate).toBe("2026-10-27");
    expect(r.skipped.some((s) => s.date === "2026-10-12")).toBe(true);
    expect(r.note).toContain("Requer validação humana");
  });
  it("não conta o dia do início e pula o fim de semana seguinte", () => {
    // sexta 2026-10-16, 1 dia útil → segunda 2026-10-19
    expect(calculateDeadline({ startDate: "2026-10-16", days: 1, countType: "BUSINESS" }).dueDate).toBe("2026-10-19");
  });
  it("suspende a contagem entre 20/12 e 20/01", () => {
    // ciência 2026-12-18 (sexta), 5 dias úteis: 18→ conta 21..? 21-31/12 e 01..20/01 suspensos → 21/01 (qua) é o 1º dia útil
    const r = calculateDeadline({ startDate: "2026-12-18", days: 5, countType: "BUSINESS" });
    // 1º dia útil após o recesso: 21/01/2027 (quinta); 5º dia útil = 27/01/2027 (quarta)
    expect(r.dueDate).toBe("2027-01-27");
  });
  it("dias corridos: prorroga vencimento em dia sem expediente", () => {
    // 2026-10-05 + 10 corridos = 2026-10-15 (quinta, útil)
    expect(calculateDeadline({ startDate: "2026-10-05", days: 10, countType: "CALENDAR" }).dueDate).toBe("2026-10-15");
    // 2026-10-05 + 12 = 2026-10-17 (sábado) → segunda 2026-10-19
    const r = calculateDeadline({ startDate: "2026-10-05", days: 12, countType: "CALENDAR" });
    expect(r.dueDate).toBe("2026-10-19");
    expect(r.skipped.length).toBe(2);
  });
  it("rejeita quantidade de dias inválida", () => {
    expect(() => calculateDeadline({ startDate: "2026-10-05", days: 0, countType: "BUSINESS" })).toThrow(RangeError);
    expect(() => calculateDeadline({ startDate: "2026-10-05", days: 1.5, countType: "BUSINESS" })).toThrow(RangeError);
  });
});
