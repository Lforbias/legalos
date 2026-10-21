import { describe, expect, it } from "vitest";
import { expandSnippets, extractVariables, findUnknownVariables, longDate, renderTemplate, shortDate } from "@/lib/templates/merge";
import { textToDocx } from "@/lib/templates/docx";
import { demoAdapter } from "@/lib/petitioning/adapter";

describe("motor de mesclagem de modelos", () => {
  it("extrai campos sem repetição, tolerando espaços", () => {
    expect(extractVariables("Olá {{ cliente.nome }}, {{cliente.nome}} e {{processo.numero}}")).toEqual(["cliente.nome", "processo.numero"]);
  });

  it("detecta campos desconhecidos", () => {
    expect(findUnknownVariables("{{cliente.nome}} {{cliente.nmoe}} {{}}")).toEqual(["cliente.nmoe", ""]);
  });

  it("substitui valores e marca ausentes sem inventar dados", () => {
    const r = renderTemplate("Cliente {{cliente.nome}}, CPF {{cliente.documento}}, processo {{processo.numero}}.", { "cliente.nome": "Maria", "cliente.documento": "  " });
    expect(r.text).toBe("Cliente Maria, CPF [PREENCHER: CPF/CNPJ do cliente], processo [PREENCHER: Número do processo (CNJ)].");
    expect(r.missing).toEqual(["cliente.documento", "processo.numero"]);
  });

  it("não reinterpreta chaves dentro de valores (sem injeção de campos)", () => {
    const r = renderTemplate("{{cliente.nome}}", { "cliente.nome": "{{advogado.nome}}", "advogado.nome": "SEGREDO" });
    expect(r.text).toBe("{{advogado.nome}}");
  });

  it("autotextos: aceita só os que existem, expande uma vez e mantém os campos para mesclar depois", () => {
    const slugs = new Set(["pedidos-finais"]);
    expect(findUnknownVariables("{{autotexto.pedidos-finais}} {{autotexto.nao-existe}}", slugs)).toEqual(["autotexto.nao-existe"]);
    expect(findUnknownVariables("{{autotexto.pedidos-finais}}")).toEqual(["autotexto.pedidos-finais"]);
    const map = new Map([["pedidos-finais", "Requer a procedência para {{cliente.nome}}. {{autotexto.outro}}"]]);
    const expanded = expandSnippets("Do pedido: {{ autotexto.pedidos-finais }} / {{autotexto.sumiu}} / {{cliente.nome}}", map);
    expect(expanded).toBe("Do pedido: Requer a procedência para {{cliente.nome}}. {{autotexto.outro}} / [AUTOTEXTO NÃO ENCONTRADO: sumiu] / {{cliente.nome}}");
    const r = renderTemplate(expanded, { "cliente.nome": "Maria" });
    expect(r.text).toContain("Requer a procedência para Maria.");
    expect(r.text).toContain("[CAMPO DESCONHECIDO: autotexto.outro]"); // um autotexto não é expandido dentro de outro
  });

  it("formata datas por extenso e curta", () => {
    expect(longDate("2026-10-17")).toBe("17 de outubro de 2026");
    expect(shortDate("2026-03-05")).toBe("05/03/2026");
  });

  it("gera um .docx válido (assinatura ZIP)", async () => {
    const buf = await textToDocx("# TÍTULO\n\nParágrafo um.\nLinha dois.\n\nParágrafo dois.", "Teste");
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(buf.length).toBeGreaterThan(1000);
  });
});

describe("adaptador de peticionamento de demonstração", () => {
  it("é marcado como demonstração e devolve protocolo e recibo explicitamente simulados", async () => {
    expect(demoAdapter.isDemo).toBe(true);
    const r = await demoAdapter.submit({ petitionId: "x", caseNumber: null, court: null, title: "Contestação", document: { fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 10, sha256: "abcdef1234567890" }, attachments: [{ fileName: "proc.pdf", mimeType: "application/pdf", sizeBytes: 5, sha256: "00", classification: "PROCURACAO" }] });
    expect(r.protocol.startsWith("DEMO-")).toBe(true);
    expect(r.receipt).toContain("NENHUM PROTOCOLO REAL");
    expect(r.receipt).toContain("[PROCURACAO] proc.pdf");
  });
});
