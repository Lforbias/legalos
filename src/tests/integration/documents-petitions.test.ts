import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { createCase } from "@/server/services/case.service";
import { createClient } from "@/server/services/client.service";
import { addDocumentVersion, deleteDocument, getDocument, getDocumentForDownload, listRepository, updateDocumentMeta, uploadDocument } from "@/server/services/document.service";
import { addAttachment, approvePetition, cancelPetition, createPetition, getPetition, moveAttachment, removeAttachment, setAttachmentClassification, listPetitions, requestReview, returnPetition, submitPetition, updatePetition } from "@/server/services/petition.service";
import { createSnippet, deleteSnippet, listSnippets, updateSnippet } from "@/server/services/snippet.service";
import { extractText } from "@/lib/ocr/extract";
import { getObjectStream } from "@/lib/storage/local-storage";
import { createTemplate, deleteTemplate, generateFromTemplate, getTemplate, listTemplates, updateTemplate } from "@/server/services/template.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag}\n%%EOF`);
const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };

describe("documentos, modelos e peticionamento (Fase 5)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let lawyer2: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  let caseA: { id: string };
  let secret: { id: string };

  beforeAll(async () => {
    A = await makeOrgWithOwner("f5-A");
    B = await makeOrgWithOwner("f5-B");
    lawyer = await addMember(A.org.id, "LAWYER", "f5-l1");
    lawyer2 = await addMember(A.org.id, "LAWYER", "f5-l2");
    assistant = await addMember(A.org.id, "ASSISTANT", "f5-as");
    finance = await addMember(A.org.id, "FINANCE", "f5-fin");
    caseA = await createCase(lawyer.ctx, { ...caseBase, title: "Processo A" });
    secret = await createCase(lawyer.ctx, { ...caseBase, title: "Processo sigiloso", confidential: true });
  });

  describe("versões de documentos", () => {
    it("cria a versão 1 no envio e novas versões preservando os arquivos anteriores", async () => {
      const doc = await uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: "peticao.pdf", buffer: pdf("v1") }, { category: "PETICAO" });
      expect(doc.currentVersion).toBe(1);
      const r = await addDocumentVersion(lawyer.ctx, doc.id, { name: "peticao-revisada.pdf", buffer: pdf("v2") }, "Ajustes de forma");
      expect(r.version).toBe(2);
      const { doc: after, versions } = await getDocument(lawyer.ctx, doc.id);
      expect(after.currentVersion).toBe(2);
      expect(versions.map((v) => v.version)).toEqual([2, 1]);
      expect(versions[0]?.note).toBe("Ajustes de forma");
      const v1 = await getDocumentForDownload(lawyer.ctx, doc.id, 1);
      const cur = await getDocumentForDownload(lawyer.ctx, doc.id);
      expect(v1.name).toBe("peticao.pdf");
      expect(cur.name).toBe("peticao-revisada.pdf");
      expect(v1.storageKey).not.toBe(cur.storageKey);
      await expect(getDocumentForDownload(lawyer.ctx, doc.id, 9)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejeita arquivo inválido como nova versão e mantém a versão atual", async () => {
      const doc = await uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: "a.pdf", buffer: pdf("a") });
      await expect(addDocumentVersion(lawyer.ctx, doc.id, { name: "falso.pdf", buffer: Buffer.from("MZ") })).rejects.toBeInstanceOf(ValidationError);
      expect((await getDocument(lawyer.ctx, doc.id)).doc.currentVersion).toBe(1);
    });

    it("duas versões simultâneas: uma vence, a outra recebe conflito (sem número duplicado)", async () => {
      const doc = await uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: "c.pdf", buffer: pdf("c") });
      const res = await Promise.allSettled([
        addDocumentVersion(lawyer.ctx, doc.id, { name: "c2.pdf", buffer: pdf("c2") }),
        addDocumentVersion(lawyer.ctx, doc.id, { name: "c3.pdf", buffer: pdf("c3") }),
      ]);
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ConflictError);
      expect(await db.documentVersion.count({ where: { documentId: doc.id } })).toBe(2);
    });

    it("isola escritórios e respeita sigilo e permissões", async () => {
      const doc = await uploadDocument(lawyer.ctx, { caseId: secret.id }, { name: "sigilo.pdf", buffer: pdf("s") });
      await expect(getDocument(B.ctx, doc.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(addDocumentVersion(B.ctx, doc.id, { name: "x.pdf", buffer: pdf("x") })).rejects.toBeInstanceOf(NotFoundError);
      await expect(getDocumentForDownload(B.ctx, doc.id, 1)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getDocument(lawyer2.ctx, doc.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getDocumentForDownload(lawyer2.ctx, doc.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listRepository(lawyer2.ctx)).items.map((d) => d.id)).not.toContain(doc.id);
      expect((await listRepository(lawyer.ctx)).items.map((d) => d.id)).toContain(doc.id);
      expect((await listRepository(B.ctx)).items.map((d) => d.id)).not.toContain(doc.id);
      await expect(getDocument(finance.ctx, doc.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("repositório filtra por nome e categoria; metadados validados", async () => {
      const doc = await uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: "Procuração João.pdf", buffer: pdf("p") }, { category: "PROCURACAO" });
      const byName = await listRepository(lawyer.ctx, { q: "procuração joão" });
      expect(byName.items.map((d) => d.id)).toContain(doc.id);
      expect((await listRepository(lawyer.ctx, { category: "CONTRATO" })).items.map((d) => d.id)).not.toContain(doc.id);
      await updateDocumentMeta(lawyer.ctx, doc.id, { name: "Procuração ad judicia.pdf", category: "PROCURACAO", description: "Original assinada" });
      expect((await getDocument(lawyer.ctx, doc.id)).doc.description).toBe("Original assinada");
      await expect(updateDocumentMeta(lawyer.ctx, doc.id, { name: "x.pdf", category: "INVENTADA" })).rejects.toBeInstanceOf(ValidationError);
      await expect(uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: "z.pdf", buffer: pdf("z") }, { category: "INVENTADA" })).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("modelos", () => {
    it("exige permissão para gerenciar; assistente só usa modelos ativos", async () => {
      await expect(createTemplate(assistant.ctx, { name: "Modelo X", body: "Texto" })).rejects.toBeInstanceOf(ForbiddenError);
      const t = await createTemplate(lawyer.ctx, { name: "Modelo oculto", body: "Texto {{cliente.nome}}", active: false });
      expect((await listTemplates(assistant.ctx)).map((x) => x.id)).not.toContain(t.id);
      expect((await listTemplates(lawyer.ctx)).map((x) => x.id)).toContain(t.id);
      await expect(getTemplate(assistant.ctx, t.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listTemplates(finance.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("rejeita campos desconhecidos, corpo vazio e nome duplicado no escritório (não em outro)", async () => {
      await expect(createTemplate(lawyer.ctx, { name: "Com erro", body: "{{cliente.nmoe}}" })).rejects.toBeInstanceOf(ValidationError);
      await expect(createTemplate(lawyer.ctx, { name: "Vazio", body: "   " })).rejects.toBeInstanceOf(ValidationError);
      await createTemplate(lawyer.ctx, { name: "Nome único", body: "a" });
      await expect(createTemplate(lawyer2.ctx, { name: "nome único", body: "b" })).rejects.toBeInstanceOf(ValidationError);
      await expect(createTemplate(B.ctx, { name: "Nome único", body: "c" })).resolves.toBeTruthy();
    });

    it("não acessa nem altera modelos de outro escritório", async () => {
      const t = await createTemplate(A.ctx, { name: "Só do A", body: "texto" });
      await expect(getTemplate(B.ctx, t.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(updateTemplate(B.ctx, t.id, { name: "Invadido", body: "x" })).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteTemplate(B.ctx, t.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(generateFromTemplate(B.ctx, t.id, { caseId: caseA.id }, "x")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("gera .docx do processo com dados do cliente; campos ausentes ficam marcados e informados", async () => {
      const client = await createClient(lawyer.ctx, { type: "PERSON", status: "ACTIVE", name: "Maria da Silva", tradeName: "", document: "", email: "maria@example.test", phone: "", birthDate: "", tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "" });
      const c = await createCase(lawyer.ctx, { ...caseBase, title: "Ação de Maria", clientId: client.id });
      const t = await createTemplate(lawyer.ctx, { name: "Procuração teste", category: "PROCURACAO", body: "# PROCURAÇÃO\n\n{{cliente.nome}} ({{cliente.email}}), CPF {{cliente.documento}}, processo {{processo.titulo}} em {{processo.tribunal}}. {{data.hoje}}" });
      const res = await generateFromTemplate(lawyer.ctx, t.id, { caseId: c.id }, "Procuração Maria");
      expect(res.missing).toEqual(["CPF/CNPJ do cliente"]);
      const { doc, versions } = await getDocument(lawyer.ctx, res.id);
      expect(doc.name).toBe("Procuração Maria.docx");
      expect(doc.category).toBe("PROCURACAO");
      expect(doc.templateId).toBe(t.id);
      expect(versions[0]?.source).toBe("TEMPLATE");
      const events = await db.caseEvent.findMany({ where: { caseId: c.id } });
      expect(events.some((e) => e.title.includes("gerado de modelo"))).toBe(true);
      expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "document.generate", resourceId: res.id } })).toBe(1);
    });

    it("não gera documento em processo sigiloso sem acesso nem em modelo desativado", async () => {
      const t = await createTemplate(lawyer.ctx, { name: "Para sigilo", body: "{{processo.titulo}}" });
      await expect(generateFromTemplate(lawyer2.ctx, t.id, { caseId: secret.id }, "x")).rejects.toBeInstanceOf(NotFoundError);
      await updateTemplate(lawyer.ctx, t.id, { name: "Para sigilo", body: "{{processo.titulo}}", active: false });
      await expect(generateFromTemplate(lawyer.ctx, t.id, { caseId: caseA.id }, "x")).rejects.toBeInstanceOf(ConflictError);
      await expect(generateFromTemplate(assistant.ctx, t.id, { caseId: caseA.id }, "x")).rejects.toBeInstanceOf(NotFoundError);
      await expect(generateFromTemplate(lawyer.ctx, t.id, {}, "x")).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("autotextos", () => {
    it("permissões, validações, código único (reutilizável após excluir) e isolamento", async () => {
      const base = { slug: "pedidos-finais", name: "Pedidos finais", body: "Requer a procedência para {{cliente.nome}}." };
      await expect(createSnippet(assistant.ctx, base)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createSnippet(lawyer.ctx, { ...base, slug: "Pedidos-Finais" })).resolves.toMatchObject({ slug: "pedidos-finais" }); // maiúsculas viram minúsculas
      await expect(createSnippet(lawyer.ctx, { ...base, slug: "tem espaço" })).rejects.toBeInstanceOf(ValidationError);
      await expect(createSnippet(lawyer.ctx, { ...base, slug: "outro", body: "   " })).rejects.toBeInstanceOf(ValidationError);
      await expect(createSnippet(lawyer.ctx, { ...base, slug: "outro", body: "{{cliente.nmoe}}" })).rejects.toBeInstanceOf(ValidationError);
      await expect(createSnippet(lawyer.ctx, { ...base, slug: "outro", body: "veja {{autotexto.pedidos-finais}}" })).rejects.toThrow(/dentro de autotexto/);
      await expect(createSnippet(lawyer2.ctx, base)).rejects.toThrow(/mesmo código|Já existe/); // código repetido no escritório
      const mine = (await listSnippets(lawyer.ctx)).find((x) => x.slug === "pedidos-finais")!;
      await expect(createSnippet(B.ctx, base)).resolves.toBeTruthy(); // outro escritório pode usar o mesmo código
      await expect(updateSnippet(B.ctx, mine.id, { ...base, name: "Invadido" })).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteSnippet(B.ctx, mine.id)).rejects.toBeInstanceOf(NotFoundError);
      await deleteSnippet(lawyer.ctx, mine.id);
      await expect(createSnippet(lawyer.ctx, base)).resolves.toBeTruthy(); // código liberado após excluir
      expect((await listSnippets(assistant.ctx)).every((x) => x.active)).toBe(true);
      await expect(listSnippets(finance.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("modelo só aceita autotexto existente; ao gerar, o trecho entra e seus campos são mesclados; desativado/excluído vira aviso", async () => {
      await createSnippet(lawyer.ctx, { slug: "fecho-padrao", name: "Fecho padrão", body: "Termos em que, pede deferimento. {{advogado.nome}}, {{cliente.nome}}, CPF {{cliente.documento}}." });
      await expect(createTemplate(lawyer.ctx, { name: "Modelo com autotexto errado", body: "{{autotexto.nao-existe}}" })).rejects.toBeInstanceOf(ValidationError);
      const client = await createClient(lawyer.ctx, { type: "PERSON", status: "ACTIVE", name: "Joana Autotexto", tradeName: "", document: "", email: "", phone: "", birthDate: "", tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "" });
      const c = await createCase(lawyer.ctx, { ...caseBase, title: "Ação da Joana", clientId: client.id });
      const t = await createTemplate(lawyer.ctx, { name: "Petição com fecho", body: "# PETIÇÃO\n\nProcesso {{processo.titulo}}.\n\n{{autotexto.fecho-padrao}}" });
      const res = await generateFromTemplate(lawyer.ctx, t.id, { caseId: c.id }, "Petição Joana");
      expect(res.missing).toEqual(["CPF/CNPJ do cliente"]); // o campo do autotexto também é conferido
      const dl = await getDocumentForDownload(lawyer.ctx, res.id);
      const buf = Buffer.from(await new Response(await getObjectStream(dl.storageKey)).arrayBuffer());
      const text = (await extractText(buf, "docx")).text;
      expect(text).toContain("Termos em que, pede deferimento.");
      expect(text).toContain("Joana Autotexto");
      expect(text).toContain("[PREENCHER: CPF/CNPJ do cliente]");
      expect(text).not.toContain("{{");
      // desativar o autotexto: o modelo continua existindo, mas o documento avisa
      const sn = (await listSnippets(lawyer.ctx)).find((x) => x.slug === "fecho-padrao")!;
      await updateSnippet(lawyer.ctx, sn.id, { slug: "fecho-padrao", name: "Fecho padrão", body: "x", active: false });
      const res2 = await generateFromTemplate(lawyer.ctx, t.id, { caseId: c.id }, "Petição Joana 2");
      const dl2 = await getDocumentForDownload(lawyer.ctx, res2.id);
      const buf2 = Buffer.from(await new Response(await getObjectStream(dl2.storageKey)).arrayBuffer());
      expect((await extractText(buf2, "docx")).text).toContain("[AUTOTEXTO NÃO ENCONTRADO: fecho-padrao]");
    });
  });

  describe("peticionamento", () => {
    async function draft(title = "Contestação") {
      const doc = await uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: `${title}.pdf`, buffer: pdf(`${title}-${Math.random()}`) });
      const p = await createPetition(assistant.ctx, { caseId: caseA.id, documentId: doc.id, title });
      return { doc, p };
    }

    it("fluxo completo: rascunho → revisão → aprovação → envio simulado, com trilha e marcação de demonstração", async () => {
      const { p } = await draft("Fluxo completo");
      expect(p.status).toBe("DRAFT");
      await requestReview(assistant.ctx, p.id);
      await expect(approvePetition(assistant.ctx, p.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(submitPetition(lawyer.ctx, p.id)).rejects.toBeInstanceOf(ConflictError);
      await approvePetition(lawyer.ctx, p.id);
      const res = await submitPetition(lawyer.ctx, p.id);
      expect(res.isDemo).toBe(true);
      expect(res.protocol.startsWith("DEMO-")).toBe(true);
      const { petition } = await getPetition(lawyer.ctx, p.id);
      expect(petition.status).toBe("SUBMITTED");
      expect(petition.isDemo).toBe(true);
      expect(petition.receipt).toContain("NENHUM PROTOCOLO REAL");
      const events = (await db.caseEvent.findMany({ where: { caseId: caseA.id } })).map((e) => e.title);
      expect(events.some((t) => t.includes("DEMONSTRAÇÃO"))).toBe(true);
      await expect(submitPetition(lawyer.ctx, p.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(cancelPetition(lawyer.ctx, p.id)).rejects.toBeInstanceOf(ConflictError);
      expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "petition.submit", resourceId: p.id } })).toBe(1);
    });

    it("duplo clique no envio: apenas um envio é realizado", async () => {
      const { p } = await draft("Duplo envio");
      await requestReview(assistant.ctx, p.id);
      await approvePetition(lawyer.ctx, p.id);
      const res = await Promise.allSettled([submitPetition(lawyer.ctx, p.id), submitPetition(lawyer.ctx, p.id)]);
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "petition.submit", resourceId: p.id } })).toBe(1);
    });

    it("nova versão do documento derruba revisão/aprovação e impede enviar a versão errada", async () => {
      const { doc, p } = await draft("Versão muda");
      await requestReview(assistant.ctx, p.id);
      await approvePetition(lawyer.ctx, p.id);
      await addDocumentVersion(lawyer.ctx, doc.id, { name: "novo.pdf", buffer: pdf("novo") });
      const { petition, stale } = await getPetition(lawyer.ctx, p.id);
      expect(petition.status).toBe("DRAFT");
      expect(petition.reviewNote).toContain("versão 2");
      expect(stale).toBe(true);
      await expect(approvePetition(lawyer.ctx, p.id)).rejects.toBeInstanceOf(ConflictError);
      await requestReview(assistant.ctx, p.id);
      await approvePetition(lawyer.ctx, p.id);
      expect((await getPetition(lawyer.ctx, p.id)).petition.documentVersion).toBe(2);
    });

    it("devolução exige motivo; documento vinculado a petição ativa não pode ser excluído", async () => {
      const { doc, p } = await draft("Devolver");
      await requestReview(assistant.ctx, p.id);
      await expect(returnPetition(lawyer.ctx, p.id, " ")).rejects.toBeInstanceOf(ValidationError);
      await expect(deleteDocument(lawyer.ctx, doc.id)).rejects.toBeInstanceOf(ConflictError);
      await returnPetition(lawyer.ctx, p.id, "Corrigir a qualificação das partes");
      const { petition } = await getPetition(lawyer.ctx, p.id);
      expect(petition.status).toBe("DRAFT");
      expect(petition.reviewNote).toBe("Corrigir a qualificação das partes");
      await updatePetition(assistant.ctx, p.id, { caseId: caseA.id, documentId: doc.id, title: "Devolver (ajustada)", kind: "Contestação" });
      await cancelPetition(assistant.ctx, p.id);
      await expect(deleteDocument(lawyer.ctx, doc.id)).resolves.toBeUndefined();
    });

    it("documento precisa ser do mesmo processo; processo sigiloso e outro escritório são inacessíveis", async () => {
      const other = await createCase(lawyer.ctx, { ...caseBase, title: "Outro processo" });
      const docOther = await uploadDocument(lawyer.ctx, { caseId: other.id }, { name: "o.pdf", buffer: pdf("o") });
      await expect(createPetition(lawyer.ctx, { caseId: caseA.id, documentId: docOther.id, title: "Cruzada" })).rejects.toBeInstanceOf(ValidationError);
      const docSecret = await uploadDocument(lawyer.ctx, { caseId: secret.id }, { name: "s2.pdf", buffer: pdf("s2") });
      const ps = await createPetition(lawyer.ctx, { caseId: secret.id, documentId: docSecret.id, title: "Sigilosa" });
      await expect(getPetition(lawyer2.ctx, ps.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(requestReview(lawyer2.ctx, ps.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(createPetition(lawyer2.ctx, { caseId: secret.id, documentId: docSecret.id, title: "Invasão" })).rejects.toBeInstanceOf(NotFoundError);
      expect((await listPetitions(lawyer2.ctx)).items.map((x) => x.id)).not.toContain(ps.id);
      await expect(getPetition(B.ctx, ps.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(approvePetition(B.ctx, ps.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listPetitions(finance.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("revisores são notificados ao enviar para revisão (sem notificar o autor)", async () => {
      const { p } = await draft("Notificação");
      await requestReview(assistant.ctx, p.id);
      const n = await db.notification.findMany({ where: { organizationId: A.org.id, kind: "petition.review", link: `/peticoes/${p.id}` } });
      const users = n.map((x) => x.userId);
      expect(users).toContain(lawyer.user.id);
      expect(users).not.toContain(assistant.user.id);
    });

    it("anexos: várias peças classificadas, ordem, versão travada na revisão, envio com a lista e proteção contra exclusão", async () => {
      const { p, doc } = await draft("Com anexos");
      const procuracao = await uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: "procuracao.pdf", buffer: pdf("proc") });
      const rg = await uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: "rg.pdf", buffer: pdf("rg") });
      const otherCase = await createCase(lawyer.ctx, { ...caseBase, title: "Outro processo" });
      const foreign = await uploadDocument(lawyer.ctx, { caseId: otherCase.id }, { name: "alheio.pdf", buffer: pdf("alheio") });
      // validações
      await expect(addAttachment(assistant.ctx, p.id, { documentId: doc.id, classification: "OUTROS" })).rejects.toBeInstanceOf(ValidationError); // é o principal
      await expect(addAttachment(assistant.ctx, p.id, { documentId: foreign.id, classification: "OUTROS" })).rejects.toBeInstanceOf(ValidationError); // outro processo
      await expect(addAttachment(assistant.ctx, p.id, { documentId: rg.id, classification: "INVENTADA" })).rejects.toBeInstanceOf(ValidationError);
      await expect(addAttachment(finance.ctx, p.id, { documentId: rg.id, classification: "OUTROS" })).rejects.toBeInstanceOf(ForbiddenError);
      await addAttachment(assistant.ctx, p.id, { documentId: procuracao.id, classification: "PROCURACAO" });
      await addAttachment(assistant.ctx, p.id, { documentId: rg.id, classification: "OUTROS" });
      await expect(addAttachment(assistant.ctx, p.id, { documentId: rg.id, classification: "OUTROS" })).rejects.toBeInstanceOf(ConflictError); // repetido
      let atts = (await getPetition(lawyer.ctx, p.id)).attachments;
      expect(atts.map((a) => a.document.name)).toEqual(["procuracao.pdf", "rg.pdf"]);
      // reclassificar e reordenar
      await setAttachmentClassification(assistant.ctx, p.id, atts[1]!.id, "DOCUMENTO_PESSOAL");
      await moveAttachment(assistant.ctx, p.id, atts[1]!.id, "up");
      atts = (await getPetition(lawyer.ctx, p.id)).attachments;
      expect(atts.map((a) => [a.document.name, a.classification])).toEqual([["rg.pdf", "DOCUMENTO_PESSOAL"], ["procuracao.pdf", "PROCURACAO"]]);
      // outro escritório não alcança
      await expect(addAttachment(B.ctx, p.id, { documentId: rg.id, classification: "OUTROS" })).rejects.toBeInstanceOf(NotFoundError);
      // revisão trava as versões; nova versão do anexo derruba a aprovação
      await requestReview(assistant.ctx, p.id);
      await expect(addAttachment(assistant.ctx, p.id, { documentId: rg.id, classification: "OUTROS" })).rejects.toBeInstanceOf(ConflictError);
      await expect(removeAttachment(assistant.ctx, p.id, atts[0]!.id)).rejects.toBeInstanceOf(ConflictError);
      await addDocumentVersion(lawyer.ctx, procuracao.id, { name: "procuracao-2.pdf", buffer: pdf("proc2") });
      await expect(approvePetition(lawyer.ctx, p.id)).rejects.toThrow(/anexo/);
      await returnPetition(lawyer.ctx, p.id, "Atualizar a procuração");
      await requestReview(assistant.ctx, p.id);
      expect((await getPetition(lawyer.ctx, p.id)).attachments.every((a) => !a.stale)).toBe(true);
      await approvePetition(lawyer.ctx, p.id);
      await expect(deleteDocument(lawyer.ctx, rg.id)).rejects.toThrow(/petição em andamento/);
      await submitPetition(lawyer.ctx, p.id);
      const done = (await getPetition(lawyer.ctx, p.id)).petition;
      expect(done.receipt).toContain("Anexos (2)");
      expect(done.receipt).toMatch(/1\. \[DOCUMENTO_PESSOAL\] rg\.pdf/);
      expect(done.receipt).toMatch(/2\. \[PROCURACAO\] procuracao-2\.pdf/);
    });

    it("anexo removido dos documentos impede a revisão e o limite de 20 anexos é respeitado", async () => {
      const { p } = await draft("Limites de anexos");
      const gone = await uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: "sumiu.pdf", buffer: pdf("sumiu") });
      await addAttachment(assistant.ctx, p.id, { documentId: gone.id, classification: "OUTROS" });
      await deleteDocument(lawyer.ctx, gone.id);
      await expect(requestReview(assistant.ctx, p.id)).rejects.toThrow(/foi removido/);
      const atts = (await getPetition(lawyer.ctx, p.id)).attachments;
      await removeAttachment(assistant.ctx, p.id, atts[0]!.id);
      for (let i = 0; i < 20; i++) {
        const d = await uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: `anexo-${i}.pdf`, buffer: pdf(`a${i}-${Math.random()}`) });
        await addAttachment(assistant.ctx, p.id, { documentId: d.id, classification: "PROVA_DOCUMENTAL" });
      }
      const extra = await uploadDocument(lawyer.ctx, { caseId: caseA.id }, { name: "21.pdf", buffer: pdf("21") });
      await expect(addAttachment(assistant.ctx, p.id, { documentId: extra.id, classification: "OUTROS" })).rejects.toThrow(/Limite de anexos/);
    });
  });
});
