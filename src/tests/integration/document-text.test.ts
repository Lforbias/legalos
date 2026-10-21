import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { __setAiProviderForTests, type AiProvider } from "@/lib/ai/provider";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { askAboutCase, setOrgAiEnabled } from "@/server/services/ai.service";
import { createCase } from "@/server/services/case.service";
import { addDocumentVersion, uploadDocument } from "@/server/services/document.service";
import { extractDocumentText, extractPendingTexts, getDocumentTextInfo, searchDocumentContent } from "@/server/services/document-text.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const fx = (n: string) => fs.readFileSync(path.join(process.cwd(), "src/tests/fixtures", n));
const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };

async function docx(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("texto dos documentos: extração, OCR local e busca (Fase 8b)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let fin: Awaited<ReturnType<typeof addMember>>;
  let caseA: { id: string };
  let secret: { id: string };
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    A = await makeOrgWithOwner("ocr-A");
    B = await makeOrgWithOwner("ocr-B");
    lawyer = await addMember(A.org.id, "LAWYER", "ocr-law");
    fin = await addMember(A.org.id, "FINANCE", "ocr-fin");
    caseA = await createCase(A.ctx, { ...caseBase, title: "Caso com anexos" });
    secret = await createCase(A.ctx, { ...caseBase, title: "Caso sigiloso", confidential: true });
    const up = async (key: string, owner: { caseId: string }, name: string, buffer: Buffer) => {
      ids[key] = (await uploadDocument(A.ctx, owner, { name, buffer })).id;
    };
    await up("png", { caseId: caseA.id }, "foto-intimacao.png", fx("scan.png"));
    await up("scanpdf", { caseId: caseA.id }, "digitalizado.pdf", fx("scan.pdf"));
    await up("textpdf", { caseId: caseA.id }, "contrato.pdf", fx("text.pdf"));
    await up("docx", { caseId: caseA.id }, "parecer.docx", await docx("Parecer sobre audiência de conciliação e honorários CPF 529.982.247-25 contato joao@exemplo.com"));
    await up("txt", { caseId: secret.id }, "nota-sigilosa.txt", Buffer.from("Estratégia confidencial: acordo extrajudicial com a empresa Alfa."));
    await up("sheet", { caseId: caseA.id }, "planilha.csv", Buffer.from("a,b\n1,2\n"));
  });
  afterAll(() => __setAiProviderForTests(undefined));

  it("extrai de imagem (OCR), PDF digitalizado (OCR), PDF com texto, DOCX e TXT, com método e páginas", async () => {
    const png = await extractDocumentText(A.ctx, ids.png!);
    expect(png).toMatchObject({ status: "EXTRACTED", pages: 1 });
    expect(png.method).toMatch(/^ocr:/);
    const scan = await extractDocumentText(A.ctx, ids.scanpdf!);
    expect(scan.method).toMatch(/^ocr:/);
    const text = await extractDocumentText(A.ctx, ids.textpdf!);
    expect(text).toMatchObject({ status: "EXTRACTED", method: "pdf-text" });
    expect((await extractDocumentText(A.ctx, ids.docx!)).method).toBe("office-xml");
    expect((await extractDocumentText(A.ctx, ids.txt!)).method).toBe("plain");
    const info = await getDocumentTextInfo(A.ctx, ids.png!);
    expect(info?.preview).toMatch(/Hearing scheduled for March/);
    expect((await db.documentText.findFirstOrThrow({ where: { documentId: ids.png! } })).organizationId).toBe(A.org.id);
  });

  it("formato sem extração e arquivo corrompido não quebram: ficam marcados com explicação", async () => {
    const sheet = await extractDocumentText(A.ctx, ids.sheet!);
    expect(sheet.status).toBe("EXTRACTED"); // csv é texto
    const xlsx = (await uploadDocument(A.ctx, { caseId: caseA.id }, { name: "planilha.xlsx", buffer: await docx("x") })).id; // zip válido, formato sem extrator
    expect(await extractDocumentText(A.ctx, xlsx)).toMatchObject({ status: "UNAVAILABLE" });
    const broken = (await uploadDocument(A.ctx, { caseId: caseA.id }, { name: "quebrado.docx", buffer: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("lixo")]) })).id;
    const r = await extractDocumentText(A.ctx, broken);
    expect(r.status).toBe("FAILED");
    expect(r.error).toMatch(/Não foi possível ler/);
  });

  it("busca por conteúdo: sem acento, radical em português, só versão atual e só o que o usuário pode ver", async () => {
    const hits = await searchDocumentContent(A.ctx, "audiencia");
    expect(hits.map((h) => h.name)).toEqual(["parecer.docx"]);
    expect(hits[0]!.snippet).toContain("audiência");
    expect((await searchDocumentContent(A.ctx, "hearing")).map((h) => h.name).sort()).toEqual(["digitalizado.pdf", "foto-intimacao.png"]);
    // sigilo: o titular acha; o advogado (sem acesso ao caso sigiloso) não
    expect((await searchDocumentContent(A.ctx, "extrajudicial")).map((h) => h.name)).toEqual(["nota-sigilosa.txt"]);
    expect(await searchDocumentContent(lawyer.ctx, "extrajudicial")).toEqual([]);
    // outro escritório não enxerga nada
    expect(await searchDocumentContent(B.ctx, "audiencia")).toEqual([]);
    // nova versão invalida o texto antigo até ser extraída de novo
    await addDocumentVersion(A.ctx, ids.docx!, { name: "parecer.docx", buffer: await docx("Texto novo sem a palavra procurada") }, "v2");
    expect(await searchDocumentContent(A.ctx, "conciliacao")).toEqual([]);
    expect((await getDocumentTextInfo(A.ctx, ids.docx!))).toBeNull();
    await extractDocumentText(A.ctx, ids.docx!);
    expect((await searchDocumentContent(A.ctx, "procurada")).map((h) => h.name)).toEqual(["parecer.docx"]);
  });

  it("validação e permissões", async () => {
    await expect(searchDocumentContent(A.ctx, "ab")).rejects.toBeInstanceOf(ValidationError);
    await expect(searchDocumentContent(fin.ctx, "audiencia")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(extractDocumentText(fin.ctx, ids.png!)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(extractDocumentText(lawyer.ctx, ids.txt!)).rejects.toBeInstanceOf(NotFoundError); // sigiloso sem acesso
    await expect(extractDocumentText(B.ctx, ids.png!)).rejects.toBeInstanceOf(NotFoundError); // outro escritório
    await expect(getDocumentTextInfo(B.ctx, ids.png!)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("extração em lote: só o que está pendente e visível", async () => {
    const c2 = await createCase(A.ctx, { ...caseBase, title: "Outro caso" });
    await uploadDocument(A.ctx, { caseId: c2.id }, { name: "p1.txt", buffer: Buffer.from("primeiro texto pendente") });
    await uploadDocument(A.ctx, { caseId: c2.id }, { name: "p2.txt", buffer: Buffer.from("segundo texto pendente") });
    const r = await extractPendingTexts(lawyer.ctx, 10);
    expect(r.extracted).toBeGreaterThanOrEqual(2);
    expect((await searchDocumentContent(A.ctx, "pendente")).length).toBe(2);
    // o sigiloso (do titular) não foi tocado pelo advogado e continua com seu texto
    expect(await extractPendingTexts(lawyer.ctx, 10)).toMatchObject({ processed: 0 });
  });

  it("a IA recebe trechos dos documentos com CPF e e-mail ocultados", async () => {
    await extractDocumentText(A.ctx, ids.docx!); // v2 já extraída; garante estado
    const doc = (await uploadDocument(A.ctx, { caseId: caseA.id }, { name: "dados.txt", buffer: Buffer.from("Cliente CPF 529.982.247-25, CNPJ 11.222.333/0001-81, e-mail maria@x.com, audiência marcada.") })).id;
    await extractDocumentText(A.ctx, doc);
    await setOrgAiEnabled(A.ctx, true);
    let sent = "";
    const provider: AiProvider = { name: "t", model: "m", async complete({ messages }) { sent = messages[0]!.content; return { text: "ok [1]", inputTokens: 1, outputTokens: 1, model: "m" }; } };
    __setAiProviderForTests(provider);
    await askAboutCase(A.ctx, caseA.id, "O que dizem os documentos?");
    expect(sent).toContain("audiência marcada");
    expect(sent).toContain("[CPF]");
    expect(sent).toContain("[CNPJ]");
    expect(sent).toContain("[E-MAIL]");
    expect(sent).not.toMatch(/529\.982\.247-25|11\.222\.333|maria@x\.com/);
    expect(sent).not.toContain("extrajudicial"); // texto do caso sigiloso nunca entra
  });
});
