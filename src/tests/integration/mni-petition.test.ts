import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { totpCode, totpStep } from "@/lib/security/totp";
import { MniError, parseEntregarManifestacao } from "@/lib/mni/xml";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { createConnection } from "@/server/services/mni.service";
import { setPetitionTypes } from "@/server/services/mni-petition.service";
import { createCase } from "@/server/services/case.service";
import { uploadDocument } from "@/server/services/document.service";
import { addAttachment, approvePetition, createPetition, getPetition, requestReview, submitPetition } from "@/server/services/petition.service";
import { faultXml } from "../fixtures/mni-samples";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TRT5", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const cnj = `0007777-${computeCnjCheck({ sequence: "0007777", year: "2024", segment: "5", court: "05", origin: "0001" })}.2024.5.05.0001`;
const digits = (s: string) => s.replace(/\D/g, "");
const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag}\n%%EOF`);
const soap = (inner: string) => `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${inner}</soap:Body></soap:Envelope>`;
const okXml = (protocolo = "PROT-2026-0001") => soap(`<ns2:entregarManifestacaoProcessualResposta xmlns:ns2="x"><sucesso>true</sucesso><mensagem>Recebido</mensagem><protocoloRecebimento>${protocolo}</protocoloRecebimento><dataOperacao>20261020101500</dataOperacao><recibo>${Buffer.from("RECIBO DO TRIBUNAL").toString("base64")}</recibo></ns2:entregarManifestacaoProcessualResposta>`);

describe("protocolo de petição pelo MNI (Etapa 5) — tribunal SIMULADO só nos testes", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let caseId = "";
  let connId = "";
  const previous = process.env.PETITIONING_ADAPTER;

  beforeAll(async () => {
    process.env.PETITIONING_ADAPTER = "mni";
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    A = await makeOrgWithOwner("mnip-A");
    B = await makeOrgWithOwner("mnip-B");
    lawyer = await addMember(A.org.id, "LAWYER", "mnip-law");
    for (const u of [A.owner, B.owner]) {
      const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      const s = await startEnrollment(row.id, row.email);
      await confirmEnrollment(row.id, totpCode(s.secret, totpStep()), META);
    }
    caseId = (await createCase(A.ctx, { ...caseBase, title: "Reclamação", number: cnj })).id;
    connId = (await createConnection(A.ctx, { label: "TRT5 PJe", jtr: "5.05", endpointUrl: "http://127.0.0.1:9/intercomunicacao", authMode: "PASSWORD", document: "52998224725", password: "senha-pje" })).id;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.PETITIONING_ADAPTER;
    else process.env.PETITIONING_ADAPTER = previous;
  });

  async function approved(title: string, withAttachment = false) {
    const doc = await uploadDocument(A.ctx, { caseId }, { name: `${title}.pdf`, buffer: pdf(`${title}-${Math.random()}`) });
    const p = await createPetition(A.ctx, { caseId, documentId: doc.id, title });
    if (withAttachment) {
      const att = await uploadDocument(A.ctx, { caseId }, { name: "procuracao.pdf", buffer: pdf(`proc-${Math.random()}`) });
      await addAttachment(A.ctx, p.id, { documentId: att.id, classification: "PROCURACAO" });
    }
    await requestReview(A.ctx, p.id);
    await approvePetition(A.ctx, p.id);
    return p;
  }
  const status = async (id: string) => (await getPetition(A.ctx, id)).petition;

  it("configuração dos códigos: permissão, 2FA, validação e isolamento", async () => {
    await expect(setPetitionTypes(lawyer.ctx, connId, { PETICAO: "1" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setPetitionTypes(A.ctx, connId, { INEXISTENTE: "1" })).rejects.toBeInstanceOf(ValidationError);
    await expect(setPetitionTypes(A.ctx, connId, { PETICAO: "código com espaço" })).rejects.toBeInstanceOf(ValidationError);
    await expect(setPetitionTypes(B.ctx, connId, { PETICAO: "1" })).rejects.toThrow(/não encontrada/);
  });

  it("sem código do tribunal o envio é recusado ANTES de reservar, e a petição segue aprovada", async () => {
    const p = await approved("Sem código");
    let called = 0;
    const post = async () => { called++; return okXml(); };
    await expect(submitPetition(A.ctx, p.id, { confirmCase: cnj, post })).rejects.toThrow(/código de tipo de documento da PETIÇÃO/);
    expect(called).toBe(0);
    expect((await status(p.id)).status).toBe("APPROVED");
  });

  it("exige digitar o número do processo e protocola com protocolo, recibo, anexos e tipos do tribunal", async () => {
    await setPetitionTypes(A.ctx, connId, { PETICAO: "PET1", PROCURACAO: "PROC9" });
    const p = await approved("Contestação MNI", true);
    const sent: string[] = [];
    const post = async (_u: string, xml: string) => { sent.push(xml); return okXml(); };
    await expect(submitPetition(A.ctx, p.id, { post })).rejects.toBeInstanceOf(ValidationError);
    await expect(submitPetition(A.ctx, p.id, { confirmCase: "0000000-00.0000.0.00.0000", post })).rejects.toBeInstanceOf(ValidationError);
    expect(sent).toHaveLength(0);
    const res = await submitPetition(A.ctx, p.id, { confirmCase: digits(cnj), post });
    expect(res).toMatchObject({ protocol: "PROT-2026-0001", isDemo: false });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain(`<numeroProcesso>${digits(cnj)}</numeroProcesso>`);
    expect(sent[0]).toContain('tipoDocumento="PET1"');
    expect(sent[0]).toContain('tipoDocumento="PROC9"');
    expect(sent[0]!.match(/<documento /g)).toHaveLength(2);
    const row = await status(p.id);
    expect(row.status).toBe("SUBMITTED");
    expect(row.isDemo).toBe(false);
    expect(row.receipt).toContain("RECIBO DO TRIBUNAL");
    expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "mni.petition_delivered" } })).toBeGreaterThanOrEqual(1);
    await expect(submitPetition(A.ctx, p.id, { confirmCase: cnj, post })).rejects.toBeInstanceOf(ConflictError); // não duplica
    expect(sent).toHaveLength(1);
  });

  it("recusa do tribunal (Fault) é falha definitiva e pode ser reenviada", async () => {
    const p = await approved("Fault");
    await expect(submitPetition(A.ctx, p.id, { confirmCase: cnj, post: async () => faultXml })).rejects.toBeInstanceOf(ConflictError);
    const row = await status(p.id);
    expect(row.status).toBe("FAILED");
    expect(row.error).not.toMatch(/ATENÇÃO/);
    await expect(submitPetition(A.ctx, p.id, { confirmCase: cnj, post: async () => okXml("PROT-2") })).resolves.toMatchObject({ protocol: "PROT-2" });
  });

  it("sem confirmação do tribunal (queda, resposta sem protocolo) vira ESTADO DESCONHECIDO: nunca é reenviada às cegas", async () => {
    const p1 = await approved("Queda");
    await expect(submitPetition(A.ctx, p1.id, { confirmCase: cnj, post: async () => { throw new MniError("O tribunal demorou demais para responder."); } })).rejects.toThrow(/PODE ter sido protocolada/);
    const r1 = await status(p1.id);
    expect(r1.status).toBe("UNKNOWN");
    expect(r1.error).toMatch(/ATENÇÃO/);
    expect(r1.protocol).toBeNull();
    // não há reenvio: nem direto, nem por rota alternativa
    let reached = 0;
    await expect(submitPetition(A.ctx, p1.id, { confirmCase: cnj, post: async () => { reached++; return okXml("PROT-X"); } })).rejects.toBeInstanceOf(ConflictError);
    expect(reached).toBe(0); // o tribunal nem foi acionado de novo
    const p2 = await approved("Sem protocolo");
    const semProtocolo = soap(`<ns2:entregarManifestacaoProcessualResposta xmlns:ns2="x"><sucesso>true</sucesso></ns2:entregarManifestacaoProcessualResposta>`);
    await expect(submitPetition(A.ctx, p2.id, { confirmCase: cnj, post: async () => semProtocolo })).rejects.toThrow(/PODE ter sido protocolada/);
    const r2 = await status(p2.id);
    expect(r2.status).toBe("UNKNOWN");
    expect(r2.error).toMatch(/ATENÇÃO/);
    // recusa explícita (credenciais/certificado) continua sendo falha definitiva, que pode ser reenviada
    const p3 = await approved("Acesso recusado");
    await expect(submitPetition(A.ctx, p3.id, { confirmCase: cnj, post: async () => { throw new MniError("O tribunal recusou o acesso (credenciais ou certificado)."); } })).rejects.toBeInstanceOf(ConflictError);
    const r3 = await status(p3.id);
    expect(r3.status).toBe("FAILED");
    expect(r3.error).not.toMatch(/ATENÇÃO/);
  });

  it("anexo com classificação sem código é recusado antes do envio", async () => {
    const doc = await uploadDocument(A.ctx, { caseId }, { name: "p.pdf", buffer: pdf(`x-${Math.random()}`) });
    const p = await createPetition(A.ctx, { caseId, documentId: doc.id, title: "Anexo sem código" });
    const att = await uploadDocument(A.ctx, { caseId }, { name: "contrato.pdf", buffer: pdf(`c-${Math.random()}`) });
    await addAttachment(A.ctx, p.id, { documentId: att.id, classification: "CONTRATO" });
    await requestReview(A.ctx, p.id);
    await approvePetition(A.ctx, p.id);
    await expect(submitPetition(A.ctx, p.id, { confirmCase: cnj, post: async () => okXml() })).rejects.toThrow(/CONTRATO/);
    expect((await status(p.id)).status).toBe("APPROVED");
  });

  it("outro escritório não usa a conexão (nenhuma conexão para o tribunal)", async () => {
    const caseB = await createCase(B.ctx, { ...caseBase, title: "Processo B", number: cnj });
    const doc = await uploadDocument(B.ctx, { caseId: caseB.id }, { name: "b.pdf", buffer: pdf("b") });
    const p = await createPetition(B.ctx, { caseId: caseB.id, documentId: doc.id, title: "Petição B" });
    await requestReview(B.ctx, p.id);
    await approvePetition(B.ctx, p.id);
    await expect(submitPetition(B.ctx, p.id, { confirmCase: cnj, post: async () => okXml() })).rejects.toThrow(/Nenhuma conexão/);
  });

  it("parser: exige protocolo e lê data e recibo", () => {
    const r = parseEntregarManifestacao(okXml("X1"));
    expect(r.protocolo).toBe("X1");
    expect(r.dataOperacao).toBeInstanceOf(Date);
    expect(r.recibo).toContain("RECIBO DO TRIBUNAL");
    expect(() => parseEntregarManifestacao(faultXml)).toThrow(/recusou/);
  });
});
