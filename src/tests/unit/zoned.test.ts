import { describe, expect, it } from "vitest";
import { utcToZoned, zonedToUtc } from "@/lib/dates/zoned";

describe("fusos horários", () => {
  it("São Paulo (UTC−3, sem horário de verão atualmente)", () => {
    expect(zonedToUtc("2026-10-17", "09:30", "America/Sao_Paulo").toISOString()).toBe("2026-10-17T12:30:00.000Z");
    expect(utcToZoned(new Date("2026-10-18T01:30:00Z"), "America/Sao_Paulo")).toEqual({ ymd: "2026-10-17", hhmm: "22:30" });
  });
  it("Nova York com horário de verão (EDT −4 em julho, EST −5 em janeiro)", () => {
    expect(zonedToUtc("2026-07-01", "12:00", "America/New_York").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedToUtc("2026-01-15", "12:00", "America/New_York").toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });
  it("ida e volta preserva data e hora", () => {
    const d = zonedToUtc("2026-03-08", "03:30", "America/New_York");
    expect(utcToZoned(d, "America/New_York")).toEqual({ ymd: "2026-03-08", hhmm: "03:30" });
  });
});
