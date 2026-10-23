import { describe, expect, it } from "vitest";
import { noticeActivityWindow, summarizeNoticeActivity } from "@/lib/notices/activity";

describe("atividade do Box", () => {
  const now = new Date("2026-10-23T02:00:00Z"); // ainda 22/10 em São Paulo
  const tz = "America/Sao_Paulo";
  const row = (source: string, externalKey: string | null, at = "2026-10-23T01:00:00Z") => ({ source, externalKey, createdAt: new Date(at) });

  it("separa capturas identificadas de histórico, API e registros manuais", () => {
    const a = summarizeNoticeActivity([
      row("IMPORTED", "djen:123"), row("IMPORTED", "mni:403:abc"),
      row("IMPORTED", null), row("IMPORTED", "api:legado"),
      row("MANUAL", null), row("PASTED", null), row("FILE", null),
    ], 7, tz, now);
    expect(a.bySource).toEqual({ imported: 4, captured: 2, otherImports: 2, manual: 3 });
    expect(a.total).toBe(7);
    expect(a.byDay.at(-1)).toEqual({ day: "2026-10-22", count: 7 });
  });

  it("usa os mesmos limites do período para totais e gráfico e recusa datas futuras", () => {
    const a = summarizeNoticeActivity([
      row("IMPORTED", "djen:antes", "2026-10-16T02:59:59Z"),
      row("IMPORTED", "djen:inicio", "2026-10-16T03:00:00Z"),
      row("IMPORTED", "mni:agora", now.toISOString()),
      row("IMPORTED", "djen:futuro", "2026-10-23T02:00:01Z"),
    ], 7, tz, now);
    expect(a.byDay).toHaveLength(7);
    expect(a.byDay[0]).toEqual({ day: "2026-10-16", count: 1 });
    expect(a.total).toBe(2);
    expect(a.bySource.captured).toBe(2);
  });

  it("respeita dias locais em mudança de horário de verão", () => {
    const w = noticeActivityWindow(2, "America/New_York", new Date("2026-11-02T04:30:00Z"));
    expect(w.since.toISOString()).toBe("2026-10-31T04:00:00.000Z");
    expect(() => noticeActivityWindow(0, tz, now)).toThrow(RangeError);
  });
});
