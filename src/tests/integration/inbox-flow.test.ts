import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { addDays, todayYmd } from "@/lib/dates/ymd";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import type { NoticeInput } from "@/modules/inbox/schemas";
import { addNoticeNote, assignNoticeToTeam, createTeam, deleteNoticeNote, deleteTeam, listNoticeTags, listTeams, normalizeTags, returnNotice, sendToEntrada, setNoticeTags, setTeamMembers, snoozeNotice } from "@/server/services/inbox-flow.service";
import { assignNotice, createNotice, discardNotice, getNotice, listNotices, markProcessed, noticeBoxCounts } from "@/server/services/notice.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const notice = (o: Partial<NoticeInput> = {}): NoticeInput => ({ source: "MANUAL", kind: "INTIMACAO", title: "Intimação de teste", content: `Fica a parte intimada para se manifestar. ${Math.random()}`, caseNumber: "", court: "", publishedAt: "", receivedAt: "2030-03-01", caseId: "", ...o });
const ids = async (ctx: Parameters<typeof listNotices>[0], box: Parameters<typeof listNotices>[1]) => (await listNotices(ctx, box)).items.map((i) => i.id);

describe("caixas de trabalho da caixa de entrada", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let l1: Awaited<ReturnType<typeof addMember>>;
  let l2: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  let teamId = "";

  beforeAll(async () => {
    A = await makeOrgWithOwner("flow-A");
    B = await makeOrgWithOwner("flow-B");
    l1 = await addMember(A.org.id, "LAWYER", "flow-l1");
    l2 = await addMember(A.org.id, "LAWYER", "flow-l2");
    assistant = await addMember(A.org.id, "ASSISTANT", "flow-as");
  });

  it("equipes: só quem gerencia membros cria; membro inválido e nome repetido são recusados; isolamento", async () => {
    await expect(createTeam(l1.ctx, { name: "Trabalhista", memberIds: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTeam(A.ctx, { name: "x", memberIds: [] })).rejects.toBeInstanceOf(ValidationError);
    const bUser = await addMember(B.org.id, "LAWYER", "flow-bl");
    await expect(createTeam(A.ctx, { name: "Trabalhista", memberIds: [bUser.ctx.userId] })).rejects.toBeInstanceOf(ValidationError);
    const t = await createTeam(A.ctx, { name: "Trabalhista", memberIds: [l1.ctx.userId] });
    teamId = t.id;
    await expect(createTeam(A.ctx, { name: "trabalhista", memberIds: [] })).rejects.toBeInstanceOf(ValidationError);
    expect((await listTeams(A.ctx))[0]).toMatchObject({ name: "Trabalhista" });
    expect(await listTeams(B.ctx)).toHaveLength(0);
    await setTeamMembers(A.ctx, teamId, [l1.ctx.userId, l2.ctx.userId]);
    expect((await listTeams(A.ctx))[0]!.members).toHaveLength(2);
    await expect(setTeamMembers(B.ctx, teamId, [])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("entrada → usuário/equipe → devolver → acervo e volta, sempre na caixa certa", async () => {
    const n = await createNotice(A.ctx, notice());
    expect(await ids(A.ctx, { box: "entrada" })).toContain(n.id);
    await assignNotice(A.ctx, n.id, { userId: l1.ctx.userId });
    expect(await ids(l1.ctx, { box: "minhas" })).toContain(n.id);
    expect(await ids(l2.ctx, { box: "minhas" })).not.toContain(n.id);
    expect(await ids(l2.ctx, { box: "geral" })).toContain(n.id);
    expect(await ids(A.ctx, { box: "entrada" })).not.toContain(n.id);
    // devolver: volta a quem encarregou (o proprietário)
    await expect(returnNotice(l2.ctx, n.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await returnNotice(l1.ctx, n.id)).toEqual({ toEntrada: false });
    expect((await getNotice(A.ctx, n.id)).assigneeId).toBe(A.ctx.userId);
    // equipe: tira o responsável individual
    await assignNoticeToTeam(A.ctx, n.id, teamId);
    const g = await getNotice(A.ctx, n.id);
    expect(g).toMatchObject({ assigneeId: null, teamId, status: "DISTRIBUTED" });
    expect(await ids(l2.ctx, { box: "equipe", teamId })).toContain(n.id);
    expect((await noticeBoxCounts(A.ctx)).teams[teamId]).toBeGreaterThanOrEqual(1);
    await expect(assignNoticeToTeam(A.ctx, n.id, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(ValidationError);
    // membro da equipe pode devolver
    expect((await returnNotice(l2.ctx, n.id)).toEntrada).toBe(false);
    // tratar → acervo → entrada
    await markProcessed(A.ctx, n.id);
    expect(await ids(A.ctx, { box: "acervo" })).toContain(n.id);
    await sendToEntrada(A.ctx, n.id);
    expect(await ids(A.ctx, { box: "entrada" })).toContain(n.id);
    expect(await getNotice(A.ctx, n.id)).toMatchObject({ assigneeId: null, teamId: null, assignedById: null, processedAt: null });
    await expect(sendToEntrada(A.ctx, n.id)).rejects.toBeInstanceOf(ConflictError);
    // outro escritório não enxerga nada
    await expect(getNotice(B.ctx, n.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await ids(B.ctx, { box: "geral" })).toHaveLength(0);
  });

  it("devolver sem quem encarregou manda para a Entrada; excluir equipe devolve as intimações dela", async () => {
    const n = await createNotice(A.ctx, notice());
    await assignNoticeToTeam(A.ctx, n.id, teamId);
    await deleteTeam(A.ctx, teamId);
    expect(await getNotice(A.ctx, n.id)).toMatchObject({ status: "NEW", teamId: null, assigneeId: null });
    const t2 = await createTeam(A.ctx, { name: "Cível", memberIds: [] });
    teamId = t2.id;
    const m = await createNotice(A.ctx, notice());
    await assignNotice(l1.ctx, m.id, { userId: l1.ctx.userId });
    expect(await returnNotice(l1.ctx, m.id)).toEqual({ toEntrada: true });
    expect((await getNotice(A.ctx, m.id)).status).toBe("NEW");
  });

  it("adormecer: some das caixas até a data, valida a data e pode acordar; tratadas não adormecem", async () => {
    const n = await createNotice(A.ctx, notice());
    const today = todayYmd(A.ctx.timezone);
    await expect(snoozeNotice(A.ctx, n.id, today)).rejects.toBeInstanceOf(ValidationError);
    await expect(snoozeNotice(A.ctx, n.id, addDays(today, 400))).rejects.toBeInstanceOf(ValidationError);
    await expect(snoozeNotice(assistant.ctx, n.id, addDays(today, 3))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(snoozeNotice(l1.ctx, n.id, addDays(today, 3))).resolves.toBeUndefined();
    expect(await ids(A.ctx, { box: "entrada" })).not.toContain(n.id);
    expect(await ids(A.ctx, {})).not.toContain(n.id);
    expect(await ids(A.ctx, { box: "adormecidas" })).toContain(n.id);
    expect((await noticeBoxCounts(A.ctx)).adormecidas).toBeGreaterThanOrEqual(1);
    await db.courtNotice.update({ where: { id: n.id }, data: { snoozedUntil: new Date(`${addDays(today, -1)}T00:00:00Z`) } });
    expect(await ids(A.ctx, { box: "entrada" })).toContain(n.id);
    await snoozeNotice(A.ctx, n.id, addDays(today, 2));
    await snoozeNotice(A.ctx, n.id, null);
    expect(await ids(A.ctx, { box: "entrada" })).toContain(n.id);
    await markProcessed(A.ctx, n.id);
    await expect(snoozeNotice(A.ctx, n.id, addDays(today, 2))).rejects.toBeInstanceOf(ConflictError);
  });

  it("etiquetas: normaliza, limita e filtra; notas: autor e proprietário apagam, outros não", async () => {
    expect(normalizeTags([" Urgente ", "urgente", "TRT5  Bahia", ""])).toEqual(["urgente", "trt5 bahia"]);
    expect(() => normalizeTags(Array.from({ length: 11 }, (_, i) => `t${i}`))).toThrow(ValidationError);
    expect(() => normalizeTags(["x".repeat(31)])).toThrow(ValidationError);
    const n = await createNotice(A.ctx, notice());
    const o = await createNotice(A.ctx, notice());
    await setNoticeTags(l1.ctx, n.id, ["Urgente", "audiência"]);
    expect(await ids(A.ctx, { tag: "URGENTE" })).toEqual([n.id]);
    expect(await ids(A.ctx, { tag: "audiência" })).not.toContain(o.id);
    expect(await listNoticeTags(A.ctx)).toEqual(expect.arrayContaining(["urgente", "audiência"]));
    expect(await listNoticeTags(B.ctx)).toEqual([]);
    await expect(setNoticeTags(B.ctx, n.id, ["x"])).rejects.toBeInstanceOf(NotFoundError);

    await expect(addNoticeNote(l1.ctx, n.id, "  ")).rejects.toBeInstanceOf(ValidationError);
    const note = await addNoticeNote(l1.ctx, n.id, "Ligar para o cliente antes do prazo.");
    expect((await getNotice(A.ctx, n.id)).notes[0]).toMatchObject({ body: "Ligar para o cliente antes do prazo.", authorName: expect.any(String) });
    await expect(deleteNoticeNote(l2.ctx, n.id, note.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteNoticeNote(A.ctx, n.id, note.id);
    expect((await getNotice(A.ctx, n.id)).notes).toHaveLength(0);
    await expect(addNoticeNote(B.ctx, n.id, "x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("descartadas ficam na própria caixa e não aparecem como abertas", async () => {
    const n = await createNotice(A.ctx, notice());
    await discardNotice(A.ctx, n.id, { reason: "duplicada de teste" });
    expect(await ids(A.ctx, { box: "descartadas" })).toContain(n.id);
    expect(await ids(A.ctx, {})).not.toContain(n.id);
  });
});
