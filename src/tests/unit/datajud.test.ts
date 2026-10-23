import { describe, expect, it } from "vitest";
import { datajudAlias, movementKey, parseDatajudResponse } from "@/lib/datajud/client";
import { computeCnjCheck } from "@/lib/validation/br-documents";

const cnj = (segment: string, court: string) => {
  const p = { sequence: "0001234", year: "2024", segment, court, origin: "0001" };
  return `${p.sequence}-${computeCnjCheck(p)}.${p.year}.${p.segment}.${p.court}.${p.origin}`;
};

describe("DataJud: alias do tribunal", () => {
  it("mapeia ramos e tribunais", () => {
    expect(datajudAlias(cnj("8", "26"))).toBe("tjsp");
    expect(datajudAlias(cnj("8", "07"))).toBe("tjdft");
    expect(datajudAlias(cnj("4", "03"))).toBe("trf3");
    expect(datajudAlias(cnj("5", "02"))).toBe("trt2");
    expect(datajudAlias(cnj("5", "00"))).toBe("tst");
    expect(datajudAlias(cnj("3", "00"))).toBe("stj");
    expect(datajudAlias(cnj("6", "26"))).toBe("tre-sp");
    expect(datajudAlias(cnj("9", "13"))).toBeNull();
    expect(datajudAlias("lixo")).toBeNull();
  });
});

describe("DataJud: interpretação da resposta", () => {
  it("processo não encontrado", () => {
    expect(parseDatajudResponse("tjsp", { hits: { hits: [] } }).found).toBe(false);
  });
  it("extrai movimentos válidos e ignora os incompletos", () => {
    const r = parseDatajudResponse("tjsp", {
      hits: { hits: [{ _source: { classe: { nome: "Procedimento Comum" }, orgaoJulgador: { nome: "1ª Vara" }, grau: "G1", assuntos: [{ nome: "Cobrança" }], dataAjuizamento: "2024-03-01T00:00:00.000Z", movimentos: [{ codigo: 26, nome: "Distribuição", dataHora: "2024-03-02T10:00:00.000Z", complementosTabelados: [{ nome: "sorteio" }] }, { nome: "Sem data" }, { dataHora: "2024-01-01T00:00:00Z" }] } }] },
    });
    expect(r.found).toBe(true);
    expect(r.classe).toBe("Procedimento Comum");
    expect(r.movements).toHaveLength(1);
    expect(r.movements[0]!.complements).toEqual(["sorteio"]);
    expect(movementKey(r.movements[0]!)).toBe(movementKey({ ...r.movements[0]! }));
  });
});

// O teste de conexão usa uma consulta vazia e nunca precisa ler processos.
describe("DataJud: teste de autenticação", () => {
  it("envia cabeçalho correto e recusa autenticação inválida", async () => {
    const { vi } = await import("vitest");
    const { testDatajudKey } = await import("@/lib/datajud/client");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hits: { hits: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await testDatajudKey("chave-ficticia");
      const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(options.headers).toMatchObject({ authorization: "APIKey chave-ficticia" });
      expect(JSON.parse(options.body as string)).toEqual({ size: 0, query: { match_none: {} } });
      fetchMock.mockResolvedValue(new Response("", { status: 401 }));
      await expect(testDatajudKey("chave-ficticia")).rejects.toThrow(/recusou/);
    } finally { vi.unstubAllGlobals(); }
  });
});
