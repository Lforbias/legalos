import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { registerPetitioningAdapter, type PetitioningAdapter } from "@/lib/petitioning/adapter";
import { computeCnjCheck, formatCnj } from "@/lib/validation/br-documents";
import { createCase } from "@/server/services/case.service";
import { addDocumentVersion, uploadDocument } from "@/server/services/document.service";
import { approvePetition, createPetition, getPetition, requestReview, returnPetition } from "@/server/services/petition.service";
import { getReceipt, getScheduleSwitch, listQueue, runDueSchedules, schedulePetition, setScheduleSwitch, unschedulePetition } from "@/server/services/petition-queue.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag}\n%%EOF`);
const base = { legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const cnjDigits = { sequence: "0001234", year: "2025", segment: "8", court: "05", origin: "0001" };
const CNJ = formatCnj(`${cnjDigits.sequence}${computeCnjCheck(cnjDigits)}${cnjDigits.year}${cnjDigits.segment}${cnjDigits.court}${cnjDigits.origin}`);
const future = (min: number) => new Date(Date.now() + min * 60_000);

describe("3.0-F5 — fila de protocolos e agendamento", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  let caseId: string;
  let caseNum: { id: string };
  const oldAdapter = process.env.PETITIONING_ADAPTER;

  async function approved(title: string, cid = caseId) {
    const doc = await uploadDocument(lawyer.ctx, { caseId: cid }, { name: `${title}.pdf`, buffer: pdf(`${title}-${Math.random()}`) });
    const p = await createPetition(assistant.ctx, { caseId: cid, documentId: doc.id, title });
    await requestReview(assistant.ctx, p.id);
    await approvePetition(lawyer.ctx, p.id);
    return { p, doc };
  }

  beforeAll(async () => {
    A = await makeOrgWithOwner("l3f5-a");
    B = await makeOrgWithOwner("l3f5-b");
    lawyer = await addMember(A.org.id, "LAWYER", "l3f5-adv");
    assistant = await addMember(A.org.id, "ASSISTANT", "l3f5-ass");
    caseId = (await createCase(lawyer.ctx, { ...base, number: "", title: "Sem número" })).id;
    caseNum = await createCase(lawyer.ctx, { ...base, number: CNJ, title: "Com número" });
  });
  afterAll(() => {
    if (oldAdapter === undefined) delete process.env.PETITIONING_ADAPTER; else process.env.PETITIONING_ADAPTER = oldAdapter;
  });

  it("o interruptor nasce desligado, só administrador liga e sem ele ninguém agenda", async () => {
    expect(await getScheduleSwitch(lawyer.ctx)).toBe(false);
    const { p } = await approved("Sem interruptor");
    await expect(schedulePetition(lawyer.ctx, p.id, { at: future(10) })).rejects.toBeInstanceOf(ConflictError);
    await expect(setScheduleSwitch(lawyer.ctx, true)).rejects.toBeInstanceOf(ForbiddenError);
    await setScheduleSwitch(A.ctx, true);
    expect(await getScheduleSwitch(lawyer.ctx)).toBe(true);
    expect(await getScheduleSwitch(B.ctx)).toBe(false);
  });

  it("agenda só petição aprovada, em horário válido, por quem pode aprovar", async () => {
    const doc = await uploadDocument(lawyer.ctx, { caseId }, { name: "rascunho.pdf", buffer: pdf("rasc") });
    const draft = await createPetition(assistant.ctx, { caseId, documentId: doc.id, title: "Rascunho" });
    await expect(schedulePetition(lawyer.ctx, draft.id, { at: future(10) })).rejects.toBeInstanceOf(ConflictError);
    const { p } = await approved("Para agendar");
    await expect(schedulePetition(assistant.ctx, p.id, { at: future(10) })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(schedulePetition(lawyer.ctx, p.id, { at: future(0) })).rejects.toBeInstanceOf(ValidationError);
    await expect(schedulePetition(lawyer.ctx, p.id, { at: new Date(Date.now() - 60_000) })).rejects.toBeInstanceOf(ValidationError);
    await expect(schedulePetition(lawyer.ctx, p.id, { at: future(60 * 24 * 40) })).rejects.toBeInstanceOf(ValidationError);
    await expect(schedulePetition(B.ctx, p.id, { at: future(10) })).rejects.toBeInstanceOf(ConflictError); // o escritório B nem ligou o agendamento
    await setScheduleSwitch(B.ctx, true);
    await expect(schedulePetition(B.ctx, p.id, { at: future(10) })).rejects.toBeInstanceOf(NotFoundError); // e, ligado, não enxerga a petição de A
    await setScheduleSwitch(B.ctx, false);
    await schedulePetition(lawyer.ctx, p.id, { at: future(10) });
    const q = await listQueue(lawyer.ctx, { view: "agendadas" });
    expect(q.items.map((i) => i.id)).toContain(p.id);
    expect(q.counts.scheduled).toBeGreaterThanOrEqual(1);
    await unschedulePetition(lawyer.ctx, p.id);
    await expect(unschedulePetition(lawyer.ctx, p.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await listQueue(lawyer.ctx, { view: "agendadas" })).items.map((i) => i.id)).not.toContain(p.id);
  });

  it("a rotina executa só o que venceu, uma vez, e deixa recibo para baixar", async () => {
    const { p: due } = await approved("Vence agora");
    const { p: later } = await approved("Vence depois");
    await schedulePetition(lawyer.ctx, due.id, { at: future(5) });
    await schedulePetition(lawyer.ctx, later.id, { at: future(120) });
    const none = await runDueSchedules(new Date());
    expect(none.submitted).toBe(0);
    const t = new Date(Date.now() + 10 * 60_000);
    const r1 = await runDueSchedules(t);
    expect(r1.submitted).toBe(1);
    const r2 = await runDueSchedules(t);
    expect(r2.submitted).toBe(0); // não repete
    expect((await getPetition(lawyer.ctx, due.id)).petition.status).toBe("SUBMITTED");
    expect((await getPetition(lawyer.ctx, later.id)).petition.status).toBe("APPROVED");
    const rec = await getReceipt(lawyer.ctx, due.id);
    expect(rec.receipt).toContain("DEMONSTRAÇÃO");
    await expect(getReceipt(B.ctx, due.id)).rejects.toBeInstanceOf(NotFoundError);
    const done = await listQueue(lawyer.ctx, { view: "protocoladas" });
    expect(done.items.find((i) => i.id === due.id)?.hasReceipt).toBe(true);
    const n = await db.notification.findMany({ where: { userId: lawyer.user.id, kind: "petition.schedule" } });
    expect(n.length).toBeGreaterThanOrEqual(1);
    await unschedulePetition(lawyer.ctx, later.id);
  });

  it("se o documento ganhar nova versão depois de agendar, a petição volta ao rascunho e nada é enviado", async () => {
    const { p, doc } = await approved("Muda depois");
    await schedulePetition(lawyer.ctx, p.id, { at: future(5) });
    await addDocumentVersion(lawyer.ctx, doc.id, { name: "novo.pdf", buffer: pdf("v2") });
    const r = await runDueSchedules(new Date(Date.now() + 10 * 60_000));
    expect(r.submitted).toBe(0);
    const { petition } = await getPetition(lawyer.ctx, p.id);
    expect(petition.status).toBe("DRAFT");
    expect(petition.scheduledFor).toBeNull();
  });

  it("se um anexo mudar depois de agendar, o envio é recusado, o agendamento cai e a pessoa é avisada", async () => {
    const { p } = await approved("Anexo muda");
    const att = await uploadDocument(lawyer.ctx, { caseId }, { name: "anexo.pdf", buffer: pdf("anexo") });
    const row = await db.petitionAttachment.create({ data: { organizationId: A.org.id, petitionId: p.id, documentId: att.id, documentVersion: 1, classification: "OUTROS", position: 0 } });
    expect(row.id).toBeTruthy();
    await schedulePetition(lawyer.ctx, p.id, { at: future(5) });
    await addDocumentVersion(lawyer.ctx, att.id, { name: "anexo2.pdf", buffer: pdf("anexo2") });
    const r = await runDueSchedules(new Date(Date.now() + 10 * 60_000));
    expect(r.failed).toBe(1);
    const { petition } = await getPetition(lawyer.ctx, p.id);
    expect(petition.status).toBe("APPROVED");
    expect(petition.scheduledFor).toBeNull();
    expect(petition.scheduleNote).toMatch(/anexo/i);
  });

  it("devolver ao rascunho ou cancelar tira o agendamento (não dispara depois da reaprovação)", async () => {
    const { p } = await approved("Devolvida");
    await schedulePetition(lawyer.ctx, p.id, { at: future(5) });
    await returnPetition(lawyer.ctx, p.id, "Ajustar o pedido");
    expect((await getPetition(lawyer.ctx, p.id)).petition.scheduledFor).toBeNull();
    await requestReview(assistant.ctx, p.id);
    await approvePetition(lawyer.ctx, p.id);
    const r = await runDueSchedules(new Date(Date.now() + 10 * 60_000));
    expect(r.submitted).toBe(0);
    expect((await getPetition(lawyer.ctx, p.id)).petition.status).toBe("APPROVED");
  });

  it("desligar o interruptor cancela os agendados", async () => {
    const { p } = await approved("Cancelada ao desligar");
    await schedulePetition(lawyer.ctx, p.id, { at: future(5) });
    await setScheduleSwitch(A.ctx, false);
    const { petition } = await getPetition(lawyer.ctx, p.id);
    expect(petition.scheduledFor).toBeNull();
    expect(petition.scheduleNote).toMatch(/desligado/i);
    await setScheduleSwitch(A.ctx, true);
  });

  it("protocolo REAL: exige digitar o número do processo para agendar", async () => {
    const real: PetitioningAdapter = { key: "fake-real", label: "Real (teste)", isDemo: false, async describeTarget() { return { connectorKey: "fake-real", courtCode: "TST", environment: "SIMULATED" }; }, async submit() { return { protocol: "REAL-1", receipt: "recibo real" }; } };
    registerPetitioningAdapter(real);
    process.env.PETITIONING_ADAPTER = "fake-real";
    try {
      const { p } = await approved("Real", caseNum.id);
      await expect(schedulePetition(lawyer.ctx, p.id, { at: future(5) })).rejects.toBeInstanceOf(ValidationError);
      await expect(schedulePetition(lawyer.ctx, p.id, { at: future(5), confirmCase: "0000000-00.0000.0.00.0000" })).rejects.toBeInstanceOf(ValidationError);
      await schedulePetition(lawyer.ctx, p.id, { at: future(5), confirmCase: CNJ });
      const r = await runDueSchedules(new Date(Date.now() + 10 * 60_000));
      expect(r.submitted).toBe(1);
      const { petition } = await getPetition(lawyer.ctx, p.id);
      expect(petition.protocol).toBe("REAL-1");
      expect(petition.isDemo).toBe(false);
    } finally {
      process.env.PETITIONING_ADAPTER = "demo";
    }
  });
});
