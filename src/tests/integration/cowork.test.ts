import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import type { TenantContext } from "@/server/context";
import { ensureListener, subscribe, type CoworkEvent } from "@/server/cowork/realtime";
import { adminUpdateMember, assertCoworkAccess, CoworkDisabledError } from "@/server/services/cowork-access.service";
import { addChannelMembers, coworkUnreadTotal, createChannel, createGroup, ensureWorkspace, joinChannel, listJoinableChannels, listMyChannels, loadChannelForMember, markRead, openDirect, setChannelArchived } from "@/server/services/cowork-channel.service";
import { getInsights } from "@/server/services/cowork-insights.service";
import { addMeetingActionItem, createMeeting, getMeeting, listMeetings, respondMeeting, saveMinutes, setAttendance, setMeetingStatus } from "@/server/services/cowork-meeting.service";
import { deleteMessage, editMessage, getAttachmentForDownload, getMessage, listMessages, listThread, searchMessages, sendMessage } from "@/server/services/cowork-message.service";
import { resolveCards } from "@/server/services/cowork-resource.service";
import { convertMessage } from "@/server/services/cowork-work.service";
import { listEvents } from "@/server/services/agenda.service";
import { listTasks } from "@/server/services/task.service";
import { resolveTenantContext } from "@/server/services/tenant.service";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const nonce = (() => {
  let n = 0;
  return () => `n${Date.now().toString(36)}${(++n).toString().padStart(4, "0")}`;
})();
const fresh = async (ctx: TenantContext) => (await resolveTenantContext(ctx.userId, ctx.organizationId, META)) as TenantContext;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

describe("LegalOS Cowork", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>; // advogada
  let bia: Awaited<ReturnType<typeof addMember>>; // advogada
  let caio: Awaited<ReturnType<typeof addMember>>; // assistente
  let gestor: Awaited<ReturnType<typeof addMember>>; // controladoria (painel)
  let secretCaseId: string;
  let generalId: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("cowork-a");
    B = await makeOrgWithOwner("cowork-b");
    ana = await addMember(A.org.id, "LAWYER", "cw-ana");
    bia = await addMember(A.org.id, "LAWYER", "cw-bia");
    caio = await addMember(A.org.id, "ASSISTANT", "cw-caio");
    gestor = await addMember(A.org.id, "CONTROLLER", "cw-gestor");
    const secret = await db.case.create({ data: { organizationId: A.org.id, title: "Processo Sigiloso Ômega", number: null, confidential: true } });
    secretCaseId = secret.id;
    await db.caseMember.create({ data: { organizationId: A.org.id, caseId: secret.id, userId: ana.user.id, role: "RESPONSIBLE" } });
    for (const c of [A.ctx, ana.ctx, bia.ctx, caio.ctx, gestor.ctx, B.ctx]) await ensureWorkspace(c);
    generalId = (await db.coworkChannel.findFirstOrThrow({ where: { organizationId: A.org.id, slug: "geral" } })).id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("cria o espaço com Geral e canais departamentais, sem duplicar em chamadas concorrentes", async () => {
    await Promise.all([ensureWorkspace(ana.ctx), ensureWorkspace(ana.ctx), ensureWorkspace(bia.ctx)]);
    const rows = await db.coworkChannel.findMany({ where: { organizationId: A.org.id, slug: { not: null } } });
    expect(rows.map((r) => r.slug).sort()).toEqual(["administracao", "atendimento", "comercial", "financeiro", "geral", "juridico"]);
    const mine = await listMyChannels(ana.ctx);
    expect(mine.some((c) => c.isGeneral)).toBe(true);
    // Escritório B tem o próprio Geral, invisível para A.
    const bGeneral = await db.coworkChannel.findFirstOrThrow({ where: { organizationId: B.org.id, slug: "geral" } });
    expect(bGeneral.id).not.toBe(generalId);
  });

  it("1. dois funcionários conversam com histórico persistente, ordem consistente e não lidas", async () => {
    const dm = await openDirect(ana.ctx, bia.user.id);
    const again = await openDirect(bia.ctx, ana.user.id);
    expect(again.id).toBe(dm.id);
    const m1 = await sendMessage(ana.ctx, dm.id, { body: "Bia, revisou a contestação?", clientNonce: nonce() });
    const m2 = await sendMessage(bia.ctx, dm.id, { body: "Revisei, @Ana. Está na pasta.", clientNonce: nonce(), mentionedIds: [ana.user.id] });
    expect(m2.seq).toBe(m1.seq + 1);
    const before = (await listMyChannels(ana.ctx)).find((c) => c.id === dm.id)!;
    expect(before.unread).toBe(1);
    expect(before.mentions).toBe(1);
    // Histórico persistente: lido do banco por outra sessão da mesma pessoa.
    const history = await listMessages(await fresh(bia.ctx), dm.id);
    expect(history.messages.map((m) => m.body)).toEqual(["Bia, revisou a contestação?", "Revisei, @Ana. Está na pasta."]);
    await markRead(ana.ctx, dm.id, m2.seq);
    expect((await listMyChannels(ana.ctx)).find((c) => c.id === dm.id)!.unread).toBe(0);
    // Aviso da menção sem o texto da mensagem.
    const n = await db.notification.findFirstOrThrow({ where: { userId: ana.user.id, kind: "cowork.mention" } });
    expect(n.body).toBeNull();
    expect(n.title).not.toContain("contestação");
  });

  it("threads: respostas fora da linha principal, contagem e notificação do autor", async () => {
    const root = await sendMessage(ana.ctx, generalId, { body: "Quem cobre a audiência de quinta?", clientNonce: nonce() });
    await sendMessage(bia.ctx, generalId, { body: "Eu cubro.", clientNonce: nonce(), parentId: root.id });
    const t = await listThread(caio.ctx, root.id);
    expect(t.root.replyCount).toBe(1);
    expect(t.replies.map((r) => r.body)).toEqual(["Eu cubro."]);
    const main = await listMessages(caio.ctx, generalId);
    expect(main.messages.some((m) => m.body === "Eu cubro.")).toBe(false);
    expect(await db.notification.count({ where: { userId: ana.user.id, kind: "cowork.thread" } })).toBe(1);
  });

  it("2/7. pessoa de outro escritório não lê mensagens, canais, anexos nem recursos (ids de outra organização)", async () => {
    const msg = await sendMessage(ana.ctx, generalId, { body: "Documento interno anexo", clientNonce: nonce() }, [{ name: "parecer.pdf", buffer: PDF }]);
    const attId = msg.attachments[0]!.id;
    await expect(loadChannelForMember(B.ctx, generalId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listMessages(B.ctx, generalId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getMessage(B.ctx, msg.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listThread(B.ctx, msg.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(sendMessage(B.ctx, generalId, { body: "intruso", clientNonce: nonce() })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getAttachmentForDownload(B.ctx, attId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(joinChannel(B.ctx, generalId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(convertMessage(B.ctx, msg.id, { purpose: "TASK", title: "Roubar", requestKey: nonce() })).rejects.toBeInstanceOf(NotFoundError);
    await expect(openDirect(B.ctx, ana.user.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(addChannelMembers(A.ctx, generalId, [B.owner.id])).rejects.toBeInstanceOf(ValidationError);
    expect(await searchMessages(B.ctx, "Documento interno")).toEqual([]);
    // Cartão apontando para processo de outro escritório: restrito.
    const [card] = await resolveCards(B.ctx, [{ kind: "CASE", resourceId: secretCaseId }]);
    expect(card).toEqual({ kind: "CASE", id: secretCaseId, accessible: false, label: "Processo" });
    // Banco também barra: FK composta (canal, escritório) impede gravar mensagem de B num canal de A.
    await expect(db.coworkMessage.create({ data: { organizationId: B.org.id, channelId: generalId, seq: 9999, body: "x" } })).rejects.toThrow();
    // Dentro do escritório, o membro do canal baixa o anexo.
    const a = await getAttachmentForDownload(caio.ctx, attId);
    expect(a.name).toBe("parecer.pdf");
  });

  it("canal privado: quem não participa não vê, não entra e não encontra pela busca — nem administradores", async () => {
    const ch = await createChannel(ana.ctx, { name: "Estratégia M&A", visibility: "PRIVATE", memberIds: [bia.user.id] });
    await sendMessage(bia.ctx, ch.id, { body: "Proposta confidencial de honorários", clientNonce: nonce() });
    await expect(listMessages(caio.ctx, ch.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listMessages(A.ctx, ch.id)).rejects.toBeInstanceOf(NotFoundError); // proprietário do escritório também não
    await expect(joinChannel(caio.ctx, ch.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listJoinableChannels(caio.ctx)).some((c) => c.id === ch.id)).toBe(false);
    expect(await searchMessages(A.ctx, "confidencial de honorários")).toEqual([]);
    expect((await searchMessages(bia.ctx, "confidencial de honorários")).length).toBe(1);
  });

  it("3. sem acesso ao processo sigiloso, o cartão no chat não revela título, número nem existência de conteúdo", async () => {
    const m = await sendMessage(ana.ctx, generalId, { body: "Vejam este processo", clientNonce: nonce(), resources: [{ kind: "CASE", resourceId: secretCaseId }] });
    const forAna = await getMessage(ana.ctx, m.id);
    expect(forAna.cards[0]).toMatchObject({ accessible: true, title: "Processo Sigiloso Ômega" });
    const forBia = await getMessage(bia.ctx, m.id);
    expect(forBia.cards[0]).toEqual({ kind: "CASE", id: secretCaseId, accessible: false, label: "Processo" });
    expect(JSON.stringify(forBia)).not.toContain("Ômega");
    // Bia não consegue compartilhar algo que não enxerga.
    await expect(sendMessage(bia.ctx, generalId, { body: "x", clientNonce: nonce(), resources: [{ kind: "CASE", resourceId: secretCaseId }] })).rejects.toBeInstanceOf(ValidationError);
    // O banco guarda só o ponteiro, sem cópia do título.
    const ref = await db.coworkResourceRef.findFirstOrThrow({ where: { messageId: m.id } });
    expect(Object.keys(ref).sort()).toEqual(["createdAt", "id", "kind", "messageId", "organizationId", "resourceId"]);
  });

  it("sala de processo sigiloso só admite quem enxerga o processo; quem perde acesso perde a sala", async () => {
    await expect(createChannel(ana.ctx, { name: "Sala Ômega", visibility: "PRIVATE", caseId: secretCaseId, memberIds: [bia.user.id] })).rejects.toBeInstanceOf(ValidationError);
    await db.caseMember.create({ data: { organizationId: A.org.id, caseId: secretCaseId, userId: bia.user.id } });
    const room = await createChannel(ana.ctx, { name: "Sala Ômega", visibility: "PUBLIC", caseId: secretCaseId, memberIds: [bia.user.id] });
    expect(room.visibility).toBe("PRIVATE");
    await sendMessage(bia.ctx, room.id, { body: "Prazo da réplica", clientNonce: nonce() });
    await db.caseMember.deleteMany({ where: { caseId: secretCaseId, userId: bia.user.id } });
    await expect(listMessages(bia.ctx, room.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listMyChannels(bia.ctx)).some((c) => c.id === room.id)).toBe(false);
  });

  it("4. mensagem convertida em tarefa aparece em Tarefas com o responsável certo, sem duplicar", async () => {
    const m = await sendMessage(ana.ctx, generalId, { body: "Precisamos protocolar a réplica até sexta.", clientNonce: nonce() });
    const key = nonce();
    const item = await convertMessage(ana.ctx, m.id, { purpose: "TASK", title: "Protocolar réplica", assigneeId: caio.user.id, dueDate: "2030-01-10", requestKey: key });
    const dup = await convertMessage(ana.ctx, m.id, { purpose: "TASK", title: "Protocolar réplica", assigneeId: caio.user.id, dueDate: "2030-01-10", requestKey: key });
    expect(dup.id).toBe(item.id);
    const tasks = await listTasks(caio.ctx, { assigneeId: caio.user.id });
    const t = tasks.items.find((x) => x.id === item.taskId)!;
    expect(t.title).toBe("Protocolar réplica");
    expect(t.assigneeId).toBe(caio.user.id);
    expect(t.createdById).toBe(ana.user.id);
    expect(t.description).toContain(`/cowork?c=${generalId}&m=${m.id}`);
    expect(tasks.items.filter((x) => x.title === "Protocolar réplica")).toHaveLength(1);
    const view = await getMessage(bia.ctx, m.id);
    expect(view.work[0]).toMatchObject({ purpose: "TASK", card: { accessible: true, title: "Protocolar réplica" } });
    const thread = await listThread(bia.ctx, m.id);
    expect(thread.replies.some((r) => r.author.kind === "SYSTEM" && r.cards[0]?.kind === "TASK")).toBe(true);
    expect(await db.notification.count({ where: { userId: caio.user.id, kind: "task.assigned" } })).toBeGreaterThan(0);
    // Pendência entra como "Aguardando"; perfil sem tarefas não converte.
    const p = await convertMessage(bia.ctx, m.id, { purpose: "PENDING", title: "Documento do cliente", assigneeId: bia.user.id, requestKey: nonce() });
    expect((await db.task.findUniqueOrThrow({ where: { id: p.taskId! } })).status).toBe("WAITING");
    const fin = await addMember(A.org.id, "FINANCE", "cw-fin");
    await ensureWorkspace(fin.ctx);
    await expect(convertMessage(fin.ctx, m.id, { purpose: "TASK", title: "Sem permissão", requestKey: nonce() })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("5. reunião agendada entra na agenda, com participantes, presença, ata e encaminhamentos", async () => {
    const team = await createChannel(gestor.ctx, { name: "Controladoria", visibility: "PUBLIC", memberIds: [ana.user.id, bia.user.id] });
    const key = nonce();
    const { id } = await createMeeting(gestor.ctx, { title: "Distribuição semanal", date: "2030-02-04", startTime: "09:00", endTime: "10:00", participantIds: [ana.user.id, bia.user.id], channelId: team.id, requestKey: key });
    expect((await createMeeting(gestor.ctx, { title: "Distribuição semanal", date: "2030-02-04", startTime: "09:00", participantIds: [], requestKey: key })).id).toBe(id);
    const meeting = await getMeeting(ana.ctx, id);
    expect(meeting.participants.map((p) => p.userId).sort()).toEqual([ana.user.id, bia.user.id, gestor.user.id].sort());
    expect(meeting.video.enabled).toBe(false);
    expect(meeting.agendaEventId).toBeTruthy();
    const events = await listEvents(ana.ctx, "2030-02-04", "2030-02-04");
    expect(events.find((e) => e.id === meeting.agendaEventId)).toMatchObject({ title: "Reunião: Distribuição semanal", kind: "MEETING", startTime: "09:00" });
    expect((await listMeetings(bia.ctx, "upcoming")).some((m) => m.id === id)).toBe(true);
    await expect(getMeeting(caio.ctx, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getMeeting(B.ctx, id)).rejects.toBeInstanceOf(NotFoundError);
    await respondMeeting(ana.ctx, id, "ACCEPTED");
    await expect(setAttendance(gestor.ctx, id, ana.user.id, "PRESENT")).rejects.toBeInstanceOf(ConflictError);
    await expect(setMeetingStatus(ana.ctx, id, "start")).resolves.toBeUndefined(); // participante com cowork:meetings administra
    await setAttendance(gestor.ctx, id, ana.user.id, "PRESENT");
    await expect(setAttendance(caio.ctx, id, ana.user.id, "ABSENT")).rejects.toBeInstanceOf(NotFoundError);
    const states = await getInsights(gestor.ctx, { userId: ana.user.id });
    expect(states.rows[0]!.state).toBe("IN_MEETING");
    await saveMinutes(gestor.ctx, id, { minutes: "Distribuídas as audiências.", decisions: "Ana cobre a audiência." });
    const item = await addMeetingActionItem(gestor.ctx, id, { purpose: "FORWARD", title: "Preparar audiência", assigneeId: ana.user.id, dueDate: "2030-02-06", requestKey: nonce() });
    const task = await db.task.findUniqueOrThrow({ where: { id: item.taskId! } });
    expect(task).toMatchObject({ title: "Encaminhamento: Preparar audiência", assigneeId: ana.user.id });
    await setMeetingStatus(gestor.ctx, id, "end");
    const ended = await getMeeting(bia.ctx, id);
    expect(ended).toMatchObject({ status: "ENDED", minutes: "Distribuídas as audiências." });
    expect(ended.workItems).toHaveLength(1);
    const agenda = await db.agendaEvent.findUniqueOrThrow({ where: { id: meeting.agendaEventId! } });
    expect(agenda.status).toBe("DONE");
    const sys = await listMessages(bia.ctx, team.id);
    expect(sys.messages.filter((m) => m.author.kind === "SYSTEM" && m.cards.some((c) => c.kind === "MEETING")).length).toBeGreaterThanOrEqual(2);
  });

  it("6. gestor vê tarefas, pendências e entregas, mas nunca as conversas diretas", async () => {
    const dm = await openDirect(ana.ctx, caio.user.id);
    await sendMessage(ana.ctx, dm.id, { body: "Assunto pessoal reservado XYZ", clientNonce: nonce() });
    const data = await getInsights(gestor.ctx, {});
    const caioRow = data.rows.find((r) => r.userId === caio.user.id)!;
    expect(caioRow.todo).toBeGreaterThanOrEqual(1);
    expect(caioRow.fromCowork).toBeGreaterThanOrEqual(1);
    expect(data.rows.find((r) => r.userId === bia.user.id)!.waiting).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(data)).not.toContain("Assunto pessoal reservado");
    expect(Object.keys(caioRow)).not.toContain("messages");
    await expect(listMessages(gestor.ctx, dm.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await searchMessages(gestor.ctx, "Assunto pessoal")).toEqual([]);
    // Sem a permissão do painel, não há painel.
    await expect(getInsights(caio.ctx, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("permissões administrativas: criar canal exige permissão; bloqueio individual corta o acesso", async () => {
    await expect(createChannel(caio.ctx, { name: "Canal do Caio", visibility: "PUBLIC" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createGroup(caio.ctx, { memberIds: [ana.user.id, bia.user.id] })).resolves.toBeTruthy();
    await expect(adminUpdateMember(ana.ctx, caio.user.id, { blocked: true })).rejects.toBeInstanceOf(ForbiddenError);
    await adminUpdateMember(A.ctx, caio.user.id, { blocked: true });
    await expect(assertCoworkAccess(caio.ctx)).rejects.toBeInstanceOf(CoworkDisabledError);
    await expect(listMessages(caio.ctx, generalId)).rejects.toBeInstanceOf(CoworkDisabledError);
    await expect(openDirect(ana.ctx, caio.user.id)).rejects.toBeInstanceOf(ValidationError);
    await adminUpdateMember(A.ctx, caio.user.id, { blocked: false });
    await expect(assertCoworkAccess(caio.ctx)).resolves.toBeUndefined();
    await expect(adminUpdateMember(A.ctx, A.owner.id, { blocked: true })).rejects.toBeInstanceOf(ValidationError);
  });

  it("edição e exclusão controladas; arquivo da mensagem excluída deixa de ser servido", async () => {
    const m = await sendMessage(bia.ctx, generalId, { body: "Texto com erro", clientNonce: nonce() }, [{ name: "minuta.pdf", buffer: PDF }]);
    await expect(editMessage(ana.ctx, m.id, "hack")).rejects.toBeInstanceOf(ForbiddenError);
    await editMessage(bia.ctx, m.id, "Texto corrigido");
    expect((await getMessage(ana.ctx, m.id)).editedAt).toBeTruthy();
    await expect(deleteMessage(ana.ctx, m.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteMessage(bia.ctx, m.id);
    const after = await getMessage(ana.ctx, m.id);
    expect(after).toMatchObject({ deleted: true, body: "", attachments: [] });
    await expect(getAttachmentForDownload(ana.ctx, m.attachments[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.auditLog.count({ where: { action: "cowork.message.delete", resourceId: m.id } })).toBe(1);
  });

  it("arquivamento preserva o histórico, mas impede novas mensagens", async () => {
    const ch = await createChannel(ana.ctx, { name: "Projeto antigo", visibility: "PUBLIC", memberIds: [bia.user.id] });
    await sendMessage(ana.ctx, ch.id, { body: "Último registro", clientNonce: nonce() });
    await setChannelArchived(ana.ctx, ch.id, true);
    await expect(sendMessage(bia.ctx, ch.id, { body: "Mais uma", clientNonce: nonce() })).rejects.toBeInstanceOf(ConflictError);
    expect((await listMessages(bia.ctx, ch.id)).messages.some((x) => x.body === "Último registro")).toBe(true);
    await expect(setChannelArchived(bia.ctx, generalId, true)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("8. resiliência: reenvio com o mesmo identificador não duplica; envios simultâneos têm sequência única", async () => {
    const n = nonce();
    const [x, y] = await Promise.all([sendMessage(bia.ctx, generalId, { body: "Reenvio após queda", clientNonce: n }), sendMessage(bia.ctx, generalId, { body: "Reenvio após queda", clientNonce: n })]);
    expect(x.id).toBe(y.id);
    expect(await db.coworkMessage.count({ where: { channelId: generalId, clientNonce: n } })).toBe(1);
    const sent = await Promise.all(Array.from({ length: 8 }, (_, i) => sendMessage([ana, bia][i % 2]!.ctx, generalId, { body: `rajada ${i}`, clientNonce: nonce() })));
    const seqs = sent.map((s) => s.seq).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(8);
    expect(seqs[7]! - seqs[0]!).toBe(7);
    // Recuperação após reconexão: tudo depois da última sequência conhecida, em ordem.
    const catchUp = await listMessages(caio.ctx, generalId, { after: seqs[0]! - 1 });
    expect(catchUp.messages.map((m) => m.seq)).toEqual(seqs);
    expect(await coworkUnreadTotal(caio.ctx)).toBeGreaterThan(0);
  });

  it("tempo real: o aviso só sai depois do COMMIT, sem conteúdo, e nunca de uma transação desfeita", async () => {
    await ensureListener();
    const got: CoworkEvent[] = [];
    const off = subscribe(A.org.id, (e) => got.push(e));
    const otherOrg: CoworkEvent[] = [];
    const offB = subscribe(B.org.id, (e) => otherOrg.push(e));
    try {
      const m = await sendMessage(ana.ctx, generalId, { body: "Aviso em tempo real", clientNonce: nonce() });
      await expect.poll(() => got.some((e) => e.t === "message" && e.m === m.id), { timeout: 5000 }).toBe(true);
      const ev = got.find((e) => e.m === m.id)!;
      expect(ev).toEqual({ o: A.org.id, t: "message", c: generalId, s: m.seq, m: m.id });
      expect(otherOrg.some((e) => e.m === m.id)).toBe(false);
      // Transação desfeita: nenhum aviso.
      const before = got.length;
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_notify('cowork_events', ${JSON.stringify({ o: A.org.id, t: "message", c: generalId, s: -1 })})`;
        throw new Error("rollback");
      }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 400));
      expect(got.slice(before).some((e) => e.s === -1)).toBe(false);
    } finally {
      off();
      offB();
    }
  });

  it("validações de envio: anexos fora da lista e mensagens vazias são recusados", async () => {
    await expect(sendMessage(ana.ctx, generalId, { body: "  ", clientNonce: nonce() })).rejects.toBeInstanceOf(ValidationError);
    await expect(sendMessage(ana.ctx, generalId, { body: "exe", clientNonce: nonce() }, [{ name: "virus.exe", buffer: Buffer.from("MZ") }])).rejects.toBeInstanceOf(ValidationError);
    await expect(sendMessage(ana.ctx, generalId, { body: "falso pdf", clientNonce: nonce() }, [{ name: "falso.pdf", buffer: Buffer.from("nao sou pdf") }])).rejects.toBeInstanceOf(ValidationError);
    await expect(sendMessage(ana.ctx, generalId, { body: "x", clientNonce: "curto" })).rejects.toThrow();
  });
});
