import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { addDays, todayYmd } from "@/lib/dates/ymd";
import { createClient } from "@/server/services/client.service";
import { createAccount, createEntry } from "@/server/services/finance.service";
import { cancelFeeCharge, cancelFeeContract, createFeeCharge, createFeeContract, FeeWebhookAuthError, getFeeAsaasStatus, handleFeeWebhook, listFeeCharges, listFeeContracts, saveFeeAsaasConfig, setFeeAsaasEnabled, successFee, testFeeAsaas, triggerFeeContract, __setFeeBaseForTests } from "@/server/services/fee-charge.service";
import { addMember, makeOrgWithOwner } from "./helpers";
import { startFakeAsaas } from "./fake-asaas";

const TODAY = todayYmd("America/Sao_Paulo");
const clientBase = (name: string, document: string) => ({ type: "PERSON" as const, status: "ACTIVE" as const, name, tradeName: "", document, email: "", phone: "", birthDate: "", tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "" });
const entry = (clientId: string, o: Record<string, unknown> = {}) => ({ kind: "RECEIVABLE", type: "FEE", description: "Honorários", amount: "1.000,00", issueDate: TODAY, dueDate: addDays(TODAY, 10), accountId: "", categoryId: "", costCenterId: "", clientId, caseId: "", counterparty: "", notes: "", installments: "1", ...o });

describe("5.0-F3 — cobrança de honorários por Pix e boleto (Asaas simulado SÓ nos testes)", () => {
  const fake = startFakeAsaas();
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let fin: Awaited<ReturnType<typeof addMember>>;
  let acc: { id: string };
  let client: { id: string };
  let token = "";

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    __setFeeBaseForTests(await fake.start());
    A = await makeOrgWithOwner("f50f-a");
    B = await makeOrgWithOwner("f50f-b");
    lawyer = await addMember(A.org.id, "LAWYER", "f50f-law");
    fin = await addMember(A.org.id, "FINANCE", "f50f-fin");
    acc = await createAccount(fin.ctx, { name: "Conta Asaas", kind: "CHECKING", initialBalance: "", openingDate: "" });
    client = await createClient(A.ctx, clientBase("Cliente Pix", "529.982.247-25"));
  });
  afterAll(async () => {
    __setFeeBaseForTests(undefined);
    await fake.stop();
  });

  const KEY = "chave-de-teste-fee-0000000";

  it("sem configuração nada é cobrado; só quem administra o financeiro configura; chave curta é recusada", async () => {
    const e = await createEntry(fin.ctx, entry(client.id));
    await expect(createFeeCharge(fin.ctx, e.id, "PIX")).rejects.toThrow(/não configurada/);
    await expect(saveFeeAsaasConfig(lawyer.ctx, { apiKey: KEY, sandbox: true, accountId: acc.id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveFeeAsaasConfig(fin.ctx, { apiKey: "curta", sandbox: true, accountId: acc.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveFeeAsaasConfig(fin.ctx, { apiKey: KEY, sandbox: true, accountId: "00000000-0000-4000-8000-000000000000" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("configura com a chave cifrada, testa a conexão e só cobra depois de ligar", async () => {
    await saveFeeAsaasConfig(fin.ctx, { apiKey: KEY, sandbox: true, accountId: acc.id });
    const row = await db.feeAsaasConfig.findUniqueOrThrow({ where: { organizationId: A.org.id } });
    expect(row.apiKeyEnc).not.toContain(KEY);
    expect(row.enabled).toBe(false);
    token = row.webhookToken;
    expect((await getFeeAsaasStatus(fin.ctx)).webhookUrl).toContain(`/api/webhooks/fees/${A.org.id}`);
    await expect(getFeeAsaasStatus(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await testFeeAsaas(fin.ctx)).toEqual({ ok: true });
    const e = await createEntry(fin.ctx, entry(client.id));
    await expect(createFeeCharge(fin.ctx, e.id, "PIX")).rejects.toThrow(/desligada/);
    await setFeeAsaasEnabled(fin.ctx, true);
  });

  it("Pix: cria cliente e cobrança no Asaas com o valor do saldo, guarda o QR Code e recusa segunda cobrança aberta", async () => {
    const e = await createEntry(fin.ctx, entry(client.id, { amount: "1.234,56" }));
    const ch = await createFeeCharge(fin.ctx, e.id, "PIX");
    const rows = await listFeeCharges(fin.ctx, e.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe("1234.56");
    expect(rows[0]!.pixPayload).toMatch(/^00020126PIX/);
    expect(rows[0]!.pixImage).toBeTruthy();
    const sent = fake.requests.filter((r) => r.method === "POST" && r.path === "/payments").at(-1)!;
    expect(sent.body).toMatchObject({ billingType: "PIX", value: 1234.56, externalReference: e.id });
    expect(fake.count("POST", /^\/customers$/)).toBe(1);
    await expect(createFeeCharge(fin.ctx, e.id, "BOLETO")).rejects.toBeInstanceOf(ConflictError);
    await cancelFeeCharge(fin.ctx, ch.id);
    expect([...fake.payments.values()].find((p) => p.id === rows[0]!.asaasPaymentId)!.deleted).toBe(true);
    await createFeeCharge(fin.ctx, e.id, "BOLETO"); // reaproveita o cliente do Asaas
    expect(fake.count("POST", /^\/customers$/)).toBe(1);
    expect((await db.financeEntry.findUniqueOrThrow({ where: { id: e.id } })).boletoUrl).toMatch(/sandbox\.asaas\.com\/b\//);
  });

  it("recusa cobrança sem CPF/CNPJ, sem cliente, em lançamento pago ou a pagar, e de outro escritório", async () => {
    const semDoc = await createClient(A.ctx, clientBase("Sem Documento", ""));
    await expect(createFeeCharge(fin.ctx, (await createEntry(fin.ctx, entry(semDoc.id))).id, "PIX")).rejects.toThrow(/CPF ou CNPJ/);
    await expect(createFeeCharge(fin.ctx, (await createEntry(fin.ctx, entry(""))).id, "PIX")).rejects.toBeInstanceOf(ValidationError);
    await expect(createFeeCharge(fin.ctx, (await createEntry(fin.ctx, entry(client.id, { kind: "PAYABLE" }))).id, "PIX")).rejects.toBeInstanceOf(NotFoundError);
    const e = await createEntry(fin.ctx, entry(client.id));
    await expect(createFeeCharge(B.ctx, e.id, "PIX")).rejects.toThrow();
    await expect(createFeeCharge(fin.ctx, e.id, "CARTAO" as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it("aviso do Asaas: token errado é recusado; pagamento baixa sozinho UMA vez (idempotente) na conta configurada", async () => {
    const e = await createEntry(fin.ctx, entry(client.id, { amount: "500,00" }));
    await createFeeCharge(fin.ctx, e.id, "PIX");
    const pay = (await listFeeCharges(fin.ctx, e.id))[0]!;
    const body = { event: "PAYMENT_RECEIVED", payment: { id: pay.asaasPaymentId, status: "RECEIVED", value: 500, paymentDate: TODAY } };
    await expect(handleFeeWebhook(A.org.id, "token-errado", body)).rejects.toBeInstanceOf(FeeWebhookAuthError);
    await expect(handleFeeWebhook(A.org.id, null, body)).rejects.toBeInstanceOf(FeeWebhookAuthError);
    await expect(handleFeeWebhook(B.org.id, token, body)).rejects.toBeInstanceOf(FeeWebhookAuthError);
    expect((await handleFeeWebhook(A.org.id, token, { payment: { id: "pay_inexistente", status: "RECEIVED" } })).status).toBe("ignored_unknown");
    expect((await handleFeeWebhook(A.org.id, token, { payment: { id: pay.asaasPaymentId, status: "PENDING" } })).status).toBe("pending");
    expect((await handleFeeWebhook(A.org.id, token, body)).status).toBe("paid");
    expect((await handleFeeWebhook(A.org.id, token, body)).status).toBe("already_paid");
    const [a, b] = await Promise.all([handleFeeWebhook(A.org.id, token, body), handleFeeWebhook(A.org.id, token, body)]);
    expect([a.status, b.status].every((x) => x === "already_paid")).toBe(true);
    const got = await db.financeEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(got.status).toBe("PAID");
    expect(got.paidAmount.toString()).toBe("500");
    const pays = await db.financePayment.findMany({ where: { entryId: e.id } });
    expect(pays).toHaveLength(1);
    expect(pays[0]!.accountId).toBe(acc.id);
    expect(pays[0]!.method).toBe("PIX");
    expect(pays[0]!.note).toMatch(/Baixa automática/);
  });

  it("vencida marca a cobrança; estornada avisa e não mexe na baixa sozinha; desligada ignora", async () => {
    const e = await createEntry(fin.ctx, entry(client.id, { amount: "300,00" }));
    await createFeeCharge(fin.ctx, e.id, "BOLETO");
    const ch = (await listFeeCharges(fin.ctx, e.id))[0]!;
    expect((await handleFeeWebhook(A.org.id, token, { payment: { id: ch.asaasPaymentId, status: "OVERDUE" } })).status).toBe("overdue");
    expect((await db.feeCharge.findUniqueOrThrow({ where: { id: ch.id } })).status).toBe("OVERDUE");
    expect((await handleFeeWebhook(A.org.id, token, { payment: { id: ch.asaasPaymentId, status: "REFUNDED" } })).status).toBe("refunded");
    expect((await db.financeEntry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("OPEN");
    await setFeeAsaasEnabled(fin.ctx, false);
    expect((await handleFeeWebhook(A.org.id, token, { payment: { id: ch.asaasPaymentId, status: "RECEIVED" } })).status).toBe("ignored_disabled");
    await setFeeAsaasEnabled(fin.ctx, true);
  });

  it("Asaas fora do ar vira mensagem clara e não grava cobrança", async () => {
    const e = await createEntry(fin.ctx, entry(client.id));
    fake.state.down = true;
    await expect(createFeeCharge(fin.ctx, e.id, "PIX")).rejects.toBeInstanceOf(ConflictError);
    fake.state.down = false;
    expect(await db.feeCharge.count({ where: { entryId: e.id } })).toBe(0);
  });

  it("contrato de êxito: valor esperado, acionamento gera honorário a receber uma única vez", async () => {
    expect(successFee({ percent: "30", fixedAmount: null }, "10000.00")).toBe("3000.00");
    expect(successFee({ percent: "30", fixedAmount: null }, null)).toBeNull();
    expect(successFee({ percent: null, fixedAmount: "800.00" }, null)).toBe("800.00");
    await expect(createFeeContract(lawyer.ctx, { clientId: client.id, title: "Êxito", percent: "30" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createFeeContract(fin.ctx, { clientId: client.id, title: "Êxito" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createFeeContract(fin.ctx, { clientId: client.id, title: "Êxito", percent: "130" })).rejects.toBeInstanceOf(ValidationError);
    const c = await createFeeContract(fin.ctx, { clientId: client.id, title: "Êxito da ação X", percent: "30", expectedBase: "10000.00" });
    expect((await listFeeContracts(fin.ctx)).expectedTotal).toBe("3000.00");
    await expect(triggerFeeContract(fin.ctx, c.id, { dueDate: addDays(TODAY, 15) })).rejects.toBeInstanceOf(ValidationError);
    const r = await triggerFeeContract(fin.ctx, c.id, { base: "12.000,00".replace(/\./g, "").replace(",", "."), dueDate: addDays(TODAY, 15) });
    expect(r.fee).toBe("3600.00");
    const en = await db.financeEntry.findUniqueOrThrow({ where: { id: r.entryId } });
    expect(en.kind).toBe("RECEIVABLE");
    expect(en.type).toBe("FEE");
    expect(en.amount.toString()).toBe("3600");
    await expect(triggerFeeContract(fin.ctx, c.id, { base: "1.00", dueDate: addDays(TODAY, 15) })).rejects.toBeInstanceOf(ConflictError);
    const c2 = await createFeeContract(fin.ctx, { clientId: client.id, title: "Cancelável", fixedAmount: "500.00" });
    await cancelFeeContract(fin.ctx, c2.id);
    await expect(cancelFeeContract(fin.ctx, c2.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listFeeContracts(B.ctx)).items).toHaveLength(0);
  });
});
