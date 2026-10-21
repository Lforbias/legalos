import { describe, expect, it } from "vitest";
import { isPrivateAddress, assertEndpointUrl, postSoap } from "@/lib/mni/transport";
import { listTribunals, jtrOfCnj } from "@/lib/mni/tribunals";
import { buildConsultarAvisosPendentes, buildConsultarProcesso, MniError, parseAvisosPendentes, parseConsultarProcesso, parseMniDate } from "@/lib/mni/xml";
import { avisosXml, faultXml, processoXml, semSucessoXml } from "../fixtures/mni-samples";

const CNJ = "00012342420245050001";

describe("MNI: montagem e leitura de XML", () => {
  it("escapa caracteres especiais e não vaza nada além do necessário", () => {
    const x = buildConsultarAvisosPendentes({ document: "12345678909", password: 'a<b>&"c' });
    expect(x).toContain("a&lt;b&gt;&amp;&quot;c");
    expect(x).toContain("<tns:consultarAvisosPendentes>");
    const p = buildConsultarProcesso({ document: "1", password: "2" }, CNJ);
    expect(p).toContain(`<numeroProcesso>${CNJ}</numeroProcesso>`);
    expect(p).toContain("<incluirDocumentos>false</incluirDocumentos>");
  });
  it("lê avisos pendentes (tipo, data, processo)", () => {
    const a = parseAvisosPendentes(avisosXml(CNJ));
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ idAviso: "900001", tipo: "INTIMACAO", numeroProcesso: CNJ, classe: "7" });
    expect(a[1]!.tipo).toBe("CITACAO");
    expect(a[0]!.disponibilizadoEm?.toISOString()).toBe("2026-10-16T12:30:00.000Z");
  });
  it("lê processo e movimentos (nacional e local) com complementos", () => {
    const p = parseConsultarProcesso(processoXml(CNJ));
    expect(p.numero).toBe(CNJ);
    expect(p.orgao).toBe("1ª Vara do Trabalho");
    expect(p.movimentos).toHaveLength(2);
    expect(p.movimentos[0]).toMatchObject({ id: "1", codigoNacional: "26", complementos: ["sorteio"] });
    expect(p.movimentos[1]).toMatchObject({ descricaoLocal: "Juntada de petição", codigoNacional: "193" });
  });
  it("Fault e sucesso=false viram erro legível; XML inválido também", () => {
    expect(() => parseAvisosPendentes(faultXml)).toThrow(/Credenciais inválidas/);
    expect(() => parseConsultarProcesso(semSucessoXml)).toThrow(/Processo não encontrado/);
    expect(() => parseConsultarProcesso("<html>nope</html>")).toThrow(MniError);
  });
  it("datas do MNI", () => {
    expect(parseMniDate("20240302100000")?.toISOString()).toBe("2024-03-02T13:00:00.000Z");
    expect(parseMniDate("20240302")?.toISOString()).toBe("2024-03-02T03:00:00.000Z");
    expect(parseMniDate("lixo")).toBeNull();
    expect(parseMniDate(null)).toBeNull();
  });
});

describe("MNI: tribunais e proteção SSRF", () => {
  it("lista tribunais e extrai J.TR do CNJ", () => {
    const t = listTribunals();
    expect(t.find((x) => x.jtr === "5.05")?.alias).toBe("trt5");
    expect(t.find((x) => x.jtr === "4.01")?.alias).toBe("trf1");
    expect(t.find((x) => x.jtr === "8.05")?.alias).toBe("tjba");
    expect(jtrOfCnj("0001234-24.2024.5.05.0001")).toBe("5.05");
    expect(jtrOfCnj("x")).toBeNull();
  });
  it("bloqueia endereços internos", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "0.0.0.0"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["200.1.2.3", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });
  it("em produção só aceita https com nome de domínio (não IP, localhost ou interno)", () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      expect(() => assertEndpointUrl("https://pje.trt5.jus.br/primeirograu/intercomunicacao")).not.toThrow();
      for (const bad of ["http://pje.trt5.jus.br/x", "https://127.0.0.1/x", "https://localhost/x", "https://servidor/x", "https://x.internal/x", "https://user:pw@pje.trt5.jus.br/x", "ftp://a.b.c/x", "lixo"]) expect(() => assertEndpointUrl(bad)).toThrow(MniError);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    }
  });
  it("transporte em produção recusa host que resolve para rede interna", async () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      await expect(postSoap("https://localtest.me/x", "<a/>")).rejects.toBeInstanceOf(MniError);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    }
  });
});
