import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { petitionStateInfo } from "@/lib/judicial/petition-state";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { registerPetitioningAdapter, SubmissionUncertainError, type FilingTarget, type PetitionReceipt, type PetitioningAdapter } from "@/lib/petitioning/adapter";
import { computeCnjCheck, formatCnj } from "@/lib/validation/br-documents";
import { recordEvidence } from "@/server/judicial/evidence.service";
import { createCase } from "@/server/services/case.service";
import { uploadDocument } from "@/server/services/document.service";
import { approvePetition, createPetition, getPetition, reconcilePetition, recoverStuckSubmissions, requestReview, submitPetition, STUCK_SUBMITTING_MS } from "@/server/services/petition.service";
import { addMember, makeOrgWithOwner } from "./helpers";

/**
 * Box 2.0 — máquina de estados do peticionamento. Nada aqui usa tribunal de verdade: os adaptadores são de teste e
 * o que se prova é a REGRA do servidor (o que vira "protocolada", o que bloqueia reenvio, quem confere).
 */
const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag}\n%%EOF`);
const base = { legacyNumber: "", title: "Caso", area: "", court: "TRF3", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const parts = { sequence: "0004321", year: "2026", segment: "4", court: "03", origin: "6100" };
const CNJ = formatCnj(`${parts.sequence}${computeCnjCheck(parts)}${parts.year}${parts.segment}${parts.court}${parts.origin}`);

type Behaviour = "OK_OFFICIAL" | "OK_NO_RECEIPT" | "OK_NO_PROTOCOL" | "UNCERTAIN" | "CRASH" | "REFUSE" | "SLOW";
const state = { behaviour: "OK_OFFICIAL" as Behaviour, env: "PRODUCTION" as FilingTarget["environment"], calls: 0, claimEnv: undefined as FilingTarget["environment"] | undefined };

function makeAdapter(key: string): PetitioningAdapter {
  return {
    key,
    label: "Tribunal de teste",
    isDemo: false,
    async describeTarget() { return { connectorKey: key, courtCode: "TRF3", environment: state.env }; },
    async submit(): Promise<PetitionReceipt> {
      state.calls++;
      switch (state.behaviour) {
        case "UNCERTAIN": throw new SubmissionUncertainError("O tribunal não respondeu.");
        case "CRASH": throw new Error("socket hang up");
        case "REFUSE": throw new ConflictError("O tribunal recusou: documento ilegível.");
        case "OK_NO_PROTOCOL": return { protocol: "", receipt: "resposta sem protocolo", officialReceipt: false };
        case "OK_NO_RECEIPT": return { protocol: `P-${state.calls}`, receipt: "recebido", officialReceipt: false };
        case "SLOW": await new Promise((r) => setTimeout(r, 150)); return { protocol: `S-${state.calls}`, receipt: "ok", officialReceipt: true };
        default: return { protocol: `OFC-${state.calls}`, receipt: "RECIBO OFICIAL", officialReceipt: true, environment: state.claimEnv, filedAt: new Date() };
      }
    },
  };
}

describe("Box 2.0 — peticionamento: estados, prova oficial e conferência", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let controller: Awaited<ReturnType<typeof addMember>>; // prepara petições, mas não tem permissão para aprovar/conferir
  let caseId = "";
  let otherCaseId = "";
  let keyN = 0;
  const previous = process.env.PETITIONING_ADAPTER;

  beforeAll(async () => {
    A = await makeOrgWithOwner("bx2p-a");
    B = await makeOrgWithOwner("bx2p-b");
    lawyer = await addMember(A.org.id, "LAWYER", "bx2p-adv");
    controller = await addMember(A.org.id, "CONTROLLER", "bx2p-ctl");
    caseId = (await createCase(A.ctx, { ...base, title: "Com número", number: CNJ })).id;
    otherCaseId = (await createCase(A.ctx, { ...base, title: "Outro processo", number: "" })).id;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.PETITIONING_ADAPTER;
    else process.env.PETITIONING_ADAPTER = previous;
  });

  /** Um adaptador novo por cenário: a evidência de homologação é por conector, então os cenários não se contaminam. */
  function setupConnector(env: FilingTarget["environment"], behaviour: Behaviour) {
    const key = `bx2p-${++keyN}`;
    registerPetitioningAdapter(makeAdapter(key));
    process.env.PETITIONING_ADAPTER = key;
    Object.assign(state, { behaviour, env, calls: 0, claimEnv: undefined });
    return key;
  }
  async function approved(title: string, forCase = caseId) {
    const doc = await uploadDocument(A.ctx, { caseId: forCase }, { name: `${title}.pdf`, buffer: pdf(`${title}-${Math.random()}`) });
    const p = await createPetition(lawyer.ctx, { caseId: forCase, documentId: doc.id, title });
    await requestReview(lawyer.ctx, p.id);
    await approvePetition(A.ctx, p.id);
    return p;
  }
  const row = (id: string) => db.petitionFiling.findUniqueOrThrow({ where: { id } });
  const attempts = (id: string) => db.petitionAttempt.findMany({ where: { petitionId: id }, orderBy: { attemptNo: "asc" } });
  /** Prova de homologação real e recente: um protocolo de teste aceito no ambiente de homologação do tribunal. */
  const homologate = (key: string, environment: "HOMOLOGATION" | "PRODUCTION" | "SIMULATED" = "HOMOLOGATION") =>
    recordEvidence({ organizationId: A.org.id, connectorKey: key, courtCode: "TRF3", operation: "submitFiling", accessMethod: "MNI", environment, outcome: "PASSED", summary: "teste" });
  const receiptDoc = async (name = "recibo.pdf", forCase = caseId) => (await uploadDocument(A.ctx, { caseId: forCase }, { name, buffer: pdf(`rc-${Math.random()}`) })).id;

  // ------------------------------------------------------------------------------------------ o que vira "protocolada"

  it("demonstração: fica 'Enviada em demonstração' e nunca vira protocolo oficial", async () => {
    process.env.PETITIONING_ADAPTER = "demo";
    const p = await approved("Demo");
    const r = await submitPetition(A.ctx, p.id);
    expect(r).toMatchObject({ isDemo: true, status: "SUBMITTED", environment: "DEMO", officiallyFiled: false });
    const { petition, officialReceipt, attempts: at } = await getPetition(A.ctx, p.id);
    expect(petition.status).toBe("SUBMITTED");
    expect(petition.filingEnvironment).toBe("DEMO");
    expect(officialReceipt).toBeNull();
    expect(at.map((a) => a.outcome)).toEqual(["CONFIRMED"]);
    const info = petitionStateInfo(petition.status, petition.filingEnvironment, petition.isDemo);
    expect(info).toMatchObject({ testOnly: true, officiallyFiled: false });
    expect(await db.petitionReceipt.count({ where: { petitionId: p.id } })).toBe(0);
  });

  it("tribunal simulado/teste: mesmo que o adaptador 'jure' ser produção com recibo, vale o ambiente de MENOR confiança", async () => {
    setupConnector("SIMULATED", "OK_OFFICIAL");
    state.claimEnv = "PRODUCTION";
    const p = await approved("Simulado que mente");
    const r = await submitPetition(A.ctx, p.id, { confirmCase: CNJ });
    expect(r).toMatchObject({ status: "SUBMITTED", environment: "SIMULATED", officiallyFiled: false });
    expect(await db.petitionReceipt.count({ where: { petitionId: p.id } })).toBe(0);
    expect(petitionStateInfo("SUBMITTED", "SIMULATED").testOnly).toBe(true);
  });

  it("produção sem homologação: bloqueia ANTES de reservar; evidência simulada não destrava", async () => {
    const key = setupConnector("PRODUCTION", "OK_OFFICIAL");
    const p = await approved("Sem homologação");
    await expect(submitPetition(A.ctx, p.id, { confirmCase: CNJ })).rejects.toThrow(/não foi homologado/);
    expect(state.calls).toBe(0); // o tribunal nunca foi acionado
    expect((await row(p.id)).status).toBe("APPROVED");
    expect(await attempts(p.id)).toHaveLength(0);
    await homologate(key, "SIMULATED");
    await expect(submitPetition(A.ctx, p.id, { confirmCase: CNJ })).rejects.toThrow(/não foi homologado/);
    expect(state.calls).toBe(0);
  });

  it("adaptador real que não informa o destino não protocola", async () => {
    const key = `bx2p-sem-destino-${++keyN}`;
    registerPetitioningAdapter({ key, label: "Sem destino", isDemo: false, async submit() { state.calls++; return { protocol: "X-1", receipt: "x", officialReceipt: true }; } });
    process.env.PETITIONING_ADAPTER = key;
    state.calls = 0;
    const p = await approved("Sem destino");
    await expect(submitPetition(A.ctx, p.id, { confirmCase: CNJ })).rejects.toThrow(/não informa o tribunal/);
    expect(state.calls).toBe(0);
    expect((await row(p.id)).status).toBe("APPROVED");
  });

  it("produção homologada + recibo oficial: 'Protocolada com confirmação oficial', com recibo guardado; não reenvia", async () => {
    const key = setupConnector("PRODUCTION", "OK_OFFICIAL");
    await homologate(key);
    const p = await approved("Oficial");
    const r = await submitPetition(A.ctx, p.id, { confirmCase: CNJ });
    expect(r).toMatchObject({ status: "FILED_CONFIRMED", environment: "PRODUCTION", officiallyFiled: true });
    const { petition, officialReceipt, attempts: at } = await getPetition(A.ctx, p.id);
    expect(petition.confirmedAt).not.toBeNull();
    expect(officialReceipt).toMatchObject({ source: "OFFICIAL_RESPONSE", environment: "PRODUCTION", protocol: r.protocol });
    expect(officialReceipt?.receiptSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(at).toHaveLength(1);
    expect(at[0]).toMatchObject({ outcome: "CONFIRMED", attemptNo: 1 });
    expect(petitionStateInfo(petition.status, petition.filingEnvironment).officiallyFiled).toBe(true);
    await expect(submitPetition(A.ctx, p.id, { confirmCase: CNJ })).rejects.toBeInstanceOf(ConflictError);
    expect(state.calls).toBe(1);
    expect(await db.caseEvent.count({ where: { caseId, kind: "PETITION_SUBMITTED", title: { contains: "confirmação oficial" } } })).toBeGreaterThanOrEqual(1);
  });

  it("produção com protocolo mas sem recibo oficial: 'falta a confirmação' e reenvio bloqueado", async () => {
    const key = setupConnector("PRODUCTION", "OK_NO_RECEIPT");
    await homologate(key);
    const p = await approved("Sem recibo");
    const r = await submitPetition(A.ctx, p.id, { confirmCase: CNJ });
    expect(r).toMatchObject({ status: "AWAITING_CONFIRMATION", officiallyFiled: false });
    const cur = await row(p.id);
    expect(cur.unknownSince).not.toBeNull();
    expect((await attempts(p.id))[0]).toMatchObject({ outcome: "UNCERTAIN", errorCode: "NO_OFFICIAL_RECEIPT" });
    expect(await db.petitionReceipt.count({ where: { petitionId: p.id } })).toBe(0);
    await expect(submitPetition(A.ctx, p.id, { confirmCase: CNJ })).rejects.toThrow(/PODE já ter sido protocolada|pode já ter sido protocolada/i);
    expect(state.calls).toBe(1);
  });

  // ------------------------------------------------------------------------------------------ dúvida e falha

  it("sem resposta do tribunal (incerto) ou exceção inesperada → ESTADO DESCONHECIDO, sem reenvio às cegas", async () => {
    const key = setupConnector("PRODUCTION", "UNCERTAIN");
    await homologate(key);
    const p1 = await approved("Incerto");
    await expect(submitPetition(A.ctx, p1.id, { confirmCase: CNJ })).rejects.toThrow(/PODE ter sido protocolada/);
    expect(await row(p1.id)).toMatchObject({ status: "UNKNOWN", protocol: null });
    expect((await attempts(p1.id))[0]?.outcome).toBe("UNCERTAIN");
    await expect(submitPetition(A.ctx, p1.id, { confirmCase: CNJ })).rejects.toBeInstanceOf(ConflictError);
    expect(state.calls).toBe(1);

    state.behaviour = "CRASH";
    const p2 = await approved("Exceção inesperada");
    await expect(submitPetition(A.ctx, p2.id, { confirmCase: CNJ })).rejects.toBeInstanceOf(ConflictError);
    expect((await row(p2.id)).status).toBe("UNKNOWN");

    state.behaviour = "OK_NO_PROTOCOL"; // respondeu, mas sem protocolo: não há prova → dúvida
    const p3 = await approved("Sem protocolo");
    await submitPetition(A.ctx, p3.id, { confirmCase: CNJ });
    expect((await row(p3.id)).status).toBe("AWAITING_CONFIRMATION");
  });

  it("recusa definitiva → 'Falha no envio'; pode reenviar, e a nova tentativa fica registrada", async () => {
    const key = setupConnector("PRODUCTION", "REFUSE");
    await homologate(key);
    const p = await approved("Recusada");
    await expect(submitPetition(A.ctx, p.id, { confirmCase: CNJ })).rejects.toBeInstanceOf(ConflictError);
    expect(await row(p.id)).toMatchObject({ status: "FAILED" });
    expect((await attempts(p.id))[0]).toMatchObject({ outcome: "REJECTED", errorCode: "REFUSED" });
    state.behaviour = "OK_OFFICIAL";
    const r = await submitPetition(A.ctx, p.id, { confirmCase: CNJ });
    expect(r.officiallyFiled).toBe(true);
    expect((await attempts(p.id)).map((a) => [a.attemptNo, a.outcome])).toEqual([[1, "REJECTED"], [2, "CONFIRMED"]]);
  });

  it("dois envios simultâneos da mesma petição: só um chega ao tribunal", async () => {
    const key = setupConnector("PRODUCTION", "SLOW");
    await homologate(key);
    const p = await approved("Corrida");
    const res = await Promise.allSettled([submitPetition(A.ctx, p.id, { confirmCase: CNJ }), submitPetition(A.ctx, p.id, { confirmCase: CNJ })]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(res.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(state.calls).toBe(1);
    expect(await attempts(p.id)).toHaveLength(1);
  });

  it("envio 'preso' em Enviando vira ESTADO DESCONHECIDO (nunca é reenviado)", async () => {
    setupConnector("PRODUCTION", "OK_OFFICIAL");
    const p = await approved("Preso");
    await db.$transaction([
      db.petitionFiling.update({ where: { id: p.id }, data: { status: "SUBMITTING", attemptCount: 1, submittedById: A.ctx.userId } }),
      db.petitionAttempt.create({ data: { organizationId: A.org.id, petitionId: p.id, attemptNo: 1, adapter: "x", environment: "PRODUCTION", manifestSha256: "0".repeat(64), idempotencyKey: `k-${p.id}`, startedById: A.ctx.userId } }),
    ]);
    // a rotina é global (varre todos os escritórios): por isso as conferências olham para ESTA petição, não para a contagem total
    await recoverStuckSubmissions(new Date(Date.now() + STUCK_SUBMITTING_MS - 60_000));
    expect((await row(p.id)).status).toBe("SUBMITTING"); // ainda dentro do prazo
    expect(await recoverStuckSubmissions(new Date(Date.now() + STUCK_SUBMITTING_MS + 60_000))).toBeGreaterThanOrEqual(1);
    expect(await row(p.id)).toMatchObject({ status: "UNKNOWN" });
    expect((await attempts(p.id))[0]).toMatchObject({ outcome: "UNCERTAIN", errorCode: "INTERRUPTED" });
    await expect(submitPetition(A.ctx, p.id, { confirmCase: CNJ })).rejects.toBeInstanceOf(ConflictError);
    await recoverStuckSubmissions(new Date(Date.now() + 2 * STUCK_SUBMITTING_MS)); // idempotente: não mexe de novo
    expect((await attempts(p.id))).toHaveLength(1);
    expect((await row(p.id)).status).toBe("UNKNOWN");
  });

  it("registro legado: 'Falha' com a marca de dúvida continua sem reenvio, e pode ser conferido", async () => {
    setupConnector("PRODUCTION", "OK_OFFICIAL");
    const p = await approved("Legado");
    await db.petitionFiling.update({ where: { id: p.id }, data: { status: "FAILED", error: "ATENÇÃO: não recebemos confirmação do tribunal e a petição PODE ter sido protocolada." } });
    await expect(submitPetition(A.ctx, p.id, { confirmCase: CNJ })).rejects.toBeInstanceOf(ConflictError);
    expect(state.calls).toBe(0);
    await reconcilePetition(A.ctx, p.id, { outcome: "NOT_FILED", note: "Conferi no PJe: nada consta." });
    expect((await row(p.id)).error).toMatch(/nada foi protocolado/);
  });

  // ------------------------------------------------------------------------------------------ conferência por uma pessoa

  describe("conferência no tribunal", () => {
    async function unknownPetition(title: string) {
      const key = setupConnector("PRODUCTION", "UNCERTAIN");
      await homologate(key);
      const p = await approved(title);
      await submitPetition(A.ctx, p.id, { confirmCase: CNJ }).catch(() => undefined);
      expect((await row(p.id)).status).toBe("UNKNOWN");
      return { p, key };
    }

    it("'não foi protocolada' exige explicação, vale só para dúvida, e libera um novo envio", async () => {
      const { p } = await unknownPetition("Conferir: não");
      await expect(reconcilePetition(A.ctx, p.id, { outcome: "NOT_FILED", note: "curto" })).rejects.toBeInstanceOf(ValidationError);
      await expect(reconcilePetition(controller.ctx, p.id, { outcome: "NOT_FILED", note: "Conferi no portal do tribunal." })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(reconcilePetition(B.ctx, p.id, { outcome: "NOT_FILED", note: "Conferi no portal do tribunal." })).rejects.toBeInstanceOf(NotFoundError);
      await reconcilePetition(A.ctx, p.id, { outcome: "NOT_FILED", note: "Conferi no portal do tribunal: não consta." });
      expect(await row(p.id)).toMatchObject({ status: "FAILED", unknownSince: null });
      expect((await attempts(p.id))[0]).toMatchObject({ outcome: "ABORTED", resolution: "NOT_FILED", resolvedById: A.ctx.userId });
      expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "petition.reconcile_not_filed", resourceId: p.id } })).toBe(1);
      // agora o reenvio é permitido
      state.behaviour = "OK_OFFICIAL";
      const r = await submitPetition(A.ctx, p.id, { confirmCase: CNJ });
      expect(r.officiallyFiled).toBe(true);
      // e conferir 'não foi' numa petição já protocolada é recusado
      await expect(reconcilePetition(A.ctx, p.id, { outcome: "NOT_FILED", note: "Tentando desfazer o protocolo." })).rejects.toBeInstanceOf(ConflictError);
    });

    it("'foi protocolada' exige protocolo válido e recibo = documento DESTE processo; vira confirmada com atestado registrado", async () => {
      const { p } = await unknownPetition("Conferir: sim");
      const okDoc = await receiptDoc("recibo-ok.pdf");
      await expect(reconcilePetition(A.ctx, p.id, { outcome: "FILED", protocol: "!!", receiptDocumentId: okDoc })).rejects.toBeInstanceOf(ValidationError);
      const otherCaseDoc = await receiptDoc("recibo-outro-processo.pdf", otherCaseId);
      await expect(reconcilePetition(A.ctx, p.id, { outcome: "FILED", protocol: "PROT-123", receiptDocumentId: otherCaseDoc })).rejects.toBeInstanceOf(ValidationError);
      await expect(reconcilePetition(controller.ctx, p.id, { outcome: "FILED", protocol: "PROT-123", receiptDocumentId: okDoc })).rejects.toBeInstanceOf(ForbiddenError);
      const foreignCase = (await createCase(B.ctx, { ...base, title: "Caso de B", number: "" })).id;
      const foreignDoc = (await uploadDocument(B.ctx, { caseId: foreignCase }, { name: "alheio.pdf", buffer: pdf(`foreign-${Math.random()}`) })).id;
      await expect(reconcilePetition(A.ctx, p.id, { outcome: "FILED", protocol: "PROT-123", receiptDocumentId: foreignDoc })).rejects.toBeInstanceOf(ValidationError);
      expect((await row(p.id)).status).toBe("UNKNOWN"); // nada disso mudou o estado

      await reconcilePetition(A.ctx, p.id, { outcome: "FILED", protocol: "0004321-77.2026.4.03.6100/001", receiptDocumentId: okDoc, note: "Recibo baixado do PJe." });
      const { petition, officialReceipt } = await getPetition(A.ctx, p.id);
      expect(petition).toMatchObject({ status: "FILED_CONFIRMED", protocol: "0004321-77.2026.4.03.6100/001", error: null, unknownSince: null });
      expect(officialReceipt).toMatchObject({ source: "MANUAL_ATTESTATION", receiptDocumentId: okDoc, recordedById: A.ctx.userId, environment: "PRODUCTION" });
      expect((await attempts(p.id))[0]).toMatchObject({ outcome: "CONFIRMED", resolution: "FILED" });
      await expect(reconcilePetition(A.ctx, p.id, { outcome: "FILED", protocol: "OUTRO-999", receiptDocumentId: okDoc })).rejects.toBeInstanceOf(ConflictError); // já confirmada
      await expect(submitPetition(A.ctx, p.id, { confirmCase: CNJ })).rejects.toBeInstanceOf(ConflictError);
      expect(await db.auditLog.count({ where: { organizationId: A.org.id, action: "petition.reconcile_filed", resourceId: p.id } })).toBe(1);
    });

    it("protocolo feito por fora do sistema pode ser registrado a partir de 'Aprovada', também com recibo", async () => {
      setupConnector("SIMULATED", "OK_OFFICIAL");
      const p = await approved("Protocolada por fora");
      await reconcilePetition(A.ctx, p.id, { outcome: "FILED", protocol: "EXT-2026-1", receiptDocumentId: await receiptDoc("recibo-fora.pdf") });
      expect(await row(p.id)).toMatchObject({ status: "FILED_CONFIRMED", adapter: "manual" });
      expect(state.calls).toBe(0); // este sistema não enviou nada
    });

    it("quem não é do escritório nunca vê tentativas nem recibos de outro escritório", async () => {
      const { p } = await unknownPetition("Isolamento");
      await expect(getPetition(B.ctx, p.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
