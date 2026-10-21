import { describe, expect, it } from "vitest";
import { DJEN_PAGE_SIZE, DjenError, fetchDjen, parseDjenItem } from "@/lib/djen/client";
import { djenItem, djenPage } from "../fixtures/djen-samples";

describe("DJEN — parser e cliente", () => {
  it("converte item válido e ignora item sem id ou sem texto", () => {
    const it = parseDjenItem(djenItem({ numero_processo: "0001234-55.2024.5.05.0001" }));
    expect(it?.id).toBe("900001");
    expect(it?.disponibilizadoEm).toBe("2026-10-15");
    expect(it?.numeroProcesso).toBe("00012345520245050001");
    expect(parseDjenItem(djenItem({ id: undefined }))).toBeNull();
    expect(parseDjenItem(djenItem({ texto: "  " }))).toBeNull();
    expect(parseDjenItem("lixo")).toBeNull();
  });
  it("reconhece cancelamento e aliases camelCase", () => {
    expect(parseDjenItem(djenItem({ ativo: false }))?.cancelada).toBe(true);
    expect(parseDjenItem({ id: "7", texto: "x", dataDisponibilizacao: "16/10/2026", numeroProcesso: "1" })?.disponibilizadoEm).toBe("2026-10-16");
  });
  it("pagina até a última página e monta a URL com os filtros", async () => {
    const urls: string[] = [];
    const full = Array.from({ length: DJEN_PAGE_SIZE }, (_, i) => djenItem({ id: i + 1 }));
    const http = async (url: string) => {
      urls.push(url);
      return { status: 200, body: urls.length === 1 ? djenPage(full, 51) : djenPage([djenItem({ id: 999 })], 51) };
    };
    const r = await fetchDjen({ numeroOab: "12345", ufOab: "BA", inicio: "2026-10-01", fim: "2026-10-17" }, http, { pauseMs: 0 });
    expect(r.items).toHaveLength(51);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("numeroOab=12345");
    expect(urls[0]).toContain("ufOab=BA");
    expect(urls[1]).toContain("pagina=2");
  });
  it("repete em 5xx e depois desiste; 403 explica o bloqueio; JSON inválido falha", async () => {
    let n = 0;
    const flaky = async () => (++n < 3 ? { status: 500, body: "" } : { status: 200, body: djenPage([]) });
    expect((await fetchDjen({ numeroOab: "1", ufOab: "BA", inicio: "a", fim: "b" }, flaky, { pauseMs: 0 })).items).toHaveLength(0);
    await expect(fetchDjen({ numeroOab: "1", ufOab: "BA", inicio: "a", fim: "b" }, async () => ({ status: 500, body: "" }), { pauseMs: 0, retries: 1 })).rejects.toThrow(/instável/);
    await expect(fetchDjen({ numeroOab: "1", ufOab: "BA", inicio: "a", fim: "b" }, async () => ({ status: 403, body: "" }), { pauseMs: 0 })).rejects.toThrow(/Brasil/);
    await expect(fetchDjen({ numeroOab: "1", ufOab: "BA", inicio: "a", fim: "b" }, async () => ({ status: 200, body: "<html>" }), { pauseMs: 0 })).rejects.toBeInstanceOf(DjenError);
    await expect(fetchDjen({ numeroOab: "1", ufOab: "BA", inicio: "a", fim: "b" }, async () => ({ status: 200, body: "{}" }), { pauseMs: 0 })).rejects.toThrow(/sem lista/);
  });
});
