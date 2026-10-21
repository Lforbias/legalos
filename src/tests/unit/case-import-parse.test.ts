import { describe, expect, it } from "vitest";
import { parseNumberList } from "@/lib/case-import";
import { computeCnjCheck } from "@/lib/validation/br-documents";

const cnj = (seq: string) => `${seq}-${computeCnjCheck({ sequence: seq, year: "2024", segment: "8", court: "05", origin: "0001" })}.2024.8.05.0001`;

describe("importação em lote: leitura dos números", () => {
  it("aceita um por linha, com vírgula, com ponto e vírgula e só dígitos", () => {
    const a = cnj("0000001");
    const b = cnj("0000002");
    const plain = b.replace(/\D/g, "");
    const r = parseNumberList(`${a}\n${plain}, ${cnj("0000003")};${cnj("0000004")}`);
    expect(r.map((x) => x.status)).toEqual(["OK", "OK", "OK", "OK"]);
    expect(r[1]!.number).toBe(b);
  });
  it("marca inválidos (tamanho, letras e dígito verificador) e repetidos", () => {
    const a = cnj("0000001");
    const r = parseNumberList(`${a} ${a} 123 0000001-99.2024.8.05.0001 abc${a}`);
    expect(r.map((x) => x.status)).toEqual(["OK", "DUPLICATE", "INVALID", "INVALID", "INVALID"]);
    expect(r[3]!.message).toMatch(/verificador/);
  });
  it("texto vazio não gera itens", () => {
    expect(parseNumberList("  \n ,; ")).toEqual([]);
  });
});
