import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { getCapabilityCatalog, listConnectionCards } from "@/server/judicial/connections.service";
import { recordEvidence } from "@/server/judicial/evidence.service";
import { createMonitor, syncDjen } from "@/server/services/djen.service";
import { djenItem, djenPage } from "../fixtures/djen-samples";
import { addMember, makeOrgWithOwner } from "./helpers";

const ok = (items: unknown[]) => async () => ({ status: 200, body: djenPage(items) });

describe("Box 2.0 — Central de Conexões: estado honesto, derivado de evidência", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  const now = new Date();

  beforeAll(async () => {
    // evidência de plataforma (sem escritório) vale para todos: este arquivo precisa partir sem nenhuma herdada de outros testes
    await db.connectorEvidence.deleteMany({ where: { organizationId: null } });
    A = await makeOrgWithOwner("conn-A");
    B = await makeOrgWithOwner("conn-B");
    assistant = await addMember(A.org.id, "ASSISTANT", "conn-ass");
  });
  afterAll(async () => {
    const orgs = [A.org.id, B.org.id];
    await db.djenMonitor.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.courtConnection.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.portalAccess.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.syncRun.deleteMany({ where: { organizationId: { in: orgs } } });
  });

  it("cadastro sem consulta real NÃO é 'operacional'; resposta simulada também não; só produção prova", async () => {
    const id = (await createMonitor(A.ctx, { label: "Dra. Conexão", oabNumber: "92001", oabUf: "BA" })).id;
    let card = (await listConnectionCards(A.ctx, now)).find((c) => c.id === id)!;
    expect(card).toMatchObject({ kind: "DJEN", state: "NOT_HOMOLOGATED", stateLabel: "Não homologado", professional: "Dra. Conexão", courtCode: "*" });
    expect(card.headline).toMatch(/sem uma verificação real/);

    await syncDjen(A.ctx, id, { http: ok([djenItem({ id: 9201 })]), pauseMs: 0 }); // transporte simulado
    card = (await listConnectionCards(A.ctx, new Date())).find((c) => c.id === id)!;
    expect(card.state).toBe("NOT_HOMOLOGATED");
    expect(card.coverage).toBeNull(); // a execução leu tudo, mas a resposta foi simulada: nada é "comprovado"
    expect(card.coverageLabel).toBeNull();

    await syncDjen(A.ctx, id, { http: ok([djenItem({ id: 9201 })]), pauseMs: 0, evidenceEnvironment: "PRODUCTION" });
    card = (await listConnectionCards(A.ctx, new Date())).find((c) => c.id === id)!;
    expect(card).toMatchObject({ state: "OPERATIONAL", stateLabel: "Operacional" });
    expect(card.capabilities.map((c) => `${c.op}:${c.state}`).sort()).toEqual(["checkAvailability:VALIDATED", "listNotices:VALIDATED"]);
    expect(card.lastSuccessAt).not.toBeNull();
    expect(card).toMatchObject({ coverage: "CAPTURE_PROVEN", coverageLabel: "Captura comprovada" }); // agora com evidência real
  });

  it("bloqueio por país vira 'Indisponível' com a razão e a próxima ação para a equipe técnica", async () => {
    const id = (await createMonitor(A.ctx, { label: "Bloqueada", oabNumber: "92002", oabUf: "SP" })).id;
    await expect(syncDjen(A.ctx, id, { http: async () => ({ status: 403, body: "block access from your country" }), pauseMs: 0, evidenceEnvironment: "PRODUCTION" })).rejects.toThrow();
    const card = (await listConnectionCards(A.ctx, new Date())).find((c) => c.id === id)!;
    expect(card).toMatchObject({ state: "UNAVAILABLE", technical: expect.objectContaining({ reason: "GEO_BLOCKED" }) });
    expect(card.headline).not.toMatch(/SOAP|WSDL|endpoint/i);
    expect(card.technical!.evidence.some((e) => e.reasonCode === "GEO_BLOCKED")).toBe(true);
    expect(card.technical!.runs[0]).toMatchObject({ status: "FAILED", errorCode: "GEO_BLOCKED" });
  });

  it("conexão desligada aparece como 'Desligado', e DJEN ligado/desligado respeita o estado", async () => {
    const id = (await createMonitor(A.ctx, { label: "Desligada", oabNumber: "92003", oabUf: "BA" })).id;
    await db.djenMonitor.update({ where: { id }, data: { enabled: false } });
    const card = (await listConnectionCards(A.ctx, now)).find((c) => c.id === id)!;
    expect(card).toMatchObject({ state: "OFF", stateLabel: "Desligado", enabled: false });
  });

  it("MNI: login recusado é 'Necessita autorização'; certificado ausente também; nunca 'conectado' pelo cadastro", async () => {
    const c = await db.courtConnection.create({ data: { organizationId: A.org.id, label: "TRT5 PJe", jtr: "5.05", endpointUrl: "https://exemplo.invalid/mni", authMode: "PASSWORD", secretEnc: "x", enabled: true, createdById: A.ctx.userId } });
    let card = (await listConnectionCards(A.ctx, now)).find((x) => x.id === c.id)!;
    expect(card).toMatchObject({ kind: "MNI", connectorKey: "pje-mni", state: "NOT_HOMOLOGATED", courtCode: "5.05" });
    await recordEvidence({ organizationId: A.org.id, source: { kind: "MNI", id: c.id }, connectorKey: "pje-mni", courtCode: "5.05", operation: "listNotices", accessMethod: "MNI", environment: "PRODUCTION", outcome: "FAILED", reasonCode: "AUTH_REJECTED", summary: "recusado" });
    card = (await listConnectionCards(A.ctx, new Date())).find((x) => x.id === c.id)!;
    expect(card.state).toBe("NEEDS_AUTHORIZATION");
    expect(card.nextAction).toMatch(/acesso/i);
    // certificado vencido: a conexão por certificado precisa de autorização nova, mesmo que o cadastro exista
    const expired = await db.certificate.create({ data: { organizationId: A.org.id, ownerUserId: A.ctx.userId, label: "A1 vencido", subjectCn: "TESTE", serialNumber: "conn001", fingerprintSha256: "f".repeat(64), notBefore: new Date(now.getTime() - 400 * 86_400_000), notAfter: new Date(now.getTime() - 5 * 86_400_000), pfxEnc: "x", passEnc: "x" } });
    const cert = await db.courtConnection.create({ data: { organizationId: A.org.id, label: "TJMG cert", jtr: "8.13", endpointUrl: "https://exemplo.invalid/mni2", authMode: "CERTIFICATE", certificateId: expired.id, secretEnc: "", enabled: true, createdById: A.ctx.userId } });
    const c2 = (await listConnectionCards(A.ctx, new Date())).find((x) => x.id === cert.id)!;
    expect(c2.state).toBe("AUTH_EXPIRED");
    expect(c2.stateLabel).toBe("Autenticação expirada");
  });

  it("evidência de um tribunal não prova o outro (TRT5 validado ≠ TJMG)", async () => {
    const a = (await db.courtConnection.findFirstOrThrow({ where: { organizationId: A.org.id, label: "TRT5 PJe" } })).id;
    await recordEvidence({ organizationId: A.org.id, source: { kind: "MNI", id: a }, connectorKey: "pje-mni", courtCode: "5.05", operation: "listNotices", accessMethod: "MNI", environment: "PRODUCTION", outcome: "PASSED", summary: "ok" });
    const cards = await listConnectionCards(A.ctx, new Date());
    expect(cards.find((x) => x.id === a)!.state).toBe("OPERATIONAL");
    expect(cards.find((x) => x.title === "TJMG cert")!.state).not.toBe("OPERATIONAL");
  });

  it("portal do PJe: login conferido NÃO significa que as intimações estão sendo lidas (parcial por desenho)", async () => {
    const acc = await db.portalAccess.create({ data: { organizationId: A.org.id, userId: A.ctx.userId, system: "pje", target: "trf3-1g", label: "PJe — TRF3 · 1º grau", authMethod: "PASSWORD_OTP", secretEnc: "x", status: "CONNECTED", lastLoginAt: new Date() } });
    await recordEvidence({ organizationId: A.org.id, source: { kind: "PORTAL", id: acc.id }, connectorKey: "pje-portal", courtCode: "trf3-1g", operation: "validateCredentials", accessMethod: "PORTAL_ROBOT", environment: "PRODUCTION", outcome: "PASSED", summary: "login ok" });
    const card = (await listConnectionCards(A.ctx, new Date())).find((x) => x.id === acc.id)!;
    expect(card).toMatchObject({ kind: "PORTAL", state: "PARTIAL" });
    expect(card.headline).toMatch(/Falta: receber publicações e intimações/);
    expect(card.limitations.join(" ")).toMatch(/Captcha|certificado/);
  });

  it("detalhes técnicos só para quem administra integrações; o advogado comum vê a versão em linguagem simples", async () => {
    const owner = await listConnectionCards(A.ctx, now);
    const plain = await listConnectionCards(assistant.ctx, now);
    expect(owner.every((c) => c.technical !== null)).toBe(true);
    expect(plain.length).toBe(owner.length);
    expect(plain.every((c) => c.technical === null)).toBe(true);
    expect(JSON.stringify(plain)).not.toMatch(/GEO_BLOCKED|connectorVersion|accessMethod|reasonCode/);
    // nada de jargão para o advogado comum: nem nas observações nem nas limitações
    expect(JSON.stringify(plain)).not.toMatch(/consultarAvisosPendentes|entregarManifestacao|WSDL|SOAP|MNI 2|PJeOffice|endpoint/i);
    expect(plain.every((c) => c.capabilities.every((cap) => cap.note === null))).toBe(true);
  });

  it("isolamento entre escritórios", async () => {
    expect(await listConnectionCards(B.ctx, now)).toHaveLength(0);
  });

  it("catálogo: declara o que existe em código e a validação real; matriz só para administradores", async () => {
    const owner = await getCapabilityCatalog(A.ctx, new Date());
    const djen = owner.entries.find((e) => e.key === "djen")!;
    expect(djen.implemented.map((i) => i.op).sort()).toEqual(["checkAvailability", "listNotices"]);
    expect(owner.entries.find((e) => e.key === "esaj")!.implemented).toEqual([]);
    expect(owner.entries.find((e) => e.key === "domicilio-judicial")!.implemented).toEqual([]);
    expect(owner.matrix).not.toBeNull();
    expect(owner.matrix!.some((r) => r.connectorKey === "pje-mni" && r.courtCode === "5.05" && r.operation === "listNotices" && r.state === "VALIDATED")).toBe(true);
    expect((await getCapabilityCatalog(assistant.ctx, now)).matrix).toBeNull();
    const other = await getCapabilityCatalog(B.ctx, new Date());
    expect(other.entries.find((e) => e.key === "djen")!.implemented.every((i) => i.state === "UNVALIDATED")).toBe(true);
  });
});
