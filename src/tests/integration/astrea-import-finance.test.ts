import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { runAstreaImport } from "@/server/import/astrea-import";
import { accountBalances, financeSummary } from "@/server/services/finance.service";
import { makeOrgWithOwner } from "./helpers";

function writeCsv(dir: string, name: string, header: string[], rows: Record<string, string>[]) {
  const q = (v: string) => `"${v.replaceAll('"', '""')}"`;
  fs.writeFileSync(path.join(dir, `${name}.csv`), [header, ...rows.map((r) => header.map((h) => r[h] ?? ""))].map((r) => r.map(q).join(",")).join("\n"));
}

const HE = ["Código", "Tipo", "Status", "Conta", "Sub-Tipo", "Cliente", "Descrições", "Valores", "Valores Originais", "Categorias", "Centros de custo", "Processo", "Responsável", "Data de lançamento", "Data de vencimento", "Data de pagamento", "Pago para"];

describe("importador Astrea — financeiro (dados fictícios)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let dir: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("imp-fin");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "astrea-fin-"));
    writeCsv(dir, "Usuário", ["Código", "Login", "Tipo"], [{ Código: "u1", Login: A.owner.email, Tipo: "Usuário" }]);
    writeCsv(dir, "Contatos", ["Código", "Nome", "Tipo do contato", "Classificação"], [
      { Código: "c1", Nome: "Ana Cliente", "Tipo do contato": "Pessoa Física", Classificação: "Cliente" },
      { Código: "c9", Nome: "Fornecedor Papelaria", "Tipo do contato": "Pessoa Jurídica", Classificação: "Contato" },
    ]);
    writeCsv(dir, "Processos", ["Código", "Titulo", "Clientes", "Tipo", "Status"], [{ Código: "p1", Titulo: "Ana x Réu", Clientes: "c1", Tipo: "Processo", Status: "Ativo" }]);
    writeCsv(dir, "Contas", ["Código", "Nome", "Data de início", "Valor inicial", "Tipo", "Status"], [
      { Código: "k1", Nome: "Banco Teste", "Data de início": "13/12/2022 00:00", "Valor inicial": "100", Tipo: "Conta corrente", Status: "Ativo" },
      { Código: "k2", Nome: "Caixa Teste", "Data de início": "13/12/2022 00:00", "Valor inicial": "0", Tipo: "Outros", Status: "Ativo" },
    ]);
    writeCsv(dir, "Categorias", ["Código", "Nome", "Bloqueado", "Cor", "Status", "Pai"], [
      { Código: "g1", Nome: "Honorários", Bloqueado: "Não", Cor: "#112233", Status: "Ativo", Pai: "" },
      { Código: "g2", Nome: "Custas", Bloqueado: "Não", Cor: "azul", Status: "Ativo", Pai: "g1" },
    ]);
    writeCsv(dir, "Centros de custo", ["Código", "Nome", "Status"], [{ Código: "cc1", Nome: "Previdenciário", Status: "Ativo" }, { Código: "cc2", Nome: "Antigo", Status: "Inativo" }]);
    writeCsv(dir, "Entradas", HE, [
      { Código: "e1", Tipo: "Entrada", Status: "Feito", Conta: "k1", "Sub-Tipo": "Honorário", Cliente: "c1", Descrições: "1-3", Valores: "333.34", "Valores Originais": "333.34", Categorias: "g1", "Centros de custo": "cc1", Processo: "p1", Responsável: "u1", "Data de lançamento": "2025-01-10", "Data de vencimento": "2025-02-10", "Data de pagamento": "2025-02-12" },
      { Código: "e2", Tipo: "Entrada", Status: "Aberto", Conta: "k1", "Sub-Tipo": "Honorário", Cliente: "c1", Descrições: "2-3", Valores: "333.33", "Valores Originais": "333.33", Categorias: "g1", Processo: "p1", "Data de lançamento": "2025-01-10", "Data de vencimento": "2099-03-10" },
      { Código: "e3", Tipo: "Saída", Status: "Feito", Conta: "k1", "Sub-Tipo": "Despesa", Descrições: "Papel sulfite", Valores: "-50.5", "Valores Originais": "0.0", Categorias: "g2", "Pago para": "c9", "Data de vencimento": "2025-02-01", "Data de pagamento": "2025-02-01" },
      { Código: "e4", Tipo: "Saída", Status: "Feito", Conta: "k1", "Sub-Tipo": "Avulsa", Descrições: "Taxa com desconto", Valores: "-90.00", "Valores Originais": "100.00", "Data de vencimento": "2025-02-02", "Data de pagamento": "2025-02-03" },
      { Código: "e5", Tipo: "Entrada", Status: "Feito", Conta: "k1", "Sub-Tipo": "Valor inicial", Valores: "100.0", "Valores Originais": "100.0", "Data de vencimento": "2022-12-13" },
      { Código: "e6", Tipo: "Fatura", Status: "Feito", Conta: "k1", "Sub-Tipo": "Avulsa", Valores: "744.3", "Valores Originais": "744.3", "Data de vencimento": "2025-02-02" },
      { Código: "e7", Tipo: "Entrada", Status: "Feito", Conta: "k2", "Sub-Tipo": "Avulsa", Descrições: "Zerado", Valores: "0.0", "Valores Originais": "0.0", "Data de vencimento": "2025-02-02" },
      { Código: "e8", Tipo: "Entrada", Status: "Feito", Conta: "k2", "Sub-Tipo": "Avulsa", Cliente: "inexistente", Descrições: "Sem cliente conhecido", Valores: "10.0", "Valores Originais": "10.0", "Data de vencimento": "2025-02-05", "Data de pagamento": "2025-02-05" },
    ]);
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("simulação não grava nada", async () => {
    const r = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir, dryRun: true, only: ["clientes", "processos", "financeiro"] });
    expect(r.entidades.financeiro?.importados).toBe(5);
    expect(await db.financeEntry.count({ where: { organizationId: A.org.id } })).toBe(0);
    expect(await db.financeAccount.count({ where: { organizationId: A.org.id } })).toBe(0);
  });

  it("importa contas, categorias, centros e lançamentos com baixas, sem duplicar saldo inicial nem faturas", async () => {
    const r = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir, only: ["clientes", "processos", "financeiro"] });
    const f = r.entidades.financeiro!;
    expect(f.lidos).toBe(8);
    expect(f.importados).toBe(5);
    expect(f.ignorados).toMatchObject({ "saldo inicial (já vem da conta)": 1, "fatura (agrupador de lançamentos)": 1, "tipo, valor (zero) ou vencimento inválido": 1 });
    expect(f.avisos["valor pago diferente do original (usado o valor efetivo)"]).toBe(1);
    expect(f.avisos["cliente não importado (lançamento ficou sem cliente)"]).toBe(1);

    const org = A.org.id;
    expect(await db.financeAccount.count({ where: { organizationId: org } })).toBe(2);
    const cats = await db.financeCategory.findMany({ where: { organizationId: org }, orderBy: { name: "asc" } });
    expect(cats.map((c) => c.name)).toEqual(["Honorários", "Honorários › Custas"]);
    expect(cats[1]!.color).toBeNull();
    const ccs = await db.costCenter.findMany({ where: { organizationId: org }, orderBy: { name: "asc" } });
    expect(ccs.map((c) => [c.name, c.active])).toEqual([["Antigo", false], ["Previdenciário", true]]);

    const e1 = await db.financeEntry.findFirstOrThrow({ where: { organizationId: org, description: "Honorários — parcela 1/3" }, include: { payments: true } });
    expect(e1.status).toBe("PAID");
    expect(e1.amount.toString()).toBe("333.34");
    expect(e1.paidAmount.toString()).toBe("333.34");
    expect(e1.installmentNo).toBe(1);
    expect(e1.installmentTotal).toBe(3);
    expect(e1.clientId).not.toBeNull();
    expect(e1.caseId).not.toBeNull();
    expect(e1.createdById).toBe(A.owner.id);
    expect(e1.payments).toHaveLength(1);
    expect(e1.payments[0]!.paidOn.toISOString().slice(0, 10)).toBe("2025-02-12");

    const e2 = await db.financeEntry.findFirstOrThrow({ where: { organizationId: org, description: "Honorários — parcela 2/3" }, include: { payments: true } });
    expect(e2.status).toBe("OPEN");
    expect(e2.payments).toHaveLength(0);

    const e3 = await db.financeEntry.findFirstOrThrow({ where: { organizationId: org, description: "Papel sulfite" } });
    expect(e3.kind).toBe("PAYABLE");
    expect(e3.type).toBe("EXPENSE");
    expect(e3.amount.toString()).toBe("50.5");
    expect(e3.counterparty).toBe("Fornecedor Papelaria");

    const e4 = await db.financeEntry.findFirstOrThrow({ where: { organizationId: org, description: "Taxa com desconto" } });
    expect(e4.amount.toString()).toBe("90");
    expect(e4.notes).toContain("Valor original no Astrea: R$ 100,00");

    // saldo: 100 (inicial, vem da conta) + 333,34 − 50,50 − 90,00 = 292,84 ; caixa = +10
    const ctx = A.ctx;
    const balances = Object.fromEntries((await accountBalances(ctx)).map((b) => [b.name, b.balance]));
    expect(balances["Banco Teste"]).toBe("292.84");
    expect(balances["Caixa Teste"]).toBe("10.00");
    const summary = await financeSummary(ctx);
    expect(summary.receivableOpen).toBe("333.33");
  });

  it("rodar de novo não duplica nada", async () => {
    const r = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir, only: ["financeiro"] });
    expect(r.entidades.financeiro?.importados).toBe(0);
    expect(r.entidades.financeiro?.jaImportados).toBe(5);
    expect(await db.financeEntry.count({ where: { organizationId: A.org.id } })).toBe(5);
    expect(await db.financePayment.count({ where: { organizationId: A.org.id } })).toBe(4);
    expect(await db.financeAccount.count({ where: { organizationId: A.org.id } })).toBe(2);
  });
});
