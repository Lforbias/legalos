import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { __setAiProviderForTests, AiProviderError, type AiProvider } from "@/lib/ai/provider";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { setOrgAiEnabled } from "@/server/services/ai.service";
import { createCase } from "@/server/services/case.service";
import { decideClassification, getPendingForDocument, listPendingClassifications, parseSuggestion, suggestClassification, suggestForUncategorized } from "@/server/services/doc-classify.service";
import { uploadDocument } from "@/server/services/document.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const base = { legacyNumber: "", number: "", title: "Caso", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const pdf = (tag: string) => ({ name: `${tag}.pdf`, buffer: Buffer.from(`%PDF-1.4\n% ${tag}\n%%EOF`) });

type Call = { system: string; user: string };
function provider(reply: string | (() => never), calls: Call[] = []): AiProvider {
  return {
    name: "teste",
    model: "modelo-teste",
    async complete({ system, messages }) {
      calls.push({ system, user: messages[0]!.content });
      if (typeof reply === "function") reply();
      return { text: reply as string, inputTokens: 50, outputTokens: 10, model: "modelo-teste" };
    },
  };
}
const withText = (organizationId: string, documentId: string, content: string, version = 1) =>
  db.documentText.create({ data: { organizationId, documentId, version, status: "EXTRACTED", method: "test", content, searchText: content.toLowerCase() } });

describe("3.0-F8 — classificação de documentos por IA (sempre com decisão humana)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  let caseId: string;
  let secretCase: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("l3f8-a");
    B = await makeOrgWithOwner("l3f8-b");
    lawyer = await addMember(A.org.id, "LAWYER", "l3f8-adv");
    finance = await addMember(A.org.id, "FINANCE", "l3f8-fin");
    caseId = (await createCase(lawyer.ctx, { ...base, title: "Comum" })).id;
    secretCase = (await createCase(A.ctx, { ...base, title: "Sigiloso", confidential: true })).id;
  });
  afterAll(() => __setAiProviderForTests(undefined));

  it("interpreta a resposta da IA com segurança: categoria inválida, confiança fora da faixa e lixo viram 'OUTROS' sem confiança", () => {
    expect(parseSuggestion('{"category":"CONTRATO","confidence":88,"reason":"Cláusulas e partes"}')).toEqual({ category: "CONTRATO", confidence: 88, reason: "Cláusulas e partes" });
    expect(parseSuggestion('Claro! ```json\n{"category":"PETICAO","confidence":150}\n```').confidence).toBe(100);
    expect(parseSuggestion('{"category":"INVENTADA","confidence":99}')).toMatchObject({ category: "OUTROS", confidence: 0 });
    expect(parseSuggestion("não sei")).toMatchObject({ category: "OUTROS", confidence: 0 });
    expect(parseSuggestion('{"category":"CONTRATO","confidence":-5}').confidence).toBe(0);
  });

  it("exige chave, IA ligada no escritório, permissão e texto extraído; nada é enviado antes disso", async () => {
    const doc = await uploadDocument(lawyer.ctx, { caseId }, pdf("sem-ia"));
    const calls: Call[] = [];
    __setAiProviderForTests(null);
    await expect(suggestClassification(lawyer.ctx, doc.id)).rejects.toThrow(/chave do provedor/);
    __setAiProviderForTests(provider('{"category":"CONTRATO","confidence":90}', calls));
    await expect(suggestClassification(lawyer.ctx, doc.id)).rejects.toThrow(/desligado neste escritório/);
    await setOrgAiEnabled(A.ctx, true);
    await expect(suggestClassification(finance.ctx, doc.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(suggestClassification(lawyer.ctx, doc.id)).rejects.toThrow(/Extraia o texto/);
    expect(calls).toHaveLength(0);
    await expect(suggestClassification(B.ctx, doc.id)).rejects.toThrow(/desligado neste escritório/); // B nem ligou a IA (a de A não vale para B)
  });

  it("sugere sem alterar o documento; mascara dados pessoais; registra consumo; reaproveita a pendente", async () => {
    const calls: Call[] = [];
    __setAiProviderForTests(provider('{"category":"PROCURACAO","confidence":92,"reason":"Outorga poderes ao advogado"}', calls));
    const doc = await uploadDocument(lawyer.ctx, { caseId }, pdf("procuracao-maria"));
    await withText(A.org.id, doc.id, "PROCURAÇÃO. Outorgante Maria, CPF 529.982.247-25, e-mail maria@exemplo.com, outorga poderes.");
    const s = await suggestClassification(lawyer.ctx, doc.id);
    expect(s).toMatchObject({ suggested: "PROCURACAO", confidence: 92, status: "PENDING" });
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).category).toBeNull(); // nada mudou
    expect(calls[0]!.user).toContain("[CPF]");
    expect(calls[0]!.user).toContain("[E-MAIL]");
    expect(calls[0]!.user).not.toContain("529.982.247-25");
    expect(calls[0]!.user).not.toContain("maria@exemplo.com");
    const again = await suggestClassification(lawyer.ctx, doc.id);
    expect(again.id).toBe(s.id);
    expect(calls).toHaveLength(1); // não pagou duas vezes
    expect(await db.aiUsage.count({ where: { organizationId: A.org.id, feature: "doc_classify" } })).toBeGreaterThanOrEqual(1);
    expect((await getPendingForDocument(lawyer.ctx, doc.id))?.id).toBe(s.id);
  });

  it("aceitar aplica a categoria; corrigir aplica a escolhida; decidir de novo recusa; categoria inválida recusada", async () => {
    __setAiProviderForTests(provider('{"category":"CONTRATO","confidence":60}'));
    const d1 = await uploadDocument(lawyer.ctx, { caseId }, pdf("contrato-x"));
    const d2 = await uploadDocument(lawyer.ctx, { caseId }, pdf("recibo-y"));
    await withText(A.org.id, d1.id, "Contrato de prestação de serviços entre as partes.");
    await withText(A.org.id, d2.id, "Recibo de pagamento.");
    const s1 = await suggestClassification(lawyer.ctx, d1.id);
    const s2 = await suggestClassification(lawyer.ctx, d2.id);
    await expect(decideClassification(finance.ctx, s1.id, { action: "accept" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(decideClassification(B.ctx, s1.id, { action: "accept" })).rejects.toBeInstanceOf(NotFoundError);
    await decideClassification(lawyer.ctx, s1.id, { action: "accept" });
    expect((await db.document.findUniqueOrThrow({ where: { id: d1.id } })).category).toBe("CONTRATO");
    await expect(decideClassification(lawyer.ctx, s2.id, { action: "correct", category: "NAO_EXISTE" })).rejects.toBeInstanceOf(ValidationError);
    await decideClassification(lawyer.ctx, s2.id, { action: "correct", category: "COMPROVANTE" });
    expect((await db.document.findUniqueOrThrow({ where: { id: d2.id } })).category).toBe("COMPROVANTE");
    expect(await db.documentClassification.findUniqueOrThrow({ where: { id: s2.id } })).toMatchObject({ status: "CORRECTED", suggested: "CONTRATO", finalCategory: "COMPROVANTE" });
    await expect(decideClassification(lawyer.ctx, s1.id, { action: "accept" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("aprende com o escritório: decisões anteriores viram exemplos no pedido seguinte (só do próprio escritório)", async () => {
    const calls: Call[] = [];
    __setAiProviderForTests(provider('{"category":"OUTROS","confidence":10}', calls));
    const d = await uploadDocument(lawyer.ctx, { caseId }, pdf("novo-documento"));
    await withText(A.org.id, d.id, "Texto qualquer.");
    await suggestClassification(lawyer.ctx, d.id);
    expect(calls[0]!.user).toContain("<exemplos>");
    expect(calls[0]!.user).toContain('"recibo-y.pdf" → COMPROVANTE');
    expect(calls[0]!.user).toContain('"contrato-x.pdf" → CONTRATO');
    // B: sem exemplos de A
    await setOrgAiEnabled(B.ctx, true);
    const calls2: Call[] = [];
    __setAiProviderForTests(provider('{"category":"OUTROS","confidence":10}', calls2));
    const bCase = await createCase(B.ctx, { ...base, title: "Caso B" });
    const bd = await uploadDocument(B.ctx, { caseId: bCase.id }, pdf("doc-b"));
    await withText(B.org.id, bd.id, "Texto de B.");
    await suggestClassification(B.ctx, bd.id);
    expect(calls2[0]!.user).not.toContain("<exemplos>");
    expect(calls2[0]!.user).not.toContain("recibo-y");
  });

  it("falha do provedor vira erro claro e não deixa sugestão; descartar não altera o documento", async () => {
    __setAiProviderForTests(provider(() => { throw new AiProviderError("Provedor fora do ar."); }));
    const d = await uploadDocument(lawyer.ctx, { caseId }, pdf("falha"));
    await withText(A.org.id, d.id, "Texto.");
    await expect(suggestClassification(lawyer.ctx, d.id)).rejects.toThrow(/fora do ar/);
    expect(await db.documentClassification.count({ where: { documentId: d.id } })).toBe(0);
    __setAiProviderForTests(provider('{"category":"DECISAO","confidence":70}'));
    const s = await suggestClassification(lawyer.ctx, d.id);
    await decideClassification(lawyer.ctx, s.id, { action: "dismiss" });
    expect((await db.document.findUniqueOrThrow({ where: { id: d.id } })).category).toBeNull();
    expect(await db.documentClassification.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ status: "DISMISSED" });
  });

  it("fila: sigilo respeitado (quem não vê o processo não vê a sugestão) e lote só pega documentos sem categoria", async () => {
    __setAiProviderForTests(provider('{"category":"PETICAO","confidence":80}'));
    const sec = await uploadDocument(A.ctx, { caseId: secretCase }, pdf("sigiloso"));
    await withText(A.org.id, sec.id, "Peça sigilosa.");
    const ss = await suggestClassification(A.ctx, sec.id);
    expect((await listPendingClassifications(A.ctx)).map((x) => x.id)).toContain(ss.id);
    expect((await listPendingClassifications(lawyer.ctx)).map((x) => x.id)).not.toContain(ss.id);
    expect(await listPendingClassifications(B.ctx)).not.toContainEqual(expect.objectContaining({ id: ss.id }));
    await decideClassification(A.ctx, ss.id, { action: "dismiss" });
    const lote = await uploadDocument(lawyer.ctx, { caseId }, pdf("lote-1"));
    await withText(A.org.id, lote.id, "Algo para o lote.");
    const r = await suggestForUncategorized(lawyer.ctx, 3);
    expect(r.suggested).toBeGreaterThanOrEqual(1);
    expect(r.stoppedBecause).toBeNull();
    expect(await db.documentClassification.count({ where: { documentId: lote.id, status: "PENDING" } })).toBe(1);
  });
});
