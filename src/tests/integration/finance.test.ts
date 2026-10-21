import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { addDays, todayYmd } from "@/lib/dates/ymd";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import type { ClientInput } from "@/modules/clients/schemas";
import type { EntryInput } from "@/modules/finance/schemas";
import { createCase } from "@/server/services/case.service";
import { createClient } from "@/server/services/client.service";
import {
  accountBalances, cancelEntry, cashflow, createAccount, createCategory, createCostCenter, createEntry, entryTotalsFor, financeSummary, getEntry, listEntries, registerPayment, reversePayment, setAccountActive, updateEntry,
} from "@/server/services/finance.service";
import { resolveTenantContext } from "@/server/services/tenant.service";
import type { TenantContext } from "@/server/context";
import { META, addMember, makeOrgWithOwner, makeUser } from "./helpers";

const TODAY = todayYmd("America/Sao_Paulo");
const entry = (o: Partial<EntryInput> = {}): EntryInput => ({
  kind: "RECEIVABLE", type: "FEE", description: "Honorários", amount: "1.000,00", issueDate: TODAY, dueDate: addDays(TODAY, 10), accountId: "", categoryId: "", costCenterId: "", clientId: "", caseId: "", counterparty: "", notes: "", installments: "1", ...o,
});
const clientBase = (name: string): ClientInput => ({
  type: "PERSON", status: "ACTIVE", name, tradeName: "", document: "", email: "", phone: "", birthDate: "", tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "",
});
const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const pay = (accountId: string, amount: string, paidOn = TODAY) => ({ amount, paidOn, accountId, method: "PIX", note: "" });

describe("financeiro (Fase 7)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let fin: Awaited<ReturnType<typeof addMember>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let clerk: { ctx: TenantContext };
  let acc: { id: string };
  let accB: { id: string };

  beforeAll(async () => {
    A = await makeOrgWithOwner("f7-A");
    B = await makeOrgWithOwner("f7-B");
    fin = await addMember(A.org.id, "FINANCE", "f7-fin");
    lawyer = await addMember(A.org.id, "LAWYER", "f7-law");
    // perfil personalizado: lança e dá baixa, mas NÃO administra (sem finance:manage)
    const role = await db.role.create({ data: { organizationId: A.org.id, key: "CUSTOM_CLERK", name: "Auxiliar financeiro", permissions: ["finance:read", "finance:write", "clients:read", "cases:read"], isSystem: false } as never });
    const u = await makeUser("f7-clerk");
    await db.membership.create({ data: { organizationId: A.org.id, userId: u.id, roleId: role.id } });
    clerk = { ctx: (await resolveTenantContext(u.id, A.org.id, META)) as TenantContext };
    acc = await createAccount(fin.ctx, { name: "Conta principal", kind: "CHECKING", initialBalance: "100,00", openingDate: "" });
    accB = await createAccount(B.ctx, { name: "Conta da B", kind: "CHECKING", initialBalance: "", openingDate: "" });
  });

  describe("permissões", () => {
    it("quem não tem finance:read não vê nada; sem finance:write não lança; sem finance:manage não cadastra/estorna", async () => {
      await expect(listEntries(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(financeSummary(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createEntry(lawyer.ctx, entry())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createAccount(clerk.ctx, { name: "X", kind: "CASH", initialBalance: "", openingDate: "" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createCategory(clerk.ctx, { name: "Cat", color: "" })).rejects.toBeInstanceOf(ForbiddenError);
      const e = await createEntry(clerk.ctx, entry({ description: "Do auxiliar" }));
      await registerPayment(clerk.ctx, e.id, pay(acc.id, "100,00"));
      const p = (await getEntry(clerk.ctx, e.id)).entry.payments[0]!;
      await expect(reversePayment(clerk.ctx, p.id, "erro")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(cancelEntry(clerk.ctx, e.id, "motivo")).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("lançamentos", () => {
    it("valida valor, datas e referências do próprio escritório", async () => {
      await expect(createEntry(fin.ctx, entry({ amount: "0,00" }))).rejects.toBeInstanceOf(ValidationError);
      await expect(createEntry(fin.ctx, entry({ amount: "abc" }))).rejects.toThrow();
      await expect(createEntry(fin.ctx, entry({ dueDate: "" }))).rejects.toThrow();
      const clientB = await createClient(B.ctx, clientBase("Cliente da B"));
      await expect(createEntry(fin.ctx, entry({ clientId: clientB.id }))).rejects.toBeInstanceOf(ValidationError);
      await expect(createEntry(fin.ctx, entry({ accountId: accB.id }))).rejects.toBeInstanceOf(ValidationError);
      const catB = await createCategory(B.ctx, { name: "Cat B", color: "" });
      await expect(createEntry(fin.ctx, entry({ categoryId: catB.id }))).rejects.toBeInstanceOf(ValidationError);
      const ccB = await createCostCenter(B.ctx, { name: "CC B" });
      await expect(createEntry(fin.ctx, entry({ costCenterId: ccB.id }))).rejects.toBeInstanceOf(ValidationError);
    });

    it("parcelamento: soma exata, vencimentos mensais (com ajuste de fim de mês) e mesmo grupo", async () => {
      const r = await createEntry(fin.ctx, entry({ amount: "100,00", installments: "3", dueDate: "2027-01-31" }));
      expect(r.ids).toHaveLength(3);
      const rows = await db.financeEntry.findMany({ where: { id: { in: r.ids } }, orderBy: { installmentNo: "asc" } });
      expect(rows.map((x) => x.amount.toString())).toEqual(["33.34", "33.33", "33.33"]);
      expect(rows.map((x) => x.dueDate.toISOString().slice(0, 10))).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
      expect(new Set(rows.map((x) => x.groupId)).size).toBe(1);
      expect(rows.every((x) => x.installmentTotal === 3)).toBe(true);
      await expect(createEntry(fin.ctx, entry({ amount: "0,02", installments: "3" }))).rejects.toBeInstanceOf(ValidationError);
    });

    it("processo sigiloso: não pode ser vinculado nem tem o título exposto a quem não tem acesso", async () => {
      const secret = await createCase(A.ctx, { ...caseBase, title: "Segredo de justiça", confidential: true });
      await expect(createEntry(fin.ctx, entry({ caseId: secret.id }))).rejects.toBeInstanceOf(ValidationError);
      const e = await createEntry(A.ctx, entry({ caseId: secret.id, description: "Vinculado ao sigiloso" }));
      const asFin = await listEntries(fin.ctx, { status: "todos", q: "Vinculado ao sigiloso" });
      expect(asFin.items[0]?.caseTitle).toBeNull();
      expect((await getEntry(fin.ctx, e.id)).caseHidden).toBe(true);
      const asOwner = await listEntries(A.ctx, { status: "todos", q: "Vinculado ao sigiloso" });
      expect(asOwner.items[0]?.caseTitle).toBe("Segredo de justiça");
    });
  });

  describe("baixas", () => {
    it("baixa parcial → PARTIAL, total → PAID; não aceita acima do saldo, futuro ou conta de outro escritório", async () => {
      const e = await createEntry(fin.ctx, entry({ amount: "1.000,00" }));
      await registerPayment(fin.ctx, e.id, pay(acc.id, "400,00"));
      let cur = (await getEntry(fin.ctx, e.id)).entry;
      expect([cur.status, cur.paidAmount.toString()]).toEqual(["PARTIAL", "400"]);
      await expect(registerPayment(fin.ctx, e.id, pay(acc.id, "600,01"))).rejects.toBeInstanceOf(ConflictError);
      await expect(registerPayment(fin.ctx, e.id, pay(acc.id, "10,00", addDays(TODAY, 1)))).rejects.toBeInstanceOf(ValidationError);
      await expect(registerPayment(fin.ctx, e.id, pay(accB.id, "10,00"))).rejects.toBeInstanceOf(ValidationError);
      await expect(registerPayment(fin.ctx, e.id, pay(acc.id, "0,00"))).rejects.toBeInstanceOf(ValidationError);
      await registerPayment(fin.ctx, e.id, pay(acc.id, "600,00"));
      cur = (await getEntry(fin.ctx, e.id)).entry;
      expect([cur.status, cur.paidAmount.toString()]).toEqual(["PAID", "1000"]);
      await expect(registerPayment(fin.ctx, e.id, pay(acc.id, "0,01"))).rejects.toBeInstanceOf(ConflictError);
    });

    it("duas baixas simultâneas que juntas passam do saldo: só uma vence", async () => {
      const e = await createEntry(fin.ctx, entry({ amount: "100,00" }));
      const r = await Promise.allSettled([registerPayment(fin.ctx, e.id, pay(acc.id, "60,00")), registerPayment(fin.ctx, e.id, pay(acc.id, "60,00"))]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const cur = (await getEntry(fin.ctx, e.id)).entry;
      expect(cur.paidAmount.toString()).toBe("60");
      expect(cur.payments).toHaveLength(1);
    });

    it("conta inativa não recebe baixa", async () => {
      const a2 = await createAccount(fin.ctx, { name: "Conta velha", kind: "CASH", initialBalance: "", openingDate: "" });
      await setAccountActive(fin.ctx, a2.id, false);
      const e = await createEntry(fin.ctx, entry());
      await expect(registerPayment(fin.ctx, e.id, pay(a2.id, "10,00"))).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("estorno, cancelamento e edição", () => {
    it("estorno devolve o saldo, mantém o histórico e não pode ser repetido (nem concorrente)", async () => {
      const e = await createEntry(fin.ctx, entry({ amount: "500,00" }));
      await registerPayment(fin.ctx, e.id, pay(acc.id, "500,00"));
      const p = (await getEntry(fin.ctx, e.id)).entry.payments[0]!;
      await expect(reversePayment(fin.ctx, p.id, " ")).rejects.toThrow();
      const r = await Promise.allSettled([reversePayment(fin.ctx, p.id, "Pagamento em duplicidade"), reversePayment(fin.ctx, p.id, "Pagamento em duplicidade")]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const after = await getEntry(fin.ctx, e.id);
      expect([after.entry.status, after.entry.paidAmount.toString()]).toEqual(["OPEN", "0"]);
      expect(after.entry.payments).toHaveLength(1);
      expect(after.entry.payments[0]).toMatchObject({ reversalReason: "Pagamento em duplicidade", reversedById: fin.user.id });
      await registerPayment(fin.ctx, e.id, pay(acc.id, "500,00")); // pode receber de novo
      expect((await getEntry(fin.ctx, e.id)).entry.status).toBe("PAID");
    });

    it("cancelar: só sem baixas; com baixas exige estorno antes; cancelado não recebe baixa nem edição", async () => {
      const e = await createEntry(fin.ctx, entry({ amount: "50,00" }));
      await registerPayment(fin.ctx, e.id, pay(acc.id, "10,00"));
      await expect(cancelEntry(fin.ctx, e.id, "engano")).rejects.toBeInstanceOf(ConflictError);
      const p = (await getEntry(fin.ctx, e.id)).entry.payments[0]!;
      await reversePayment(fin.ctx, p.id, "lançado por engano");
      await cancelEntry(fin.ctx, e.id, "engano");
      await expect(cancelEntry(fin.ctx, e.id, "engano")).rejects.toBeInstanceOf(ConflictError);
      await expect(registerPayment(fin.ctx, e.id, pay(acc.id, "1,00"))).rejects.toBeInstanceOf(ConflictError);
      await expect(updateEntry(fin.ctx, e.id, { ...entry({ amount: "60,00" }), installments: undefined } as never)).rejects.toBeInstanceOf(ConflictError);
      expect((await getEntry(fin.ctx, e.id)).entry).toMatchObject({ status: "CANCELED", canceledReason: "engano", canceledById: fin.user.id });
    });

    it("edição: valor não cai abaixo do pago; igualar ao pago quita; aumentar reabre", async () => {
      const e = await createEntry(fin.ctx, entry({ amount: "200,00" }));
      await registerPayment(fin.ctx, e.id, pay(acc.id, "150,00"));
      const base = { ...entry({ description: "Editado" }) } as Partial<EntryInput>;
      delete base.installments;
      await expect(updateEntry(fin.ctx, e.id, { ...base, amount: "100,00" })).rejects.toBeInstanceOf(ValidationError);
      await updateEntry(fin.ctx, e.id, { ...base, amount: "150,00" });
      expect((await getEntry(fin.ctx, e.id)).entry).toMatchObject({ status: "PAID", description: "Editado" });
      await updateEntry(fin.ctx, e.id, { ...base, amount: "180,00" });
      const cur = (await getEntry(fin.ctx, e.id)).entry;
      expect([cur.status, cur.amount.toString(), cur.paidAmount.toString()]).toEqual(["PARTIAL", "180", "150"]);
    });

    it("o banco recusa estados incoerentes mesmo fora do serviço", async () => {
      const e = await createEntry(fin.ctx, entry({ amount: "10,00" }));
      await expect(db.$executeRawUnsafe(`UPDATE finance_entries SET status = 'PAID' WHERE id = '${e.id}'`)).rejects.toThrow();
      await expect(db.$executeRawUnsafe(`UPDATE finance_entries SET paid_amount = 99 WHERE id = '${e.id}'`)).rejects.toThrow();
      await expect(db.$executeRawUnsafe(`UPDATE finance_entries SET amount = 0 WHERE id = '${e.id}'`)).rejects.toThrow();
    });
  });

  describe("relatórios", () => {
    it("resumo, saldos de conta e fluxo de caixa batem com os lançamentos", async () => {
      const C = await makeOrgWithOwner("f7-C");
      const a = await createAccount(C.ctx, { name: "Banco", kind: "CHECKING", initialBalance: "1.000,00", openingDate: "" });
      const a2 = await createAccount(C.ctx, { name: "Caixa", kind: "CASH", initialBalance: "", openingDate: "" });
      const past = addDays(TODAY, -40);
      const r1 = await createEntry(C.ctx, entry({ amount: "300,00", dueDate: past })); // vencido a receber
      const r2 = await createEntry(C.ctx, entry({ amount: "700,00", dueDate: addDays(TODAY, 5) })); // a receber
      const p1 = await createEntry(C.ctx, entry({ kind: "PAYABLE", type: "EXPENSE", amount: "200,00", dueDate: addDays(TODAY, 3) }));
      await registerPayment(C.ctx, r2.id, pay(a.id, "250,00")); // recebido
      await registerPayment(C.ctx, p1.id, pay(a2.id, "50,00")); // pago
      void r1;
      const s = await financeSummary(C.ctx);
      expect(s).toEqual({ receivableOpen: "750.00", receivableOverdue: "300.00", payableOpen: "150.00", payableOverdue: "0.00", receivedThisMonth: "250.00", paidThisMonth: "50.00" });
      const bal = Object.fromEntries((await accountBalances(C.ctx)).map((x) => [x.name, x.balance]));
      expect(bal).toEqual({ Banco: "1250.00", Caixa: "-50.00" });
      const cf = await cashflow(C.ctx, 3);
      expect(cf.overdueIn).toBe("300.00");
      const sumField = (k: "realizedIn" | "realizedOut") => cf.months.reduce((t, m) => t + Number(m[k]), 0);
      expect(sumField("realizedIn")).toBe(250);
      expect(sumField("realizedOut")).toBe(50);
      const totalsExpectedIn = cf.months.reduce((t, m) => t + Number(m.expectedIn), 0);
      expect(totalsExpectedIn).toBe(450); // só 450 de r2 ainda a vencer; r1 está em "vencidos"
      // estornar muda tudo de volta
      const pay1 = (await getEntry(C.ctx, r2.id)).entry.payments[0]!;
      await reversePayment(C.ctx, pay1.id, "estorno de teste");
      expect((await financeSummary(C.ctx)).receivedThisMonth).toBe("0.00");
      expect(Object.fromEntries((await accountBalances(C.ctx)).map((x) => [x.name, x.balance])).Banco).toBe("1000.00");
    });

    it("listagem: filtros de situação, busca e totais; extrato por cliente", async () => {
      const cli = await createClient(A.ctx, clientBase("Cliente Extrato"));
      const e1 = await createEntry(fin.ctx, entry({ description: "Extrato 1", amount: "100,00", clientId: cli.id, dueDate: addDays(TODAY, -3) }));
      await createEntry(fin.ctx, entry({ description: "Extrato 2", amount: "50,00", clientId: cli.id }));
      await registerPayment(fin.ctx, e1.id, pay(acc.id, "40,00"));
      const open = await listEntries(fin.ctx, { clientId: cli.id });
      expect(open.total).toBe(2);
      expect(open.totalAmount).toBe("150.00");
      expect(open.totalRemaining).toBe("110.00");
      expect((await listEntries(fin.ctx, { clientId: cli.id, status: "vencido" })).items.map((i) => i.description)).toEqual(["Extrato 1"]);
      expect((await listEntries(fin.ctx, { clientId: cli.id, status: "pago" })).total).toBe(0);
      expect((await listEntries(fin.ctx, { q: "extrato 2", status: "todos" })).total).toBe(1);
      const t = await entryTotalsFor(fin.ctx, { clientId: cli.id });
      expect(t.receivable).toEqual({ total: "150.00", paid: "40.00", remaining: "110.00" });
    });
  });

  describe("isolamento entre escritórios", () => {
    it("outro escritório não vê, baixa, estorna, cancela nem edita", async () => {
      const e = await createEntry(fin.ctx, entry({ description: "Só da A" }));
      await registerPayment(fin.ctx, e.id, pay(acc.id, "10,00"));
      const p = (await getEntry(fin.ctx, e.id)).entry.payments[0]!;
      await expect(getEntry(B.ctx, e.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(registerPayment(B.ctx, e.id, pay(accB.id, "1,00"))).rejects.toBeInstanceOf(NotFoundError);
      await expect(reversePayment(B.ctx, p.id, "invasão")).rejects.toBeInstanceOf(NotFoundError);
      await expect(cancelEntry(B.ctx, e.id, "invasão")).rejects.toBeInstanceOf(NotFoundError);
      await expect(updateEntry(B.ctx, e.id, { ...entry(), installments: undefined } as never)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listEntries(B.ctx, { status: "todos" })).items.some((i) => i.id === e.id)).toBe(false);
      expect((await getEntry(fin.ctx, e.id)).entry).toMatchObject({ status: "PARTIAL", paidAmount: expect.anything() });
      await expect(setAccountActive(B.ctx, acc.id, false)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
