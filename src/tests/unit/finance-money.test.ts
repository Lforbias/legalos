import { describe, expect, it } from "vitest";
import { addMonthsClamped, fromCents, splitInstallments, toCents } from "@/lib/finance/money";

describe("dinheiro em centavos", () => {
  it("converte sem erro de ponto flutuante", () => {
    expect(toCents("0.10")).toBe(10n);
    expect(toCents("1234.5")).toBe(123450n);
    expect(toCents("300")).toBe(30000n);
    expect(toCents("1.234")).toBeNull();
    expect(toCents("-1.00")).toBeNull();
    expect(toCents("abc")).toBeNull();
    expect(fromCents(123456n)).toBe("1234.56");
    expect(fromCents(5n)).toBe("0.05");
    expect(fromCents(-250n)).toBe("-2.50");
  });
  it("parcelas somam exatamente o total (resto nas primeiras)", () => {
    const parts = splitInstallments(10000n, 3);
    expect(parts).toEqual([3334n, 3333n, 3333n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(10000n);
    expect(splitInstallments(1n, 3)).toEqual([1n, 0n, 0n]); // o chamador impede parcela zerada
    expect(splitInstallments(9999n, 1)).toEqual([9999n]);
    expect(() => splitInstallments(100n, 0)).toThrow();
  });
  it("soma meses mantendo o dia ou o último dia do mês", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsClamped("2026-11-15", 2)).toBe("2027-01-15");
    expect(addMonthsClamped("2026-03-31", 12)).toBe("2027-03-31");
    expect(addMonthsClamped("2026-01-30", 0)).toBe("2026-01-30");
  });
});
