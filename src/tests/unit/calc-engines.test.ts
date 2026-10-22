import { describe, expect, it } from "vitest";
import { calcAtrasadosJf } from "@/lib/calc/jf";
import { calcTjsp } from "@/lib/calc/tjsp";
import { calcRescisao, calcTrabalhistaAtualizacao } from "@/lib/calc/trabalhista";
import { calcPrazo } from "@/lib/calc/prazos";
import { CalcError, memorial } from "@/lib/calc/num";
import { toCsv, toXlsx } from "@/lib/calc/export";
import { TJSP_FACTORS } from "@/lib/calc/bundled-tables";

const map = (o: Record<string, string>) => new Map(Object.entries(o));
const tabela = map(TJSP_FACTORS);

describe("TJSP", () => {
  it("tabela prática: fator, 8 meses de juros de 1% e total (conferido por fora)", () => {
    const r = calcTjsp({ metodo: "TABELA_TJSP", itens: [{ descricao: "Duplicata", valor: "1000.00", vencimento: "2024-01-10" }], dataBase: "2024-08-01" }, { tabela, selic: map({}) });
    expect(r.total).toBe("1111.81");
    expect(r.sections[0]!.rows[0]![5]).toContain("8 meses (8,00%)");
  });
  it("SELIC pura: valor × SELIC acumulada do mês seguinte ao vencimento", () => {
    const r = calcTjsp({ metodo: "SELIC", itens: [{ descricao: "x", valor: "1000.00", vencimento: "2025-01-15" }], dataBase: "2025-04-01" }, { tabela: map({}), selic: map({ "2025-02": "1", "2025-03": "1.1", "2025-04": "0.9" }) });
    expect(r.total).toBe("1030.30");
  });
  it("não inventa índice: mês sem fator interrompe e lista o que falta", () => {
    expect(() => calcTjsp({ metodo: "TABELA_TJSP", itens: [{ descricao: "x", valor: "100.00", vencimento: "2015-01-10" }], dataBase: "2024-08-01" }, { tabela, selic: map({}) })).toThrowError(CalcError);
  });
  it("híbrido usa tabela até ago/2024 e SELIC depois; multa e honorários só quando pedidos", () => {
    const r = calcTjsp({ metodo: "HIBRIDO", itens: [{ descricao: "x", valor: "1000.00", vencimento: "2024-01-10" }], dataBase: "2024-10-01", multa10: true, honorariosPercent: "10" }, { tabela, selic: map({ "2024-09": "0.84", "2024-10": "0.93" }) });
    const base = 1000 * (95.912469 / 93.168579) * 1.08 * 1.0084 * 1.0093;
    expect(Number(r.summary.find(([k]) => k === "Valor atualizado")![1].replace("R$ ", "").replace(".", "").replace(",", "."))).toBeCloseTo(base, 1);
    expect(r.summary.some(([k]) => k.startsWith("Multa"))).toBe(true);
    expect(r.summary.some(([k]) => k.startsWith("Honorários 10%"))).toBe(true);
  });
});

describe("JF atrasados", () => {
  const base = { benefitType: "NORMAL" as const, rmi: "1000.00" };
  it("só SELIC desde 07/2009: fator por competência (conferido por fora)", () => {
    const r = calcAtrasadosJf({ ...base, dib: "2020-01-01", dip: "2020-04-01", dataBase: "2020-05-01" }, { inpc: map({}), reajuste: map({}), salmin: map({}), selic: map({ "2020-01": "0.38", "2020-02": "0.29", "2020-03": "0.34", "2020-04": "0.28", "2020-05": "0.24" }) }, "2026-10");
    expect(r.total).toBe("3035.56");
    expect(r.sections[1]!.rows[0]![1]).toBe("3");
  });
  it("parcela anterior a 30/06/2009: INPC + 1% desde a citação + SELIC", () => {
    const r = calcAtrasadosJf({ ...base, dib: "2009-05-01", dip: "2009-06-01", citacao: "2009-01-15", dataBase: "2009-08-01" }, { inpc: map({ "2009-05": "0.2", "2009-06": "0.1" }), reajuste: map({}), salmin: map({}), selic: map({ "2009-07": "0.5", "2009-08": "0.4" }) }, "2026-10");
    expect(r.total).toBe("1032.29");
  });
  it("sem SELIC do mês-base calcula até o anterior e avisa; sem índice no meio, recusa", () => {
    const d = { inpc: map({}), reajuste: map({}), salmin: map({}), selic: map({ "2020-01": "0.38", "2020-02": "0.29" }) };
    const r = calcAtrasadosJf({ ...base, dib: "2020-01-01", dip: "2020-02-01", dataBase: "2020-03-01" }, d, "2026-10");
    expect(r.warnings.join(" ")).toContain("ainda não");
    expect(() => calcAtrasadosJf({ ...base, dib: "2020-01-01", dip: "2020-04-01", dataBase: "2020-02-01" }, d, "2026-10")).toThrowError(CalcError);
  });
  it("reajuste anual: exige o índice de cada janeiro e o aplica", () => {
    const d = { inpc: map({}), reajuste: map({ "2021": "10" }), salmin: map({}), selic: map({ "2021-01": "0", "2021-02": "0" }) };
    const r = calcAtrasadosJf({ ...base, dib: "2020-12-01", dip: "2021-02-01", dataBase: "2021-02-01" }, { ...d, selic: map({ "2020-12": "0", "2021-01": "0", "2021-02": "0" }) }, "2026-10");
    expect(r.total).toBe("2100.00"); // dez/2020 1000 + jan/2021 1100
    expect(() => calcAtrasadosJf({ ...base, dib: "2020-12-01", dip: "2021-02-01", dataBase: "2021-02-01" }, { ...d, reajuste: map({}), selic: map({ "2020-12": "0", "2021-01": "0", "2021-02": "0" }) }, "2026-10")).toThrowError(/reajuste/i);
  });
});

describe("trabalhista", () => {
  it("rescisão sem justa causa (conferida por fora)", () => {
    const r = calcRescisao({ admissao: "2023-03-01", demissao: "2024-10-20", tipo: "SEM_JUSTA_CAUSA", salario: "3000.00" });
    const row = (n: string) => r.sections[0]!.rows.find((x) => x[0]!.startsWith(n))![2]!;
    expect(row("Saldo")).toBe("R$ 2.000,00");
    expect(row("Aviso")).toBe("R$ 3.300,00");
    expect(row("13º")).toBe("R$ 2.500,00");
    expect(row("Férias proporcionais")).toBe("R$ 2.000,00");
    expect(row("1/3")).toBe("R$ 666,67");
    expect(row("Multa do FGTS")).toBe("R$ 1.920,00");
  });
  it("justa causa só tem saldo de salário e férias vencidas", () => {
    const r = calcRescisao({ admissao: "2023-03-01", demissao: "2024-10-20", tipo: "JUSTA_CAUSA", salario: "3000.00", feriasVencidas: 1 });
    expect(r.sections[0]!.rows.map((x) => x[0])).toEqual(["Saldo de salário", "Férias vencidas", "1/3 constitucional sobre férias vencidas"]);
  });
  it("atualização: pré-judicial com IPCA-E + juros pro rata e SELIC judicial; não calcula sem índice", () => {
    const d = { tr: map({}), ipcae: map({ "2021-02": "1", "2021-03": "1" }), selic: map({ "2021-04": "1", "2021-05": "1" }) };
    const r = calcTrabalhistaAtualizacao({ itens: [{ nome: "Horas extras", competencia: "2021-01-31", valor: "1000.00" }], ajuizamento: "2021-04-01", dataBase: "2021-05-01", honorariosPercent: "10" }, d);
    // corrigido 1000*1,01*1,01 = 1020.10; juros: 60 dias (31/01→01/04)... 1% a.m. pro rata
    expect(r.sections[0]!.rows[0]![3]).toBe("IPCA-E");
    expect(Number(r.total)).toBeGreaterThan(1100);
    expect(() => calcTrabalhistaAtualizacao({ itens: [{ nome: "x", competencia: "2021-01-31", valor: "1.00" }], ajuizamento: "2021-04-01", dataBase: "2021-05-01" }, { ...d, ipcae: map({}) })).toThrowError(/IPCA-E/);
  });
});

describe("prazos e exportação", () => {
  it("recurso ordinário: 8 dias corridos", () => {
    const r = calcPrazo({ actKey: "clt-ro", intimacao: "2026-10-01", hoje: "2026-10-05" });
    expect(r.summary.find(([k]) => k === "VENCIMENTO")![1]).toBe("09/10/2026");
  });
  it("gera CSV, memorial e xlsx", async () => {
    const r = calcPrazo({ actKey: "cpc-contestacao", intimacao: "2026-10-19", hoje: "2026-10-20" });
    expect(toCsv(r)).toContain("VENCIMENTO");
    expect(memorial(r)).toContain("Ferramenta de apoio");
    const x = await toXlsx(r);
    expect(x.subarray(0, 2).toString()).toBe("PK");
  });
});
