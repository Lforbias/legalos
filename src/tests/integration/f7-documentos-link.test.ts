import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { mapLinkedDocument } from "@/lib/import/astrea-map";
import { runAstreaImport } from "@/server/import/astrea-import";
import { createCase } from "@/server/services/case.service";
import { addLinkedDocument, listLinkedDocuments, listLinkedModels, parseHttpsUrl, removeLinkedDocument } from "@/server/services/linked-document.service";
import { addMember, makeOrgWithOwner } from "./helpers";

function writeCsv(dir: string, name: string, header: string[], rows: string[][]) {
  const q = (v: string) => `"${v.replaceAll('"', '""')}"`;
  fs.writeFileSync(path.join(dir, `${name}.csv`), [header, ...rows].map((r) => r.map(q).join(",")).join("\n"));
}
const DH = ["Código", "Descrição", "Anexos", "Quem criou", "Código do cliente", "Código do processo", "Link do documento", "Origem", "Tipo", "Data de criação", "Título do processo"];
const base = { number: "", legacyNumber: "", title: "Caso", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };

describe("2.0-F7 — documentos por link (Astrea)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let dir: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("f7-a");
    B = await makeOrgWithOwner("f7-b");
    lawyer = await addMember(A.org.id, "LAWYER", "f7-adv");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "astrea-docs-"));
    writeCsv(dir, "Usuário", ["Código", "Login", "Tipo"], [["u1", lawyer.user.email, "Usuário"]]);
    writeCsv(dir, "Contatos", ["Código", "Nome", "Tipo do contato", "Classificação"], [["c1", "Ana Cliente", "Pessoa Física", "Cliente"]]);
    writeCsv(dir, "Processos", ["Código", "Titulo", "Clientes", "Responsável", "Tipo", "Status", "Número do processo", "Data de criação"], [["p1", "Ana x Réu", "c1", "u1", "Processo", "Ativo", "5015905-44.2022.4.03.6183", "07/12/2022 14:45"]]);
    writeCsv(dir, "Documentos", DH, [
      ["d1", "PROCURAÇÃO", "", "u1", "c1", "p1", "https://docs.google.com/document/d/abc/edit", "STANDARD_DOCUMENT", "DTE_GOOGLE_DOCS", "10/03/2024 09:30", ""],
      ["d2", "Contrato do cliente", "", "u1", "c1", "", "https://drive.google.com/file/d/xyz/view", "STANDARD_DOCUMENT", "DTE_DRIVE", "11/03/2024 09:30", ""],
      ["d3", "Anexo sem link", "a1", "u1", "c1", "p1", "", "STANDARD_DOCUMENT", "DTE_FILE", "12/03/2024 09:30", ""],
      ["d4", "Órfão", "", "u1", "zzz", "yyy", "https://docs.google.com/document/d/o/edit", "STANDARD_DOCUMENT", "DTE_GOOGLE_DOCS", "", ""],
      ["d5", "MODELO DE PROCURAÇÃO", "", "u1", "", "", "https://docs.google.com/document/d/m/edit", "STANDARD_DOCUMENT_MODEL", "DTE_GOOGLE_DOCS", "", ""],
      ["d6", "Link inseguro", "", "u1", "c1", "p1", "http://exemplo.com/x", "STANDARD_DOCUMENT", "DTE_URL", "", ""],
      ["d7", "Site externo", "", "u1", "c1", "p1", "https://exemplo.com/doc", "FROM_TASK", "DTE_URL", "", ""],
    ]);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("mapLinkedDocument: só https; tipo pelo domínio; modelo reconhecido", () => {
    expect(mapLinkedDocument({ Código: "1", Descrição: "X", "Link do documento": "https://docs.google.com/document/d/1" })).toMatchObject({ kind: "GOOGLE_DOCS", isModel: false });
    expect(mapLinkedDocument({ Código: "1", Descrição: "X", "Link do documento": "https://drive.google.com/x" })?.kind).toBe("DRIVE");
    expect(mapLinkedDocument({ Código: "1", Descrição: "X", "Link do documento": "https://1drv.ms/x", Origem: "STANDARD_DOCUMENT_MODEL" })).toMatchObject({ kind: "URL", isModel: true });
    expect(mapLinkedDocument({ Código: "1", Descrição: "X", "Link do documento": "http://x.com" })).toBeNull();
    expect(mapLinkedDocument({ Código: "1", Descrição: "X", "Link do documento": "javascript:alert(1)" })).toBeNull();
    expect(mapLinkedDocument({ Código: "", Descrição: "X", "Link do documento": "https://a.com" })).toBeNull();
  });

  it("importa links no processo/cliente; modelos ficam à parte; simulação não grava; repetir não duplica", async () => {
    const dry = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir, dryRun: true, only: ["documentos"] });
    expect(dry.entidades.documentos).toMatchObject({ lidos: 7, importados: 1 });
    // simulação em dois passos: processos/clientes ainda não importados -> só o modelo é elegível
    expect(await db.linkedDocument.count({ where: { organizationId: A.org.id } })).toBe(0);
    await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir, only: ["clientes", "processos"] });
    const r = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir, only: ["documentos"] });
    expect(r.entidades.documentos).toMatchObject({ lidos: 7, importados: 4, jaImportados: 0 });
    expect(Object.keys(r.entidades.documentos!.ignorados).sort()).toEqual(["arquivo anexado sem link (o backup não traz o conteúdo)", "sem processo ou cliente importado"].sort());
    const again = await runAstreaImport({ organizationId: A.org.id, importerUserId: A.owner.id, dir, only: ["documentos"] });
    expect(again.entidades.documentos).toMatchObject({ importados: 0, jaImportados: 4 });
    expect(await db.linkedDocument.count({ where: { organizationId: A.org.id } })).toBe(4);
    const c = await db.case.findFirstOrThrow({ where: { organizationId: A.org.id, title: "Ana x Réu" } });
    const docs = await listLinkedDocuments(A.ctx, { caseId: c.id });
    expect(docs.map((d) => d.name).sort()).toEqual(["PROCURAÇÃO", "Site externo"]);
    expect(docs.find((d) => d.name === "PROCURAÇÃO")).toMatchObject({ kind: "GOOGLE_DOCS", source: "ASTREA" });
    const client = await db.client.findFirstOrThrow({ where: { organizationId: A.org.id, name: "Ana Cliente" } });
    expect((await listLinkedDocuments(A.ctx, { clientId: client.id })).map((d) => d.name)).toContain("Contrato do cliente");
    expect((await listLinkedModels(A.ctx)).map((m) => m.name)).toEqual(["MODELO DE PROCURAÇÃO"]);
    expect(await listLinkedModels(B.ctx)).toHaveLength(0);
  });

  it("manual: valida link https, respeita sigilo e permissões, remove sem apagar o resto", async () => {
    expect(() => parseHttpsUrl("ftp://x")).toThrow(ValidationError);
    expect(() => parseHttpsUrl("https://user:pw@x.com/a")).toThrow(ValidationError);
    expect(parseHttpsUrl("https://docs.google.com/document/d/1").kind).toBe("GOOGLE_DOCS");
    const c = await createCase(A.ctx, { ...base, title: "Sigiloso", confidential: true });
    const d = await addLinkedDocument(A.ctx, { caseId: c.id }, { name: "Peça no Drive", url: "https://drive.google.com/file/d/1" });
    await expect(addLinkedDocument(A.ctx, { caseId: c.id }, { name: "x", url: "https://a.com" })).rejects.toBeInstanceOf(ValidationError);
    await expect(addLinkedDocument(A.ctx, {}, { name: "Sem dono", url: "https://a.com" })).rejects.toBeInstanceOf(ValidationError);
    await expect(addLinkedDocument(lawyer.ctx, { caseId: c.id }, { name: "Intruso", url: "https://a.com" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listLinkedDocuments(lawyer.ctx, { caseId: c.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(addLinkedDocument(B.ctx, { caseId: c.id }, { name: "Outro escritório", url: "https://a.com" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeLinkedDocument(lawyer.ctx, d.id)).rejects.toBeInstanceOf(NotFoundError);
    await removeLinkedDocument(A.ctx, d.id);
    expect(await listLinkedDocuments(A.ctx, { caseId: c.id })).toHaveLength(0);
    await expect(removeLinkedDocument(A.ctx, d.id)).rejects.toBeInstanceOf(NotFoundError);
    const clientOnly = await addMember(A.org.id, "CLIENT", "f7-cli");
    await expect(listLinkedDocuments(clientOnly.ctx, {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});
