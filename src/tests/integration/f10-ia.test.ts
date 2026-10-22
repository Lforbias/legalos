import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { __setAiProviderForTests, type AiProvider } from "@/lib/ai/provider";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { setOrgAiEnabled } from "@/server/services/ai.service";
import { draftPiece, DRAFT_BANNER, researchJurisprudence, saveDraftAsDocument, stripUnverifiedCitations, summarizeConversation } from "@/server/services/ai-tools.service";
import { setExtrasSettings } from "@/server/services/chat-extras.service";
import { createCase } from "@/server/services/case.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const caseBase = { number: "", legacyNumber: "", title: "Caso IA", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
type Call = { system: string; user: string };
const fake = (reply: string, calls: Call[] = []): AiProvider => ({ name: "teste", model: "m", async complete({ system, messages }) { calls.push({ system, user: messages[0]!.content }); return { text: reply, inputTokens: 100, outputTokens: 20, model: "m" }; } });

describe("2.0-F10 — IA aplicada (provedor simulado SÓ nos testes)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let fin: Awaited<ReturnType<typeof addMember>>;
  let caseId: string;
  let convId: string;
  beforeAll(async () => {
    A = await makeOrgWithOwner("f10-a");
    lawyer = await addMember(A.org.id, "LAWYER", "f10-law");
    fin = await addMember(A.org.id, "FINANCE", "f10-fin");
    caseId = (await createCase(A.ctx, { ...caseBase })).id;
    const acc = await db.whatsappAccount.create({ data: { organizationId: A.org.id, label: "t", phoneNumberId: "9900", tokenEnc: "x", createdById: A.owner.id } });
    const conv = await db.whatsappConversation.create({ data: { organizationId: A.org.id, accountId: acc.id, waId: "5511900001111", contactName: "Maria" } });
    convId = conv.id;
    const t0 = Date.now() - 3600_000;
    const rows = [["IN", "Bom dia, preciso do meu CPF 529.982.247-25 no processo"], ["OUT", "Bom dia! Vamos verificar."], ["IN", "Meu e-mail é maria@exemplo.com"], ["OUT", "Anotado."]];
    for (const [i, [d, b]] of rows.entries()) await db.whatsappMessage.create({ data: { organizationId: A.org.id, conversationId: convId, direction: d!, body: b!, status: "SENT", createdAt: new Date(t0 + i * 1000) } });
    await db.whatsappMessage.create({ data: { organizationId: A.org.id, conversationId: convId, direction: "NOTE", body: "NOTA INTERNA SECRETA", status: "SENT" } });
  });
  afterAll(async () => {
    __setAiProviderForTests(undefined);
    await db.whatsappAccount.deleteMany({ where: { organizationId: A.org.id } });
  });

  it("sem chave, ou com IA desligada no escritório, nada é simulado", async () => {
    __setAiProviderForTests(null);
    await expect(researchJurisprudence(lawyer.ctx, { question: "prescrição intercorrente execução fiscal" })).rejects.toBeInstanceOf(ConflictError);
    __setAiProviderForTests(fake("x"));
    await expect(researchJurisprudence(lawyer.ctx, { question: "prescrição intercorrente execução fiscal" })).rejects.toThrow(/desligado/);
    await expect(researchJurisprudence(fin.ctx, { question: "prescrição intercorrente execução fiscal" })).rejects.toBeInstanceOf(ForbiddenError);
    await setOrgAiEnabled(A.ctx, true);
  });

  it("jurisprudência: remove número de processo inventado e sempre avisa que é mapa de pesquisa", async () => {
    const calls: Call[] = [];
    __setAiProviderForTests(fake("Veja o REsp 1234 e o processo 0001234-56.2019.8.26.0100, rel. fulano.", calls));
    const r = await researchJurisprudence(lawyer.ctx, { question: "prescrição intercorrente em execução fiscal" });
    expect(r.answer).not.toContain("0001234-56.2019.8.26.0100");
    expect(r.answer).toContain("não verificado");
    expect(r.removedCitations).toBe(1);
    expect(r.warning).toMatch(/não consulta bases de jurisprudência/);
    expect(calls[0]!.system).toMatch(/NUNCA cite número de processo/);
    await expect(researchJurisprudence(lawyer.ctx, { question: "curta" })).rejects.toBeInstanceOf(ValidationError);
    expect(stripUnverifiedCitations("sem número").removed).toBe(0);
  });

  it("resumo do Chat: chave própria desligada; envia só mensagens, mascara CPF/e-mail e deixa a nota interna de fora", async () => {
    const calls: Call[] = [];
    __setAiProviderForTests(fake("Resumo: cliente pede andamento.", calls));
    await expect(summarizeConversation(lawyer.ctx, convId)).rejects.toThrow(/desligado/);
    await expect(setExtrasSettings(lawyer.ctx, { aiSummaryEnabled: true })).rejects.toBeInstanceOf(ForbiddenError);
    await setExtrasSettings(A.ctx, { aiSummaryEnabled: true });
    const r = await summarizeConversation(lawyer.ctx, convId);
    expect(r.summary).toContain("Resumo");
    expect(r.messages).toBe(4);
    const sent = calls[0]!.user;
    expect(sent).not.toContain("529.982.247-25");
    expect(sent).not.toContain("maria@exemplo.com");
    expect(sent).not.toContain("NOTA INTERNA SECRETA");
    expect(sent).toContain("CLIENTE:");
    await expect(summarizeConversation(fin.ctx, convId)).rejects.toBeInstanceOf(ForbiddenError);
    const usage = await db.aiUsage.count({ where: { organizationId: A.org.id, feature: "chat_summary" } });
    expect(usage).toBe(1);
    const audits = await db.auditLog.findMany({ where: { organizationId: A.org.id, action: "ai.summarize_chat" } });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0])).not.toContain("Resumo");
  });

  it("rascunho de peça: exige instruções e permissão, tem aviso e vira documento .txt do processo", async () => {
    const calls: Call[] = [];
    __setAiProviderForTests(fake("EXCELENTÍSSIMO SENHOR DOUTOR JUIZ ... [PREENCHER: qualificação] ... conforme 0001234-56.2019.8.26.0100 ... pedidos: ...", calls));
    await expect(draftPiece(lawyer.ctx, caseId, { kind: "contestacao", instructions: "curto" })).rejects.toBeInstanceOf(ValidationError);
    await expect(draftPiece(fin.ctx, caseId, { kind: "contestacao", instructions: "Impugnar a cobrança por prescrição e pedir improcedência." })).rejects.toBeInstanceOf(ForbiddenError);
    const d = await draftPiece(lawyer.ctx, caseId, { kind: "contestacao", instructions: "Impugnar a cobrança por prescrição e pedir improcedência." });
    expect(d.banner).toBe(DRAFT_BANNER);
    expect(d.text).not.toContain("0001234-56.2019.8.26.0100");
    expect(calls[0]!.system).toMatch(/Contestação/);
    expect(calls[0]!.system).toMatch(/PREENCHER/);
    const saved = await saveDraftAsDocument(lawyer.ctx, caseId, { title: "Contestação Maria", text: d.text });
    const doc = await db.document.findUniqueOrThrow({ where: { id: saved.id } });
    expect(doc.caseId).toBe(caseId);
    expect(doc.name).toBe("Contestação Maria (minuta IA).txt");
    expect(doc.category).toBe("PETICAO");
    await expect(saveDraftAsDocument(fin.ctx, caseId, { title: "x", text: d.text })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
