import { describe, expect, it } from "vitest";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { contentHash, parseNoticeText } from "@/lib/notices/parse";

const cnj = (() => {
  const p = { sequence: "0001234", year: "2024", segment: "8", court: "26", origin: "0100" };
  return `${p.sequence}-${computeCnjCheck(p)}.${p.year}.${p.segment}.${p.court}.${p.origin}`;
})();

describe("análise de texto de intimação", () => {
  it("extrai número CNJ válido, data de publicação, tipo e prazo", () => {
    const r = parseNoticeText(`TRIBUNAL DE JUSTIÇA DO ESTADO DE SÃO PAULO\nProcesso nº ${cnj}\nData da publicação: 12/03/2030\nIntimação: fica a parte intimada para manifestar-se no prazo de 15 (quinze) dias úteis.`);
    expect(r.caseNumber).toBe(cnj);
    expect(r.publishedAt).toBe("2030-03-12");
    expect(r.kind).toBe("INTIMACAO");
    expect(r.suggestedDays).toBe(15);
    expect(r.suggestedCount).toBe("BUSINESS");
    expect(r.court).toContain("TRIBUNAL");
  });

  it("ignora números com dígito verificador inválido e datas impossíveis", () => {
    const r = parseNoticeText("Processo 0001234-00.2024.8.26.0100. Publicado em 31/02/2030.");
    expect(r.caseNumber).toBeNull();
    expect(r.publishedAt).toBeNull();
  });

  it("reconhece o número sem máscara (20 dígitos)", () => {
    expect(parseNoticeText(`Autos ${cnj.replace(/\D/g, "")} em andamento`).caseNumber).toBe(cnj);
  });

  it("classifica citação, sentença, decisão e despacho", () => {
    expect(parseNoticeText("Cite-se o réu para contestar").kind).toBe("CITACAO");
    expect(parseNoticeText("Julgo procedente o pedido. Sentença").kind).toBe("SENTENCA");
    expect(parseNoticeText("Decisão interlocutória: defiro a tutela").kind).toBe("DECISAO");
    expect(parseNoticeText("Despacho: vista ao autor").kind).toBe("DESPACHO");
    expect(parseNoticeText("texto qualquer sem classificação").kind).toBeNull();
  });

  it("não sugere prazo quando o texto não menciona", () => {
    const r = parseNoticeText("Intimação para ciência da decisão.");
    expect(r.suggestedDays).toBeNull();
    expect(r.suggestedCount).toBeNull();
  });

  it("hash ignora acentos, caixa e espaços", () => {
    expect(contentHash("Intimação  para  MANIFESTAÇÃO")).toBe(contentHash("intimacao para manifestacao"));
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});
