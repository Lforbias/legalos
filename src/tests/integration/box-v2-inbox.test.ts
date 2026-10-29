import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { NotFoundError } from "@/lib/permissions/check";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { countUnviewed, getNoticeTimeline, listProfessionalOptions, recordNoticeViewed } from "@/server/judicial/inbox-v2.service";
import { latestBoxCursor, subscribeBoxChanges } from "@/server/judicial/live";
import { bulkUpdateNotices } from "@/server/services/notice-bulk.service";
import { assignNoticeToTeam, createTeam } from "@/server/services/inbox-flow.service";
import { createCase } from "@/server/services/case.service";
import { assignNotice, createNotice, discardNotice, listNotices, markProcessed, reopenNotice } from "@/server/services/notice.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TRT5", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const mkCnj = (seq: string) => `${seq}-${computeCnjCheck({ sequence: seq, year: "2024", segment: "5", court: "05", origin: "0001" })}.2024.5.05.0001`;
let seq = 0;
const manual = (title: string, extra: Record<string, string> = {}) => ({ source: "MANUAL" as const, kind: "INTIMACAO" as const, title, content: `Teor da comunicação ${title} ${++seq} com texto suficiente.`, caseNumber: "", court: "TJBA", publishedAt: "", receivedAt: "2027-01-10", caseId: "", ...extra });
const captured = (officialId: string, originKind: "DJEN_PUBLICATION" | "PRIVATE_COMMUNICATION" = "DJEN_PUBLICATION", professionalId: string | null = null) => ({ originKind, sourceSystem: originKind === "DJEN_PUBLICATION" ? "djen" : "mni:TRF3", officialId, courtCode: "TJBA", professionalId, capturedAt: new Date() });

describe("Box 2.0 — Caixa de Entrada: vista no LegalOS ≠ ciência oficial, histórico e sinal ao vivo", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let bia: Awaited<ReturnType<typeof addMember>>;
  let profId = "";

  beforeAll(async () => {
    A = await makeOrgWithOwner("inb-A");
    B = await makeOrgWithOwner("inb-B");
    ana = await addMember(A.org.id, "LAWYER", "inb-ana");
    bia = await addMember(A.org.id, "LAWYER", "inb-bia");
    profId = (await db.professionalIdentity.create({ data: { organizationId: A.org.id, name: "Dra. Clara", oabNumber: "91001", oabUf: "BA" } })).id;
  });
  afterAll(async () => {
    await db.noticeEvent.deleteMany({ where: { organizationId: { in: [A.org.id, B.org.id] } } });
  });

  it("abrir no LegalOS grava 'vista' e NUNCA toca na ciência oficial nem na versão do registro", async () => {
    const n = await createNotice(A.ctx, manual("Privada vista"), { capture: captured("P-1", "PRIVATE_COMMUNICATION") });
    const before = await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } });
    expect(before).toMatchObject({ firstViewedAt: null, officialAckAt: null, officialAckState: "UNKNOWN" });

    const r = await recordNoticeViewed(ana.ctx, n.id);
    expect(r).toEqual({ firstView: true, recorded: true });

    const after = await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.firstViewedAt).toBeInstanceOf(Date);
    expect(after.firstViewedById).toBe(ana.user.id);
    // ciência oficial intacta
    expect(after.officialAckAt).toBeNull();
    expect(after.officialAckState).toBe("UNKNOWN");
    // abrir não é editar: a versão (usada pelas ações em lote) não muda
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.status).toBe("NEW");
  });

  it("é idempotente: a primeira vista não muda; cada pessoa gera um único evento", async () => {
    const n = await createNotice(A.ctx, manual("Vista por duas pessoas"));
    await recordNoticeViewed(ana.ctx, n.id);
    const first = await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } });

    expect(await recordNoticeViewed(ana.ctx, n.id)).toEqual({ firstView: false, recorded: false });
    expect(await recordNoticeViewed(bia.ctx, n.id)).toEqual({ firstView: false, recorded: true });

    const after = await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.firstViewedById).toBe(ana.user.id);
    expect(after.firstViewedAt!.getTime()).toBe(first.firstViewedAt!.getTime());
    const events = await db.noticeEvent.findMany({ where: { noticeId: n.id, kind: "VIEWED" } });
    expect(events.map((e) => e.actorId).sort()).toEqual([ana.user.id, bia.user.id].sort());
  });

  it("não vê o que o sigilo esconde, nem de outro escritório; sem permissão de leitura não registra", async () => {
    const secret = await createCase(A.ctx, { ...caseBase, number: mkCnj("0021001"), title: "Sigiloso", confidential: true });
    const n = await createNotice(A.ctx, manual("Do processo sigiloso", { caseId: secret.id }));
    await expect(recordNoticeViewed(ana.ctx, n.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getNoticeTimeline(ana.ctx, n.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(recordNoticeViewed(B.ctx, n.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.courtNotice.findUniqueOrThrow({ where: { id: n.id } })).firstViewedAt).toBeNull();
    // quem pode ver registra normalmente
    await expect(recordNoticeViewed(A.ctx, n.id)).resolves.toMatchObject({ firstView: true });
    expect(await countUnviewed(ana.ctx)).toBeGreaterThanOrEqual(0);
  });

  it("linha do tempo: captura → vista → distribuição → tratamento → reabertura, em ordem e com nomes", async () => {
    const n = await createNotice(A.ctx, manual("Ciclo completo"), { capture: captured("D-100") });
    await recordNoticeViewed(ana.ctx, n.id);
    await assignNotice(A.ctx, n.id, { userId: bia.user.id });
    await markProcessed(A.ctx, n.id);
    await reopenNotice(A.ctx, n.id);

    const t = await getNoticeTimeline(A.ctx, n.id);
    expect(t.map((e) => e.title.split(" ")[0])).toEqual(["Capturada", "Vista", "Distribuída", "Tratada", "Reaberta"]);
    expect(t.map((e) => e.kind)).toEqual(["CAPTURED", "VIEWED", "ASSIGNED", "STATUS", "STATUS"]);
    expect(t[0]!.title).toContain("Publicação no DJEN");
    expect(t[1]!.title).toBe(`Vista no LegalOS por ${ana.user.name}`);
    expect(t[2]!.title).toBe(`Distribuída para ${bia.user.name}`);
    expect(t.map((e) => e.at.getTime())).toEqual([...t.map((e) => e.at.getTime())].sort((a, b) => a - b));
    // nenhum evento afirma ciência oficial
    expect(JSON.stringify(t)).not.toMatch(/Ciência oficial registrada/);
  });

  it("histórico também registra equipe, descarte e ações em lote", async () => {
    const team = await createTeam(A.ctx, { name: "Prazos", memberIds: [ana.user.id] });
    const a = await createNotice(A.ctx, manual("Para a equipe"));
    await assignNoticeToTeam(A.ctx, a.id, team.id);
    expect((await getNoticeTimeline(A.ctx, a.id)).map((e) => e.title)).toContain("Distribuída para a equipe Prazos");

    const d = await createNotice(A.ctx, manual("Para descartar"));
    await discardNotice(A.ctx, d.id, { reason: "Repetida" });
    expect((await getNoticeTimeline(A.ctx, d.id)).at(-1)).toMatchObject({ title: "Descartada", detail: expect.stringContaining("Repetida") });

    const b1 = await createNotice(A.ctx, manual("Lote 1"));
    const b2 = await createNotice(A.ctx, manual("Lote 2"));
    const rows = await db.courtNotice.findMany({ where: { id: { in: [b1.id, b2.id] } }, select: { id: true, updatedAt: true } });
    await bulkUpdateNotices(A.ctx, { action: "ASSIGN_USER", userId: bia.user.id, selection: rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() })) });
    for (const id of [b1.id, b2.id]) expect((await getNoticeTimeline(A.ctx, id)).map((e) => e.title)).toContain(`Distribuída para ${bia.user.name}`);
  });

  it("vincular ao processo pelo CNJ aparece no histórico como automático", async () => {
    const cnj = mkCnj("0021002");
    const c = await createCase(A.ctx, { ...caseBase, number: cnj, title: "Maria x Banco" });
    const n = await createNotice(A.ctx, manual("Com CNJ", { caseNumber: cnj }));
    expect(n.caseId).toBe(c.id);
    const link = (await getNoticeTimeline(A.ctx, n.id)).find((e) => e.kind === "LINKED");
    expect(link).toMatchObject({ title: "Vinculada ao processo Maria x Banco", detail: "Vinculada automaticamente pelo número CNJ." });
  });

  it("filtros novos: não vistas/vistas, tipo de comunicação e profissional (OAB)", async () => {
    const dj = await createNotice(A.ctx, manual("Filtro DJEN"), { capture: captured("F-1", "DJEN_PUBLICATION", profId) });
    const pv = await createNotice(A.ctx, manual("Filtro privada"), { capture: captured("F-2", "PRIVATE_COMMUNICATION") });
    await recordNoticeViewed(ana.ctx, dj.id);

    const ids = async (f: Parameters<typeof listNotices>[1]) => (await listNotices(A.ctx, { pageSize: 200, ...f })).items.map((i) => i.id);
    expect(await ids({ viewed: "yes" })).toContain(dj.id);
    expect(await ids({ viewed: "yes" })).not.toContain(pv.id);
    expect(await ids({ viewed: "no" })).toContain(pv.id);
    expect(await ids({ viewed: "no" })).not.toContain(dj.id);
    expect(await ids({ originKind: "PRIVATE_COMMUNICATION" })).toEqual(expect.arrayContaining([pv.id]));
    expect(await ids({ originKind: "PRIVATE_COMMUNICATION" })).not.toContain(dj.id);
    expect(await ids({ professionalId: profId })).toEqual([dj.id]);
    // filtros nunca atravessam o escritório
    expect(await listNotices(B.ctx, { professionalId: profId })).toMatchObject({ total: 0 });

    const row = (await listNotices(A.ctx, { professionalId: profId })).items[0]!;
    expect(row).toMatchObject({ originKind: "DJEN_PUBLICATION", firstViewedAt: expect.any(Date), officialAckAt: null });
  });

  it("opções de profissional: só nome e OAB, só do próprio escritório", async () => {
    expect(await listProfessionalOptions(ana.ctx)).toEqual([{ id: profId, name: "Dra. Clara", oabNumber: "91001", oabUf: "BA" }]);
    expect(await listProfessionalOptions(B.ctx)).toEqual([]);
  });

  it("sinal ao vivo: o cursor muda a cada evento; o aviso vale só para o próprio escritório", async () => {
    const before = await latestBoxCursor(A.org.id);
    let hitsA = 0;
    let hitsB = 0;
    const offA = subscribeBoxChanges(A.org.id, () => hitsA++);
    const offB = subscribeBoxChanges(B.org.id, () => hitsB++);
    await createNotice(A.ctx, manual("Chegou agora"), { capture: captured("L-1") });
    offA(); offB();
    expect(hitsA).toBeGreaterThan(0);
    expect(hitsB).toBe(0);
    const after = await latestBoxCursor(A.org.id);
    expect(after).not.toBe(before);
    // abrir também é um evento (as outras pessoas veem "vista" sem recarregar)
    const n = await createNotice(A.ctx, manual("Vai ser aberta"));
    const mid = await latestBoxCursor(A.org.id);
    await recordNoticeViewed(ana.ctx, n.id);
    expect(await latestBoxCursor(A.org.id)).not.toBe(mid);
    // escritório sem eventos não tem cursor
    expect(await latestBoxCursor(B.org.id)).toBe("none");
  });

  it("contagem de 'ainda não vistas' respeita sigilo e ignora o que já foi aberto", async () => {
    const a = await countUnviewed(ana.ctx);
    const n = await createNotice(A.ctx, manual("Contável"));
    expect(await countUnviewed(ana.ctx)).toBe(a + 1);
    await recordNoticeViewed(bia.ctx, n.id);
    expect(await countUnviewed(ana.ctx)).toBe(a);
  });
});
