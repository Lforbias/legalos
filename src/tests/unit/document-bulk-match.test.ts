import { describe, expect, it } from "vitest";
import { BULK_ACCEPTED_EXTENSIONS, buildBulkIndex, cnjDigitsIn, isJunkPath, matchBulkPath, normalizeName, rejectReason, taxIdDigitsIn } from "@/lib/documents/bulk-match";
import { ALLOWED_TYPES } from "@/server/services/document.service";

const catalog = {
  cases: [
    { id: "case-1", number: "5015905-44.2022.4.03.6183", title: "Maria x INSS" },
    { id: "case-2", number: null, title: "Consultivo" },
  ],
  clients: [
    { id: "cli-maria", name: "Maria Demo Silva", document: "52998224725" },
    { id: "cli-emp", name: "Empresa Demo Ltda", document: "11222333000181" },
    { id: "cli-jose-1", name: "José Souza", document: null },
    { id: "cli-jose-2", name: "Jose  Souza", document: null },
  ],
};
const index = buildBulkIndex(catalog);

describe("envio em lote: sugestão de vínculo", () => {
  it("aceita só os formatos do upload avulso", () => {
    expect([...BULK_ACCEPTED_EXTENSIONS].sort()).toEqual(Object.keys(ALLOWED_TYPES).sort());
    expect(rejectReason("a.PDF", 10)).toBeNull();
    expect(rejectReason("a.exe", 10)).toBe("Formato .exe não aceito");
    expect(rejectReason("sem-extensao", 10)).toBe("Arquivo sem extensão");
    expect(rejectReason("a.pdf", 0)).toBe("Arquivo vazio");
    expect(rejectReason("a.pdf", 9 * 1024 * 1024)).toBe("Maior que 8 MB");
  });

  it("ignora lixo de sistema", () => {
    expect(isJunkPath("backup/__MACOSX/x.pdf")).toBe(true);
    expect(isJunkPath("backup/.DS_Store")).toBe(true);
    expect(isJunkPath("pasta/~$contrato.docx")).toBe(true);
    expect(isJunkPath("pasta/Thumbs.db")).toBe(true);
    expect(isJunkPath("pasta/contrato.docx")).toBe(false);
  });

  it("encontra CNJ com ou sem pontuação e descarta dígito verificador errado", () => {
    expect(cnjDigitsIn("Inicial 5015905-44.2022.4.03.6183.pdf")).toEqual(["50159054420224036183"]);
    expect(cnjDigitsIn("50159054420224036183_sentenca.pdf")).toEqual(["50159054420224036183"]);
    expect(cnjDigitsIn("5015905-45.2022.4.03.6183.pdf")).toEqual([]);
  });

  it("encontra CPF e CNPJ válidos", () => {
    expect(taxIdDigitsIn("RG e CPF 529.982.247-25.jpg")).toEqual(["52998224725"]);
    expect(taxIdDigitsIn("contrato 11.222.333/0001-81.pdf")).toEqual(["11222333000181"]);
    expect(taxIdDigitsIn("11222333000181")).toEqual(["11222333000181"]);
    expect(taxIdDigitsIn("111.111.111-11")).toEqual([]);
  });

  it("prioriza processo pelo CNJ, depois CPF/CNPJ, depois nome da pasta", () => {
    expect(matchBulkPath("Maria Demo Silva/5015905-44.2022.4.03.6183 - sentença.pdf", index)).toMatchObject({ owner: { kind: "case", id: "case-1" }, reason: "Número do processo no nome" });
    expect(matchBulkPath("Diversos/52998224725 - RG.jpg", index)).toMatchObject({ owner: { kind: "client", id: "cli-maria" }, reason: "CPF/CNPJ no nome" });
    expect(matchBulkPath("Clientes/MARIA DEMO SILVA/procuracao.pdf", index)).toMatchObject({ owner: { kind: "client", id: "cli-maria" }, reason: "Nome da pasta igual ao cliente" });
    expect(matchBulkPath("Clientes/Empresa Demo Ltda - Trabalhista/2024/contrato.pdf", index)).toMatchObject({ owner: { kind: "client", id: "cli-emp" }, reason: "Nome da pasta começa com o cliente" });
  });

  it("não adivinha: nome do arquivo sozinho, homônimos e nada reconhecido ficam sem vínculo", () => {
    expect(matchBulkPath("Maria Demo Silva.pdf", index).owner).toBeNull();
    expect(matchBulkPath("José Souza/rg.pdf", index)).toEqual({ owner: null, reason: "Mais de um cliente com esse nome: escolha" });
    expect(matchBulkPath("Outros/arquivo.pdf", index)).toEqual({ owner: null, reason: "Sem vínculo encontrado: escolha" });
    expect(matchBulkPath("Maria/arquivo.pdf", index).owner).toBeNull();
  });

  it("normaliza acentos, caixa e pontuação", () => {
    expect(normalizeName("  José-Souza  LTDA. ")).toBe("jose souza ltda");
  });
});
