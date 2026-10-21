import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { getObjectStream } from "@/lib/storage/local-storage";
import type { CreateCaseInput } from "@/modules/cases/schemas";
import { addCaseMember, addParty, createCase } from "@/server/services/case.service";
import { getDocumentForDownload } from "@/server/services/document.service";
import { createLetterhead, deleteLetterhead, getLogo, listLetterheads, resolveLetterhead, updateLetterhead } from "@/server/services/letterhead.service";
import { createTemplate, generateFromTemplate, previewTemplatePdf } from "@/server/services/template.service";
import { db } from "@/lib/db/client";
import { addMember, makeOrgWithOwner } from "./helpers";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP8z8Dwn4EBAAkEAQDrUbkRAAAAAElFTkSuQmCC";
const caseBase: CreateCaseInput = {
  number: "", legacyNumber: "ORIGEM-77", title: "Ação de teste", area: "Cível", court: "TJBA", courtUnit: "1ª Vara", courtState: "", subject: "", claimValue: "",
  status: "ACTIVE", phase: "", distributedAt: "2026-03-05", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF",
};
const stream = async (key: string) => Buffer.from(await new Response(await getObjectStream(key)).arrayBuffer());

describe("3.0-F3 — timbrados, novas variáveis e prévia em PDF", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;
  let caseId: string;
  let tplId: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("l3f3-a");
    B = await makeOrgWithOwner("l3f3-b");
    lawyer = await addMember(A.org.id, "LAWYER", "l3f3-adv");
    assistant = await addMember(A.org.id, "ASSISTANT", "l3f3-ass");
    finance = await addMember(A.org.id, "FINANCE", "l3f3-fin");
    await db.organization.update({ where: { id: A.org.id }, data: { document: "11222333000181" } });
    const c = await createCase(A.ctx, caseBase);
    caseId = c.id;
    await addCaseMember(A.ctx, caseId, lawyer.user.id, "RESPONSIBLE");
    await addParty(A.ctx, caseId, { role: "PLAINTIFF", clientId: "", name: "Maria Autora", document: "", lawyerName: "" });
    await addParty(A.ctx, caseId, { role: "DEFENDANT", clientId: "", name: "Banco Réu S.A.", document: "", lawyerName: "" });
    await addParty(A.ctx, caseId, { role: "DEFENDANT", clientId: "", name: "Segundo Réu Ltda", document: "", lawyerName: "" });
    tplId = (await createTemplate(lawyer.ctx, { name: "Petição teste", body: "# PETIÇÃO\n\nProcesso {{processo.numero_antigo}}, distribuído em {{processo.data_distribuicao}}, sob responsabilidade de {{processo.responsavel}}.\n\nAutores: {{processo.polo_ativo}}. Réus: {{processo.polo_passivo}}. Escritório CNPJ {{escritorio.documento}}." })).id;
  });

  it("só quem gerencia modelos cria timbrado; valida logo e tamanho dos textos", async () => {
    await expect(createLetterhead(assistant.ctx, { name: "Sem permissão" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createLetterhead(lawyer.ctx, { name: "X" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createLetterhead(lawyer.ctx, { name: "Logo falso", logoBase64: Buffer.from("<svg onload=alert(1)>").toString("base64") })).rejects.toBeInstanceOf(ValidationError);
    await expect(createLetterhead(lawyer.ctx, { name: "Logo grande", logoBase64: Buffer.concat([Buffer.from(PNG, "base64"), Buffer.alloc(400 * 1024)]).toString("base64") })).rejects.toBeInstanceOf(ValidationError);
    await expect(createLetterhead(lawyer.ctx, { name: "Longo", headerText: "a".repeat(601) })).rejects.toBeInstanceOf(ValidationError);
    await expect(createLetterhead(lawyer.ctx, { name: "Muitas linhas", footerText: "1\n2\n3\n4\n5\n6\n7" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("um único padrão por escritório; padrão não pode ser desativado nem fica ativo se outro assumir", async () => {
    const a = await createLetterhead(lawyer.ctx, { name: "Oficial", headerText: "TSB Advocacia\nOAB/BA 1", footerText: "(71) 0000-0000", logoBase64: PNG, isDefault: true });
    const b = await createLetterhead(lawyer.ctx, { name: "Simples", headerText: "Escritório", showPageNumbers: false });
    expect((await listLetterheads(lawyer.ctx)).filter((l) => l.isDefault).map((l) => l.id)).toEqual([a.id]);
    await expect(updateLetterhead(lawyer.ctx, a.id, { name: "Oficial", isDefault: true, active: false })).rejects.toBeInstanceOf(ConflictError);
    await updateLetterhead(lawyer.ctx, b.id, { name: "Simples", headerText: "Escritório", showPageNumbers: false, isDefault: true });
    const list = await listLetterheads(lawyer.ctx);
    expect(list.filter((l) => l.isDefault).map((l) => l.id)).toEqual([b.id]);
    expect((await getLogo(lawyer.ctx, a.id))?.mime).toBe("image/png");
    await updateLetterhead(lawyer.ctx, a.id, { name: "Oficial", headerText: "TSB Advocacia\nOAB/BA 1", footerText: "(71) 0000-0000", logoBase64: null });
    expect(await getLogo(lawyer.ctx, a.id)).toBeNull();
    await updateLetterhead(lawyer.ctx, a.id, { name: "Oficial", headerText: "TSB Advocacia\nOAB/BA 1", footerText: "(71) 0000-0000", isDefault: true });
  });

  it("gera o .docx com o timbrado padrão, com um escolhido e sem timbrado", async () => {
    const headerOf = async (docId: string) => {
      const doc = await getDocumentForDownload(lawyer.ctx, docId);
      const zip = await JSZip.loadAsync(await stream(doc.storageKey));
      const h = Object.keys(zip.files).find((n) => /word\/header\d*\.xml$/.test(n));
      return h ? await zip.file(h)!.async("string") : null;
    };
    const padrao = await generateFromTemplate(lawyer.ctx, tplId, { caseId }, "Padrão");
    expect(await headerOf(padrao.id)).toContain("TSB Advocacia");
    const simples = (await listLetterheads(lawyer.ctx)).find((l) => l.name === "Simples")!;
    const escolhido = await generateFromTemplate(lawyer.ctx, tplId, { caseId }, "Escolhido", simples.id);
    expect(await headerOf(escolhido.id)).toContain("Escritório");
    expect(await headerOf(escolhido.id)).not.toContain("TSB Advocacia");
    const sem = await generateFromTemplate(lawyer.ctx, tplId, { caseId }, "Sem", "none");
    expect(await headerOf(sem.id)).toBeNull();
  });

  it("novas variáveis do processo são preenchidas (polos, responsável, datas, CNPJ)", async () => {
    const { pdf, missing } = await previewTemplatePdf(lawyer.ctx, tplId, { caseId }, "");
    expect(missing).toEqual([]);
    const doc = await generateFromTemplate(lawyer.ctx, tplId, { caseId }, "Variáveis", "none");
    const d = await getDocumentForDownload(lawyer.ctx, doc.id);
    const zip = await JSZip.loadAsync(await stream(d.storageKey));
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const txt of ["ORIGEM-77", "05/03/2026", "Maria Autora", "Banco Réu S.A.; Segundo Réu Ltda", "11.222.333/0001-81", lawyer.user.name]) expect(xml).toContain(txt);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("prévia: PDF válido, nada é gravado, campo ausente vira [PREENCHER] e respeita permissão e isolamento", async () => {
    const before = await db.document.count({ where: { organizationId: A.org.id } });
    const { pdf } = await previewTemplatePdf(lawyer.ctx, tplId, { caseId }, "Minha prévia");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(await db.document.count({ where: { organizationId: A.org.id } })).toBe(before);
    const t2 = await createTemplate(lawyer.ctx, { name: "Com cliente", body: "Cliente: {{cliente.nome}}" });
    const r = await previewTemplatePdf(lawyer.ctx, t2.id, { caseId }, "");
    expect(r.missing).toContain("Nome do cliente");
    await expect(previewTemplatePdf(finance.ctx, tplId, { caseId }, "")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(previewTemplatePdf(B.ctx, tplId, { caseId }, "")).rejects.toBeInstanceOf(NotFoundError);
    await expect(previewTemplatePdf(lawyer.ctx, tplId, { caseId, clientId: crypto.randomUUID() }, "")).rejects.toBeInstanceOf(ValidationError);
  });

  it("isolamento: timbrado de outro escritório, excluído ou desativado é recusado", async () => {
    const mine = (await listLetterheads(lawyer.ctx))[0]!;
    await expect(resolveLetterhead(B.ctx, mine.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateLetterhead(B.ctx, mine.id, { name: "Invasão" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await listLetterheads(B.ctx)).toEqual([]);
    const tmp = await createLetterhead(lawyer.ctx, { name: "Temporário" });
    await updateLetterhead(lawyer.ctx, tmp.id, { name: "Temporário", active: false });
    await expect(resolveLetterhead(lawyer.ctx, tmp.id)).rejects.toBeInstanceOf(NotFoundError);
    await updateLetterhead(lawyer.ctx, tmp.id, { name: "Temporário", active: true });
    await deleteLetterhead(lawyer.ctx, tmp.id);
    await expect(resolveLetterhead(lawyer.ctx, tmp.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(generateFromTemplate(lawyer.ctx, tplId, { caseId }, "x", tmp.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
