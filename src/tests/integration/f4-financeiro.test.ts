import { beforeAll, describe, expect, it } from "vitest";
import { addDays, todayYmd } from "@/lib/dates/ymd";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import type { EntryInput } from "@/modules/finance/schemas";
import { createClient } from "@/server/services/client.service";
import { cancelInvoice, issueInvoice, listInvoices, listOpenBoletos, listToBill, setBoleto } from "@/server/services/fee-invoice.service";
import { createAccount, createCategory, createEntry, registerPayment, reversePayment, getEntry } from "@/server/services/finance.service";
import { annualCashflow, dayBalance } from "@/server/services/finance-report.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const TODAY = todayYmd("America/Sao_Paulo");
const YEAR = Number(TODAY.slice(0, 4));
const entry = (o: Partial<EntryInput> = {}): EntryInput => ({
  kind: "RECEIVABLE", type: "FEE", description: "Honorários", amount: "1.000,00", issueDate: TODAY, dueDate: TODAY, accountId: "", categoryId: "", costCenterId: "", clientId: "", caseId: "", counterparty: "", notes: "", installments: "1", ...o,
});
const clientBase = (name: string) => ({ type: "PERSON" as const, status: "ACTIVE" as const, name, tradeName: "", document: "", email: "", phone: "", birthDate: "", tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "" });
const pay = (accountId: string, amount: string, paidOn = TODAY) => ({ amount, paidOn, accountId, method: "PIX", note: "" });
const LINE = "23793381286000782713695000063305975520000370000";

describe("2.0-F4 — financeiro: fluxo anual, saldo do dia, faturas e boleto", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let acc1: { id: string };
  let acc2: { id: string };
  let catFee: { id: string };
  let cli: { id: string };
  let cli2: { id: string };

  beforeAll(async () => {
    A = await makeOrgWithOwner("f4-a");
    B = await makeOrgWithOwner("f4-b");
    lawyer = await addMember(A.org.id, "LAWYER", "f4-adv");
    acc1 = await createAccount(A.ctx, { name: "Banco", kind: "CHECKING", initialBalance: "100,00", openingDate: "" });
    acc2 = await createAccount(A.ctx, { name: "Caixa", kind: "CASH", initialBalance: "50,00", openingDate: "" });
    catFee = await createCategory(A.ctx, { name: "Honorários contratuais", color: "" });
    cli = await createClient(A.ctx, clientBase("Cliente Um"));
    cli2 = await createClient(A.ctx, clientBase("Cliente Dois"));
  });

  it("fluxo anual por categoria: realizado e previsto, a receber e a pagar, sem categoria à parte", async () => {
    const a = await createEntry(A.ctx, entry({ amount: "600,00", categoryId: catFee.id, accountId: acc1.id }));
    await registerPayment(A.ctx, a.id, pay(acc1.id, "400,00"));
    await createEntry(A.ctx, entry({ kind: "PAYABLE", type: "EXPENSE", description: "Custas", amount: "70,00" }));
    const r = await annualCashflow(A.ctx, YEAR);
    const m = Number(TODAY.slice(5, 7)) - 1;
    const line = r.receivable.lines.find((l) => l.name === "Honorários contratuais")!;
    expect(line.realized[m]).toBe("400.00");
    expect(line.expected[m]).toBe("200.00");
    expect(r.payable.lines.find((l) => l.name === "Sem categoria")!.expected[m]).toBe("70.00");
    expect(r.receivable.realizedTotal).toBe("400.00");
    expect(r.netRealized[m]).toBe("400.00");
    expect(r.netExpected[m]).toBe("130.00");
    await expect(annualCashflow(A.ctx, 1800)).rejects.toBeInstanceOf(ValidationError);
    await expect(annualCashflow(lawyer.ctx, YEAR)).rejects.toBeInstanceOf(ForbiddenError);
    const other = await annualCashflow(B.ctx, YEAR);
    expect(other.receivable.lines).toHaveLength(0);
  });

  it("saldo do dia: várias contas, entradas e saídas do dia, vencimentos do dia; estorno recalcula", async () => {
    const d1 = await dayBalance(A.ctx, TODAY);
    const byName = Object.fromEntries(d1.accounts.map((x) => [x.name, x]));
    expect(byName.Banco!.balance).toBe("500.00");
    expect(byName.Caixa!.balance).toBe("50.00");
    expect(d1.totalBalance).toBe("550.00");
    expect(d1.totalInflow).toBe("400.00");
    expect(d1.dueReceivable.total).toBe("200.00");
    expect(d1.duePayable.count).toBe(1);
    const past = await dayBalance(A.ctx, addDays(TODAY, -1));
    expect(past.totalBalance).toBe("150.00");
    expect(past.totalInflow).toBe("0.00");
    await expect(dayBalance(A.ctx, "31/12/2026")).rejects.toBeInstanceOf(ValidationError);
    const e = await createEntry(A.ctx, entry({ amount: "30,00", description: "Pgto estornado" }));
    await registerPayment(A.ctx, e.id, pay(acc2.id, "30,00"));
    expect((await dayBalance(A.ctx, TODAY)).totalBalance).toBe("580.00");
    const p = (await getEntry(A.ctx, e.id)).entry.payments[0]!;
    await reversePayment(A.ctx, p.id, "teste de estorno");
    expect((await dayBalance(A.ctx, TODAY)).totalBalance).toBe("550.00");
  });

  it("a faturar: só honorários a receber com cliente e sem fatura, agrupados por cliente", async () => {
    await createEntry(A.ctx, entry({ clientId: cli.id, description: "Entrada", amount: "300,00" }));
    await createEntry(A.ctx, entry({ clientId: cli.id, description: "Parcelas", amount: "200,00", installments: "2" }));
    await createEntry(A.ctx, entry({ clientId: cli2.id, description: "Êxito", amount: "500,00" }));
    await createEntry(A.ctx, entry({ clientId: cli2.id, type: "OTHER", description: "Não é honorário", amount: "10,00" }));
    const g = await listToBill(A.ctx);
    expect(g.map((x) => x.clientName)).toEqual(["Cliente Dois", "Cliente Um"]);
    expect(g.find((x) => x.clientName === "Cliente Um")!.total).toBe("500.00");
    expect(g.find((x) => x.clientName === "Cliente Dois")!.items).toHaveLength(1);
    expect((await listToBill(B.ctx)).length).toBe(0);
  });

  it("emite fatura numerada, só do mesmo cliente, sem repetir item; estado acompanha as baixas", async () => {
    const g = (await listToBill(A.ctx)).find((x) => x.clientName === "Cliente Um")!;
    const other = (await listToBill(A.ctx)).find((x) => x.clientName === "Cliente Dois")!;
    await expect(issueInvoice(A.ctx, { clientId: cli.id, entryIds: [g.items[0]!.id, other.items[0]!.id] })).rejects.toBeInstanceOf(ValidationError);
    await expect(issueInvoice(lawyer.ctx, { clientId: cli.id, entryIds: [g.items[0]!.id] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(issueInvoice(B.ctx, { clientId: cli.id, entryIds: [g.items[0]!.id] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(issueInvoice(A.ctx, { clientId: cli.id, entryIds: [] })).rejects.toBeInstanceOf(ValidationError);
    const inv = await issueInvoice(A.ctx, { clientId: cli.id, entryIds: g.items.map((i) => i.id), notes: "Contrato novo" });
    expect(inv.number).toBe(1);
    await expect(issueInvoice(A.ctx, { clientId: cli.id, entryIds: [g.items[0]!.id] })).rejects.toBeInstanceOf(ConflictError);
    const second = await issueInvoice(A.ctx, { clientId: cli2.id, entryIds: [other.items[0]!.id] });
    expect(second.number).toBe(2);
    expect((await listToBill(A.ctx)).find((x) => x.clientName === "Cliente Um")).toBeUndefined();
    let list = await listInvoices(A.ctx);
    expect(list[0]!.number).toBe(2);
    const one = list.find((i) => i.number === 1)!;
    expect(one.total).toBe("500.00");
    expect(one.state).toBe("ISSUED");
    await registerPayment(A.ctx, one.entries[0]!.id, pay(acc1.id, one.entries[0]!.amount));
    expect((await listInvoices(A.ctx)).find((i) => i.number === 1)!.state).toBe("PARTIAL");
    for (const e of one.entries.slice(1)) await registerPayment(A.ctx, e.id, pay(acc1.id, e.amount));
    list = await listInvoices(A.ctx, { state: "PAID" });
    expect(list.map((i) => i.number)).toEqual([1]);
    expect(await listInvoices(B.ctx)).toHaveLength(0);
  });

  it("cancelar fatura devolve os itens a 'a faturar'; com baixa registrada, não cancela", async () => {
    await expect(cancelInvoice(A.ctx, (await listInvoices(A.ctx)).find((i) => i.number === 1)!.id, "erro de cliente")).rejects.toBeInstanceOf(ConflictError);
    const two = (await listInvoices(A.ctx)).find((i) => i.number === 2)!;
    await expect(cancelInvoice(A.ctx, two.id, " ")).rejects.toBeInstanceOf(ValidationError);
    await cancelInvoice(A.ctx, two.id, "emitida para o cliente errado");
    expect((await listInvoices(A.ctx, { state: "CANCELED" })).map((i) => i.number)).toEqual([2]);
    expect((await listToBill(A.ctx)).find((x) => x.clientName === "Cliente Dois")!.items).toHaveLength(1);
    await expect(cancelInvoice(A.ctx, two.id, "de novo")).rejects.toBeInstanceOf(ConflictError);
    const again = await issueInvoice(A.ctx, { clientId: cli2.id, entryIds: [(await listToBill(A.ctx)).find((x) => x.clientName === "Cliente Dois")!.items[0]!.id] });
    expect(again.number).toBe(3);
  });

  it("boleto: guarda linha digitável e link https, valida, aparece nos boletos em aberto", async () => {
    const open = (await listToBill(A.ctx)).length;
    expect(open).toBe(0);
    const e = await createEntry(A.ctx, entry({ clientId: cli.id, description: "Com boleto", amount: "250,00", dueDate: addDays(TODAY, 5) }));
    await expect(setBoleto(A.ctx, e.id, { code: "123" })).rejects.toBeInstanceOf(ValidationError);
    await expect(setBoleto(A.ctx, e.id, { url: "http://x.com/b" })).rejects.toBeInstanceOf(ValidationError);
    await expect(setBoleto(A.ctx, e.id, { url: "javascript:alert(1)" })).rejects.toBeInstanceOf(ValidationError);
    await expect(setBoleto(B.ctx, e.id, { code: LINE })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setBoleto(lawyer.ctx, e.id, { code: LINE })).rejects.toBeInstanceOf(ForbiddenError);
    await setBoleto(A.ctx, e.id, { code: "23793.38128 60007.827136 95000.063305 9 75520000370000", url: "https://banco.exemplo/boleto/1" });
    const b = (await listOpenBoletos(A.ctx)).find((x) => x.id === e.id)!;
    expect(b.boletoCode).toBe(LINE);
    expect(b.remaining).toBe("250.00");
    await registerPayment(A.ctx, e.id, pay(acc1.id, "250,00"));
    expect((await listOpenBoletos(A.ctx)).find((x) => x.id === e.id)).toBeUndefined();
    expect(await listOpenBoletos(B.ctx)).toHaveLength(0);
  });
});
