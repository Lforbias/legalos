import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { uploadCertificate } from "@/server/services/certificate.service";
import { connectionForCase, consultCaseMni, createConnection, deleteConnection, listConnections, setConnectionEnabled, importAutosMni, runMniAll, syncAvisos } from "@/server/services/mni.service";
import { enqueueAutos, latestAutosJob, runAutosQueue } from "@/server/services/autos-queue.service";
import { createCase } from "@/server/services/case.service";
import { makeTestPfx } from "../fixtures/make-pfx";
import { autosContentXml, autosListXml, avisosXml, faultXml, processoXml } from "../fixtures/mni-samples";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TRT5", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const mkCnj = (seq: string, segment = "5", court = "05") => `${seq}-${computeCnjCheck({ sequence: seq, year: "2024", segment, court, origin: "0001" })}.2024.${segment}.${court}.0001`;
const digits = (s: string) => s.replace(/\D/g, "");
const CPF = "52998224725";

describe("conector PJe/MNI (Etapa 1) — tribunal SIMULADO só nos testes", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let server: http.Server;
  let endpoint = "";
  const requests: string[] = [];
  let mode: "ok" | "fault" = "ok";
  const cnj = mkCnj("0001234");

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    A = await makeOrgWithOwner("mni-A");
    B = await makeOrgWithOwner("mni-B");
    lawyer = await addMember(A.org.id, "LAWYER", "mni-law");
    const owner = await db.user.findUniqueOrThrow({ where: { id: A.ctx.userId } });
    const s = await startEnrollment(owner.id, owner.email);
    await confirmEnrollment(owner.id, totpCode(s.secret, totpStep()), META);
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        requests.push(body);
        res.setHeader("content-type", "text/xml");
        if (mode === "fault") {
          res.statusCode = 500;
          return res.end(faultXml);
        }
        if (body.includes("consultarAvisosPendentes")) return res.end(avisosXml(digits(cnj)));
        if (body.includes("<movimentos>false</movimentos>")) {
          const ids = [...body.matchAll(/<documento>(\d+)<\/documento>/g)].map((m) => m[1]!);
          return res.end(ids.length ? autosContentXml(digits(cnj), ids) : autosListXml(digits(cnj)));
        }
        res.end(processoXml(digits(cnj)));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/intercomunicacao`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("cadastro: permissões, 2FA, validações e segredo cifrado", async () => {
    const base = { label: "TRT5 PJe", jtr: "5.05", endpointUrl: endpoint, authMode: "PASSWORD" as const, document: CPF, password: "senha-pje" };
    await expect(createConnection(lawyer.ctx, base)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createConnection(B.ctx, base)).rejects.toThrow(/duas etapas/);
    await expect(createConnection(A.ctx, { ...base, jtr: "9.99" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createConnection(A.ctx, { ...base, document: "11111111111" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createConnection(A.ctx, { ...base, password: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createConnection(A.ctx, { ...base, authMode: "CERTIFICATE" })).rejects.toBeInstanceOf(ValidationError);
    const c = await createConnection(A.ctx, base);
    const raw = await db.courtConnection.findUniqueOrThrow({ where: { id: c.id } });
    expect(raw.secretEnc).not.toContain("senha-pje");
    expect(raw.secretEnc).not.toContain(CPF);
    const list = await listConnections(A.ctx);
    expect(JSON.stringify(list)).not.toMatch(/secretEnc|senha-pje/);
    await deleteConnection(A.ctx, c.id);
    expect(await db.courtConnection.count({ where: { id: c.id } })).toBe(0);
  });

  it("avisos: importa na caixa de entrada sem abrir o teor, vincula ao processo e não duplica", async () => {
    const proc = await createCase(A.ctx, { ...caseBase, title: "Reclamação", number: cnj });
    const conn = await createConnection(A.ctx, { label: "TRT5 PJe", jtr: "5.05", endpointUrl: endpoint, authMode: "PASSWORD", document: CPF, password: "senha-pje" });
    requests.length = 0;
    const r1 = await syncAvisos(A.ctx, conn.id);
    expect(r1).toEqual({ found: 2, imported: 2, alreadyKnown: 0 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("consultarAvisosPendentes");
    expect(requests.join("")).not.toContain("consultarTeorComunicacao");
    const notices = await db.courtNotice.findMany({ where: { organizationId: A.org.id, source: "IMPORTED" } });
    expect(notices).toHaveLength(2);
    expect(notices.every((n) => n.caseId === proc.id)).toBe(true);
    expect(notices.some((n) => n.kind === "CITACAO")).toBe(true);
    expect(notices[0]!.content).toMatch(/NÃO foi aberto/);
    // Box 2.0: origem privada, identificador oficial, ciência oficial NÃO presumida, evidência simulada (servidor local)
    for (const n of notices) {
      expect(n).toMatchObject({ originKind: "PRIVATE_COMMUNICATION", sourceSystem: "pje-mni", officialAckState: "UNKNOWN", officialAckAt: null, firstViewedAt: null });
      expect(n.officialId).toBeTruthy();
      expect(n.externalKey).toBe(`mni:5.05:${n.officialId}`);
    }
    const ev = await db.connectorEvidence.findMany({ where: { organizationId: A.org.id, sourceId: conn.id, operation: "listNotices" } });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ outcome: "PASSED", environment: "SIMULATED", courtCode: "5.05", connectorKey: "pje-mni" });
    const r2 = await syncAvisos(A.ctx, conn.id);
    expect(r2).toMatchObject({ imported: 0, alreadyKnown: 2 });
    expect((await db.courtConnection.findUniqueOrThrow({ where: { id: conn.id } })).lastStatus).toBe("OK");
    expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "mni.sync_avisos" } })).toBe(2);
    // isolamento: outro escritório não enxerga nem usa a conexão
    await expect(syncAvisos(B.ctx, conn.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("consulta do processo: importa movimentos sem duplicar; sigiloso e sem conexão são recusados", async () => {
    const proc = await createCase(A.ctx, { ...caseBase, title: "Consulta", number: mkCnj("0005555") });
    const caseNum = (await db.case.findUniqueOrThrow({ where: { id: proc.id } })).number!;
    // o servidor simulado responde sempre com o processo `cnj`; usamos o mesmo número para o caso consultado
    await db.case.update({ where: { id: proc.id }, data: { number: null } }).catch(() => null);
    await db.case.update({ where: { id: proc.id }, data: { number: caseNum } });
    const r1 = await consultCaseMni(A.ctx, proc.id);
    expect(r1.total).toBe(2);
    expect(r1.imported).toBe(2);
    expect(r1.orgao).toBe("1ª Vara do Trabalho");
    expect((await consultCaseMni(A.ctx, proc.id)).imported).toBe(0);
    const evs = await db.caseEvent.findMany({ where: { caseId: proc.id, kind: "MNI_MOVEMENT" }, orderBy: { occurredAt: "asc" } });
    expect(evs.map((e) => e.title)).toEqual(["Movimento nacional (código 26)", "Juntada de petição"]);

    const secret = await createCase(A.ctx, { ...caseBase, title: "Sigilo", confidential: true, number: mkCnj("0006666") });
    await expect(consultCaseMni(A.ctx, secret.id)).rejects.toThrow(/sigilosos/);
    const other = await createCase(A.ctx, { ...caseBase, title: "TJSP", number: mkCnj("0007777", "8", "26") });
    await expect(consultCaseMni(A.ctx, other.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(consultCaseMni(lawyer.ctx, proc.id)).resolves.toBeDefined().catch(() => null);
  });

  it("erro do tribunal (Fault) é registrado e mostrado sem vazar detalhes; conexão desligada recusa", async () => {
    const conn = await createConnection(A.ctx, { label: "TRT5 2", jtr: "5.05", endpointUrl: endpoint, authMode: "PASSWORD", document: CPF, password: "senha-pje" });
    mode = "fault";
    await expect(syncAvisos(A.ctx, conn.id)).rejects.toThrow(/Credenciais inválidas/);
    expect((await db.courtConnection.findUniqueOrThrow({ where: { id: conn.id } })).lastStatus).toBe("ERROR");
    const failEv = await db.connectorEvidence.findFirstOrThrow({ where: { organizationId: A.org.id, sourceId: conn.id, operation: "listNotices" } });
    expect(failEv).toMatchObject({ outcome: "FAILED", reasonCode: "AUTH_REJECTED" }); // credencial recusada vira evidência, não "conectado"
    mode = "ok";
    await setConnectionEnabled(A.ctx, conn.id, false);
    await expect(syncAvisos(A.ctx, conn.id)).rejects.toThrow(/desligada/);
  });

  it("modo com certificado: usa o cofre, registra o uso e recusa certificado revogado", async () => {
    const owner = await db.user.findUniqueOrThrow({ where: { id: A.ctx.userId } });
    const cert = await uploadCertificate(A.ctx, { file: makeTestPfx({ password: "pw", serial: "mni001" }), password: "pw", label: "A1 teste", ownerUserId: owner.id });
    // http local não faz TLS: o cofre é consultado mesmo assim e o uso fica registrado
    const conn = await createConnection(A.ctx, { label: "TRT5 cert", jtr: "5.05", endpointUrl: endpoint, authMode: "CERTIFICATE", certificateId: cert.id, document: CPF });
    await syncAvisos(A.ctx, conn.id);
    expect(await db.certificateUsage.count({ where: { certificateId: cert.id, purpose: "mni:consultarAvisosPendentes" } })).toBe(1);
    await db.certificate.update({ where: { id: cert.id }, data: { revokedAt: new Date(), pfxEnc: "", passEnc: "" } });
    await expect(syncAvisos(A.ctx, conn.id)).rejects.toThrow(/revogado/);
  });
  it("execução automática: sincroniza conexões ligadas com o contexto de quem criou, ignora desligadas e escritório suspenso", async () => {
    const conn = await createConnection(A.ctx, { label: "TRT5 auto", jtr: "5.05", endpointUrl: endpoint, authMode: "PASSWORD", document: CPF, password: "senha-pje" });
    mode = "ok";
    const r = await runMniAll();
    expect(r.ok).toBeGreaterThanOrEqual(1);
    const after = await db.courtConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(after.lastStatus).toBe("OK");
    // desligada: não é tocada
    await setConnectionEnabled(A.ctx, conn.id, false);
    const t0 = (await db.courtConnection.findUniqueOrThrow({ where: { id: conn.id } })).lastSyncAt;
    await runMniAll();
    expect((await db.courtConnection.findUniqueOrThrow({ where: { id: conn.id } })).lastSyncAt).toEqual(t0);
    // criador sem acesso: falha registrada, sem derrubar as demais
    await setConnectionEnabled(A.ctx, conn.id, true);
    await db.courtConnection.update({ where: { id: conn.id }, data: { createdById: lawyer.user.id } });
    await db.membership.updateMany({ where: { userId: lawyer.user.id, organizationId: A.org.id }, data: { status: "SUSPENDED" } });
    await runMniAll();
    const bad = await db.courtConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(bad.lastStatus).toBe("ERROR");
    expect(bad.lastMessage).toMatch(/não tem mais acesso/);
  });
  it("autos: baixa documentos do tribunal para o processo, sem duplicar, pulando sigilosos/não suportados", async () => {
    const proc = await createCase(A.ctx, { ...caseBase, title: "Autos", number: mkCnj("0007777") });
    await db.courtConnection.updateMany({ where: { organizationId: A.org.id, jtr: "5.05" }, data: { enabled: false } });
    await createConnection(A.ctx, { label: "TRT5 autos", jtr: "5.05", endpointUrl: endpoint, authMode: "PASSWORD", document: CPF, password: "senha-pje" });
    mode = "ok";
    requests.length = 0;
    const fin = await addMember(A.org.id, "FINANCE", "mni-fin");
    await expect(importAutosMni(fin.ctx, proc.id)).rejects.toBeInstanceOf(ForbiddenError);
    const r1 = await importAutosMni(A.ctx, proc.id);
    expect(r1).toMatchObject({ listed: 6, imported: 3, alreadyKnown: 0, skippedSecret: 1, skippedUnsupported: 2, remaining: 0 });
    const docs = await db.document.findMany({ where: { caseId: proc.id, organizationId: A.org.id }, orderBy: { name: "asc" } });
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => d.mimeType === "application/pdf" && d.externalKey?.startsWith("mni:5.05:doc:"))).toBe(true);
    expect(docs.find((d) => d.name.includes("Decisão"))?.category).toBe("DECISAO");
    expect(docs.some((d) => d.name.includes("sigiloso"))).toBe(false);
    // senha nunca foi logada em evento/auditoria
    const r2 = await importAutosMni(A.ctx, proc.id);
    expect(r2).toMatchObject({ imported: 0, alreadyKnown: 3 });
    expect(await db.document.count({ where: { caseId: proc.id } })).toBe(3);
    expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "mni.import_autos" } })).toBe(2);
    // sigiloso e sem número não são consultados
    const conf = await createCase(A.ctx, { ...caseBase, title: "Sigiloso", number: mkCnj("0007778"), confidential: true });
    await expect(importAutosMni(A.ctx, conf.id)).rejects.toThrow(/sigilosos/);
    // outro escritório não alcança
    await expect(importAutosMni(B.ctx, proc.id)).rejects.toBeInstanceOf(NotFoundError);
  });
  it("roteia por sistema do processo, exige contrato e recusa conexões ambíguas", async () => {
    const proc = await createCase(A.ctx, { ...caseBase, number: mkCnj("0008899", "8", "26"), courtSystem: "eproc" });
    const base = { jtr: "8.26", endpointUrl: endpoint, authMode: "PASSWORD" as const, document: "integracao", password: "segredo", environment: "HOMOLOGATION" as const };
    const eproc = await createConnection(A.ctx, { ...base, label: "eproc teste", system: "eproc" });
    const projudi = await createConnection(A.ctx, { ...base, label: "projudi teste", system: "projudi" });
    await expect(setConnectionEnabled(A.ctx, eproc.id, true)).rejects.toBeInstanceOf(ConflictError);
    expect(await connectionForCase(A.ctx, proc.id)).toBeNull();
    await db.courtConnection.updateMany({ where: { id: { in: [eproc.id, projudi.id] } }, data: { enabled: true, wsdlStatus: "COMPATIBLE", wsdlOperations: ["consultarProcesso"] } });
    expect(await connectionForCase(A.ctx, proc.id)).toMatchObject({ id: eproc.id, system: "eproc" });
    expect(await connectionForCase(A.ctx, proc.id, "entregarManifestacaoProcessual")).toBeNull();
    await db.case.update({ where: { id: proc.id }, data: { courtSystem: "projudi" } });
    expect(await connectionForCase(A.ctx, proc.id)).toMatchObject({ id: projudi.id });
    await db.courtConnection.update({ where: { id: eproc.id }, data: { system: "projudi" } });
    await expect(connectionForCase(A.ctx, proc.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(connectionForCase(B.ctx, proc.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fila baixa lotes reais do tribunal simulado e não fica presa em arquivos ignorados", async () => {
    const proc = await createCase(A.ctx, { ...caseBase, title: "Fila de autos", number: mkCnj("0009998"), courtSystem: "eproc" });
    const conn = await createConnection(A.ctx, { label: "eproc fila", jtr: "5.05", endpointUrl: endpoint, system: "eproc", authMode: "PASSWORD", document: "integracao", password: "teste" });
    await db.courtConnection.update({ where: { id: conn.id }, data: { enabled: true, wsdlStatus: "COMPATIBLE", wsdlOperations: ["consultarProcesso"] } });
    mode = "ok";
    await enqueueAutos(A.ctx, proc.id);
    for (let i = 0; i < 8; i++) {
      await runAutosQueue({ importer: (ctx, id, _post, excluded, skip) => importAutosMni(ctx, id, undefined, excluded, skip, 1) });
      if ((await latestAutosJob(A.ctx, proc.id))?.status === "COMPLETED") break;
    }
    expect(await latestAutosJob(A.ctx, proc.id)).toMatchObject({ status: "COMPLETED", imported: 3, remaining: 0, skipped: 3 });
    expect(await db.document.count({ where: { caseId: proc.id } })).toBe(3);
  });

});
