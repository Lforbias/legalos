import { beforeAll, describe, expect, it } from "vitest";
import { addDays, todayYmd } from "@/lib/dates/ymd";
import { correct, monthsBetween, parseRate } from "@/lib/finance/correction";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { createCase } from "@/server/services/case.service";
import { addCaseFee, consolidatedHistory, getValuation, linkCases, listAppeals, listCaseFees, listCaseLinks, removeAppeal, removeCaseFee, saveAppeal, setValuation, unlinkCases } from "@/server/services/case-extras.service";
import { createEntry } from "@/server/services/finance.service";
import { correctValue, indexCoverage, parseBcbSeries, setManualIndex, syncOfficialIndexes } from "@/server/services/monetary-index.service";
import { createTask } from "@/server/services/task.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const base = { number: "", legacyNumber: "", title: "Caso", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const TODAY = todayYmd("America/Sao_Paulo");

describe("2.0-F5 — correção monetária (puro)", () => {
  it("meses: do mês-base inclusive até o mês do alvo exclusive", () => {
    expect(monthsBetween("2026-01-15", "2026-04-02")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(monthsBetween("2026-04-10", "2026-04-30")).toEqual([]);
    expect(monthsBetween("2026-05-01", "2026-01-01")).toEqual([]);
  });
  it("taxa: aceita negativa e até 6 casas; rejeita lixo", () => {
    expect(parseRate("0.46")).toBe(460000n);
    expect(parseRate("-0.02")).toBe(-20000n);
    expect(parseRate("1")).toBe(1000000n);
    expect(parseRate("abc")).toBeNull();
    expect(parseRate("1,5")).toBeNull();
  });
  it("produto dos fatores sem ponto flutuante; sem índice de algum mês, não calcula", () => {
    const rates = new Map([["2026-01", "1.00"], ["2026-02", "1.00"]]);
    const r = correct("1000.00", "2026-01-10", "2026-03-01", rates);
    expect(r).toMatchObject({ ok: true, corrected: "1020.10", months: 2 });
    const miss = correct("1000.00", "2026-01-10", "2026-04-01", rates);
    expect(miss).toEqual({ ok: false, missing: ["2026-03"], months: 3 });
    expect(correct("500.00", "2026-01-10", "2026-01-20", new Map())).toMatchObject({ ok: true, corrected: "500.00", months: 0 });
    expect(correct("100.00", "2026-01-01", "2026-02-01", new Map([["2026-01", "-0.50"]]))).toMatchObject({ ok: true, corrected: "99.50" });
  });
  it("lê o formato do SGS do BCB e ignora linhas ruins", () => {
    const rows = parseBcbSeries([{ data: "01/08/2026", valor: "0.46" }, { data: "01/09/2026", valor: "0.10" }, { data: "x", valor: "1" }, { data: "01/10/2026", valor: "abc" }, null]);
    expect(rows).toEqual([{ month: "2026-08-01", rate: "0.46" }, { month: "2026-09-01", rate: "0.10" }]);
    expect(parseBcbSeries({ erro: 1 })).toEqual([]);
  });
});

describe("2.0-F5 — processo mais rico", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  let main: { id: string };
  let apenso: { id: string };
  let secret: { id: string };

  beforeAll(async () => {
    A = await makeOrgWithOwner("f5-a");
    B = await makeOrgWithOwner("f5-b");
    lawyer = await addMember(A.org.id, "LAWYER", "f5-adv");
    finance = await addMember(A.org.id, "FINANCE", "f5-fin");
    main = await createCase(A.ctx, { ...base, title: "Principal", claimValue: "10.000,00", distributedAt: "2026-01-10" });
    apenso = await createCase(A.ctx, { ...base, title: "Apenso 1" });
    secret = await createCase(A.ctx, { ...base, title: "Sigiloso", confidential: true });
  });

  it("honorários: registra contratual/êxito, soma o fixo, mostra o financeiro do processo; exige permissões", async () => {
    await addCaseFee(A.ctx, main.id, { kind: "CONTRATUAL", description: "Entrada + parcelas", amount: "3.000,00", percent: "", notes: "" });
    await addCaseFee(A.ctx, main.id, { kind: "EXITO", description: "Êxito", amount: "", percent: "30", notes: "" });
    await expect(addCaseFee(A.ctx, main.id, { kind: "EXITO", description: "Sem valor", amount: "", percent: "", notes: "" })).rejects.toBeDefined();
    await expect(addCaseFee(A.ctx, main.id, { kind: "EXITO", description: "Mais de 100", amount: "", percent: "130", notes: "" })).rejects.toBeDefined();
    await expect(addCaseFee(finance.ctx, main.id, { kind: "OUTRO", description: "Sem acesso ao processo", amount: "10,00", percent: "", notes: "" })).rejects.toBeInstanceOf(ForbiddenError);
    await createEntry(A.ctx, { kind: "RECEIVABLE", type: "FEE", description: "Parcela 1", amount: "1.000,00", issueDate: TODAY, dueDate: TODAY, accountId: "", categoryId: "", costCenterId: "", clientId: "", caseId: main.id, counterparty: "", notes: "", installments: "1" });
    const r = await listCaseFees(A.ctx, main.id);
    expect(r.fees).toHaveLength(2);
    expect(r.contractedFixed).toBe("3000.00");
    expect(r.fees.find((f) => f.kind === "EXITO")!.percent).toBe("30");
    expect(r.finance.receivable.total).toBe("1000.00");
    await expect(listCaseFees(lawyer.ctx, main.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listCaseFees(B.ctx, main.id)).rejects.toBeInstanceOf(NotFoundError);
    await removeCaseFee(A.ctx, main.id, r.fees[0]!.id);
    expect((await listCaseFees(A.ctx, main.id)).contractedFixed).toBe("0.00");
    await expect(removeCaseFee(A.ctx, main.id, r.fees[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("apensos: vale nos dois sentidos, não repete o par, não liga consigo mesmo, esconde sigilosos", async () => {
    await linkCases(A.ctx, main.id, { relatedCaseId: apenso.id, kind: "APENSO", notes: "" });
    await expect(linkCases(A.ctx, apenso.id, { relatedCaseId: main.id, kind: "CONEXO", notes: "" })).rejects.toBeInstanceOf(ConflictError);
    await expect(linkCases(A.ctx, main.id, { relatedCaseId: main.id, kind: "APENSO", notes: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(linkCases(B.ctx, main.id, { relatedCaseId: apenso.id, kind: "APENSO", notes: "" })).rejects.toBeInstanceOf(NotFoundError);
    const fromMain = await listCaseLinks(A.ctx, main.id);
    expect(fromMain.map((l) => [l.role, l.other.title])).toEqual([["Apenso", "Apenso 1"]]);
    const fromApenso = await listCaseLinks(A.ctx, apenso.id);
    expect(fromApenso.map((l) => [l.role, l.other.title])).toEqual([["Principal", "Principal"]]);
    await linkCases(A.ctx, main.id, { relatedCaseId: secret.id, kind: "CONEXO", notes: "" });
    expect((await listCaseLinks(A.ctx, main.id)).map((l) => l.other.title).sort()).toEqual(["Apenso 1", "Sigiloso"]);
    await db.caseMember.create({ data: { organizationId: A.org.id, caseId: main.id, userId: lawyer.ctx.userId, role: "COLLABORATOR" } });
    expect((await listCaseLinks(lawyer.ctx, main.id)).map((l) => l.other.title)).toEqual(["Apenso 1"]);
    await unlinkCases(A.ctx, main.id, fromMain[0]!.id);
    await expect(unlinkCases(A.ctx, main.id, fromMain[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recursos por grau: cria, edita, valida datas e remove", async () => {
    const a = await saveAppeal(A.ctx, main.id, { degree: "SEGUNDO", appealType: "Apelação", number: "0001234-55.2026.8.05.0001", court: "TJBA", filedOn: "2026-03-01", status: "PENDENTE", judgedOn: "", notes: "" });
    await expect(saveAppeal(A.ctx, main.id, { degree: "SEGUNDO", appealType: "Agravo", number: "", court: "", filedOn: "2026-03-10", status: "PROVIDO", judgedOn: "2026-03-01", notes: "" })).rejects.toBeDefined();
    await expect(saveAppeal(A.ctx, main.id, { degree: "SEGUNDO", appealType: "Agravo", number: "", court: "", filedOn: "", status: "PENDENTE", judgedOn: "2026-03-01", notes: "" })).rejects.toBeInstanceOf(ValidationError);
    await saveAppeal(A.ctx, main.id, { degree: "SEGUNDO", appealType: "Apelação", number: "0001234-55.2026.8.05.0001", court: "TJBA", filedOn: "2026-03-01", status: "PROVIDO", judgedOn: "2026-08-20", notes: "Unânime" }, a.id);
    await saveAppeal(A.ctx, main.id, { degree: "SUPERIOR", appealType: "Recurso especial", number: "", court: "STJ", filedOn: "2026-09-01", status: "PENDENTE", judgedOn: "", notes: "" });
    const list = await listAppeals(A.ctx, main.id);
    expect(list.map((x) => [x.degree, x.status])).toEqual([["SEGUNDO", "PROVIDO"], ["SUPERIOR", "PENDENTE"]]);
    await expect(saveAppeal(A.ctx, main.id, { degree: "PRIMEIRO", appealType: "Agravo", number: "", court: "", filedOn: "", status: "PENDENTE", judgedOn: "", notes: "" }, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
    await expect(listAppeals(B.ctx, main.id)).rejects.toBeInstanceOf(NotFoundError);
    await removeAppeal(A.ctx, main.id, list[1]!.id);
    expect(await listAppeals(A.ctx, main.id)).toHaveLength(1);
  });

  it("provisão e valor da causa corrigidos: só calcula com índice completo; índice manual do escritório vale", async () => {
    await setValuation(A.ctx, main.id, { claimBaseDate: "", provisionValue: "2.000,00", provisionBaseDate: "2026-01-05", correctionIndex: "INPC" });
    const v0 = await getValuation(A.ctx, main.id);
    expect(v0.claim?.baseDate).toBe("2026-01-10"); // sem data própria, usa a distribuição
    const months = monthsBetween("2026-01-05", TODAY);
    expect(v0.provision?.result).toMatchObject({ ok: false, missing: months });
    for (const m of months) await setManualIndex(A.ctx, "INPC", m, "1.00");
    const v1 = await getValuation(A.ctx, main.id);
    expect(v1.provision?.result.ok).toBe(true);
    const factor = (1.01 ** months.length) * 2000;
    expect(Number((v1.provision!.result as { corrected: string }).corrected)).toBeCloseTo(factor, 1);
    expect((await indexCoverage(A.ctx)).find((c) => c.series === "INPC")!.months).toBe(months.length);
    expect((await indexCoverage(B.ctx)).find((c) => c.series === "INPC")!.months).toBe(0);
    await expect(setManualIndex(lawyer.ctx, "INPC", "2026-01", "1")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setManualIndex(A.ctx, "XPTO", "2026-01", "1")).rejects.toBeInstanceOf(ValidationError);
    await expect(setManualIndex(A.ctx, "INPC", "2026-01", "1,0")).rejects.toBeInstanceOf(ValidationError);
    await expect(setValuation(A.ctx, main.id, { claimBaseDate: "", provisionValue: "100,00", provisionBaseDate: "", correctionIndex: "INPC" })).rejects.toBeDefined();
    await setValuation(A.ctx, main.id, { claimBaseDate: "", provisionValue: "2.000,00", provisionBaseDate: "2026-01-05", correctionIndex: "" });
    expect((await getValuation(A.ctx, main.id)).provision?.result).toEqual({ ok: false, reason: "Escolha o índice de correção." });
    await expect(getValuation(B.ctx, main.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("índice oficial vem do BCB (com fetch simulado), oficial perde para o manual; falha de uma série não derruba as outras", async () => {
    const fake = async (url: string) => {
      if (url.includes("sgs.433")) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => [{ data: "01/01/2025", valor: "0.50" }, { data: "01/02/2025", valor: "0.25" }] };
    };
    const r = await syncOfficialIndexes(A.ctx, { fetchImpl: fake });
    expect(r.INPC).toEqual({ saved: 2 });
    expect(r.SELIC).toEqual({ saved: 2 });
    expect(r.IPCA!.saved).toBe(0);
    expect(r.IPCA!.error).toContain("503");
    await syncOfficialIndexes(A.ctx, { fetchImpl: fake });
    expect(await db.monetaryIndex.count({ where: { organizationId: null, series: "SELIC" } })).toBe(2);
    const ok = await correctValue(B.ctx, { value: "100.00", series: "SELIC", baseDate: "2025-01-10", targetDate: "2025-03-01" });
    expect(ok).toMatchObject({ ok: true, corrected: "100.75" });
    await setManualIndex(B.ctx, "SELIC", "2025-01", "1.00");
    expect(await correctValue(B.ctx, { value: "100.00", series: "SELIC", baseDate: "2025-01-10", targetDate: "2025-03-01" })).toMatchObject({ corrected: "101.25" });
    await expect(syncOfficialIndexes(lawyer.ctx, { fetchImpl: fake })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("histórico consolidado: junta fontes, ordena do mais novo e respeita permissão de cada fonte", async () => {
    await createTask(A.ctx, { title: "Protocolar contrarrazões", description: "", priority: "NORMAL", status: "TODO", dueDate: addDays(TODAY, 3), assigneeId: "", caseId: main.id, clientId: "" } as never);
    const h = await consolidatedHistory(A.ctx, main.id);
    const sources = new Set(h.map((i) => i.source));
    for (const s of ["Registro", "Recurso", "Tarefa", "Financeiro"]) expect(sources.has(s)).toBe(true);
    expect([...h].sort((a, b) => (a.at < b.at ? 1 : -1))).toEqual(h);
    const hl = await consolidatedHistory(lawyer.ctx, main.id);
    expect(hl.some((i) => i.source === "Financeiro")).toBe(false);
    expect(hl.some((i) => i.source === "Tarefa")).toBe(true);
    await expect(consolidatedHistory(B.ctx, main.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
