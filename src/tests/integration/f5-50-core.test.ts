import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { __setAiProviderForTests, type AiProvider } from "@/lib/ai/provider";
import { __setTranscriberForTests } from "@/lib/ai/gemini";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { setOrgAiEnabled } from "@/server/services/ai.service";
import { createCase } from "@/server/services/case.service";
import { createClient } from "@/server/services/client.service";
import { createTask } from "@/server/services/task.service";
import { createNotice } from "@/server/services/notice.service";
import { deleteCalculation, exportCalculation, getCalculation, listCalculations, listSeriesRows, loadOfficeTables, runCalculation, saveCalculation, setCalcIndex } from "@/server/services/calculation.service";
import { approvePortalUpdate, approvedUpdatesForPortalCase, createClientPending, draftPortalUpdate, listMyMessages, listMyPendings, listMessagesForClient, markMyPendingDone, replyToClient, sendMyMessage, setPendingStatus } from "@/server/services/portal-plus.service";
import { setCaseSharing } from "@/server/services/portal.service";
import { discardTriage, getTriage, presumedAwareness, triageNotice, updateTriageMinuta, validateTriage } from "@/server/services/notice-triage.service";
import { analyzeSession, approveSession, createSession, deleteSession, getSession, parseAnalysis, transcribeAudio } from "@/server/services/service-session.service";
import { applyDistribution, goalProgress, setGoal, suggestDistribution, weightedWorkload } from "@/server/services/goals.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const clientBase = (name: string, document = "") => ({ type: "PERSON" as const, status: "ACTIVE" as const, name, tradeName: "", document, email: "", phone: "", birthDate: "", tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "" });
const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const taskBase = { title: "Tarefa", description: "", status: "TODO" as const, priority: "NORMAL" as const, dueDate: "", assigneeId: "", caseId: "", clientId: "" };
const fake = (reply: string): AiProvider => ({ name: "teste", model: "m", async complete() { return { text: reply, inputTokens: 100, outputTokens: 20, model: "m" }; } });

describe("5.0 — cálculos, portal, triagem, copiloto e metas", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let fin: Awaited<ReturnType<typeof addMember>>;
  let clientUser: Awaited<ReturnType<typeof addMember>>;
  let client: { id: string };
  let caseId: string;

  beforeAll(async () => {
    A = await makeOrgWithOwner("f50-a");
    B = await makeOrgWithOwner("f50-b");
    lawyer = await addMember(A.org.id, "LAWYER", "f50-law");
    fin = await addMember(A.org.id, "FINANCE", "f50-fin");
    clientUser = await addMember(A.org.id, "CLIENT", "f50-cli");
    client = await createClient(A.ctx, clientBase("Cliente Cinco", "529.982.247-25"));
    caseId = (await createCase(A.ctx, { ...caseBase, title: "Caso 5.0", clientId: client.id })).id;
    await db.portalAccount.create({ data: { organizationId: A.org.id, userId: clientUser.user.id, clientId: client.id } });
  });
  afterAll(() => {
    __setAiProviderForTests(undefined);
    __setTranscriberForTests(undefined);
  });

  describe("F1 — calculadoras", () => {
    const prazo = { actKey: "cpc-contestacao", intimacao: "2026-03-02" };
    it("prazo roda sem índices; tipo inválido e dados inválidos são recusados com mensagem", async () => {
      const { result } = await runCalculation(A.ctx, "PRAZO", prazo);
      expect(result.title).toMatch(/Contesta/i);
      await expect(runCalculation(A.ctx, "PRAZO", { actKey: "nao-existe", intimacao: "2026-03-02" })).rejects.toBeInstanceOf(ValidationError);
      await expect(runCalculation(A.ctx, "XX" as never, {})).rejects.toBeInstanceOf(ValidationError);
    });
    it("TJSP sem tabela do escritório recusa; carregar tabelas permite e não duplica", async () => {
      const input = { metodo: "TABELA_TJSP", dataBase: "2024-08-01", itens: [{ descricao: "Duplicata", valor: "1.000,00", vencimento: "2024-01-10" }] };
      expect((await runCalculation(A.ctx, "TJSP", input).catch((e) => e)) as unknown).toBeInstanceOf(ValidationError);
      await expect(loadOfficeTables(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
      const r = await loadOfficeTables(fin.ctx);
      expect(r.added).toBeGreaterThan(50);
      await expect(loadOfficeTables(fin.ctx)).rejects.toBeInstanceOf(ConflictError);
      const { result } = await runCalculation(A.ctx, "TJSP", { ...input, jurosMensais: "1" });
      expect(result.total).toBe("1111.81");
    });
    it("índice do escritório: só quem administra o financeiro lança; o outro escritório não enxerga", async () => {
      await expect(setCalcIndex(lawyer.ctx, { series: "SELIC", month: "2030-01", value: "0,5" })).rejects.toBeInstanceOf(ForbiddenError);
      await setCalcIndex(fin.ctx, { series: "SELIC", month: "2030-01", value: "0,5" });
      await expect(setCalcIndex(fin.ctx, { series: "SELIC", month: "2030-01", value: "abc" })).rejects.toBeInstanceOf(ValidationError);
      await expect(setCalcIndex(fin.ctx, { series: "REAJUSTE_INSS", month: "2030-03", value: "3" })).rejects.toBeInstanceOf(ValidationError);
      expect((await listSeriesRows(A.ctx, "SELIC")).some((r) => r.month === "2030-01" && r.own)).toBe(true);
      expect((await listSeriesRows(B.ctx, "SELIC")).some((r) => r.month === "2030-01")).toBe(false);
    });
    it("salvar recalcula no servidor, vincula ao processo, exporta CSV/Excel/memorial e respeita permissão e isolamento", async () => {
      const row = await saveCalculation(A.ctx, "PRAZO", prazo, { caseId });
      const got = await getCalculation(A.ctx, row.id);
      expect(got.caseId).toBe(caseId);
      expect((await listCalculations(A.ctx, { caseId })).length).toBe(1);
      const csv = await exportCalculation(A.ctx, row.id, "csv");
      expect(csv.body.toString("utf8")).toContain(";");
      const xl = await exportCalculation(A.ctx, row.id, "xlsx");
      expect(xl.body.subarray(0, 2).toString()).toBe("PK");
      expect((await exportCalculation(A.ctx, row.id, "txt")).name).toMatch(/memoria\.txt$/);
      await expect(getCalculation(B.ctx, row.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(saveCalculation(clientUser.ctx, "PRAZO", prazo)).rejects.toBeInstanceOf(ForbiddenError);
      await deleteCalculation(A.ctx, row.id);
      await expect(getCalculation(A.ctx, row.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("F2 — portal em linguagem simples, pendências e mensagens", () => {
    it("andamento só aparece ao cliente depois de aprovado, e só se o processo estiver compartilhado", async () => {
      const d = await draftPortalUpdate(A.ctx, caseId, { originalText: "Juntada de petição.", plainText: "O escritório enviou um documento ao processo." });
      expect(await approvedUpdatesForPortalCase(clientUser.ctx, caseId)).toEqual([]);
      await approvePortalUpdate(A.ctx, d.id, "O escritório enviou um documento ao juiz.");
      expect(await approvedUpdatesForPortalCase(clientUser.ctx, caseId)).toEqual([]); // não compartilhado
      await setCaseSharing(A.ctx, caseId, true);
      const seen = await approvedUpdatesForPortalCase(clientUser.ctx, caseId);
      expect(seen.map((s) => s.plainText)).toEqual(["O escritório enviou um documento ao juiz."]);
      expect(JSON.stringify(seen)).not.toContain("Juntada de petição");
      await expect(approvePortalUpdate(A.ctx, d.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(draftPortalUpdate(A.ctx, caseId, { originalText: "Texto qualquer sem modelo conhecido" })).rejects.toBeInstanceOf(ValidationError);
      await expect(draftPortalUpdate(clientUser.ctx, caseId, { originalText: "x", plainText: "y" })).rejects.toBeInstanceOf(ForbiddenError);
    });
    it("pendências: criada pela equipe, marcada pelo cliente, confirmada pela equipe", async () => {
      const p = await createClientPending(A.ctx, { clientId: client.id, caseId, title: "Enviar comprovante de residência" });
      const mine = await listMyPendings(clientUser.ctx);
      expect(mine.map((m) => m.title)).toContain("Enviar comprovante de residência");
      await markMyPendingDone(clientUser.ctx, p.id, "Enviei por e-mail");
      expect((await db.clientPending.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CLIENT_DONE");
      await expect(markMyPendingDone(clientUser.ctx, p.id)).rejects.toBeInstanceOf(NotFoundError);
      await setPendingStatus(A.ctx, p.id, "DONE");
      await expect(createClientPending(clientUser.ctx, { clientId: client.id, title: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    });
    it("mensagens: cliente envia, equipe responde; mensagem de outro cliente não aparece; vazia é recusada", async () => {
      await sendMyMessage(clientUser.ctx, "Bom dia, tenho uma dúvida.");
      await expect(sendMyMessage(clientUser.ctx, "   ")).rejects.toBeInstanceOf(ValidationError);
      await replyToClient(A.ctx, client.id, "Olá! Já vamos responder.");
      const msgs = await listMyMessages(clientUser.ctx);
      expect(msgs.map((m) => m.fromClient)).toEqual([true, false]);
      expect((await listMessagesForClient(A.ctx, client.id)).length).toBe(2);
      const other = await createClient(A.ctx, clientBase("Outro Cliente"));
      expect((await listMessagesForClient(A.ctx, other.id)).length).toBe(0);
      await expect(sendMyMessage(lawyer.ctx, "oi")).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("F4 — triagem de publicações", () => {
    const notice = (o: Record<string, unknown>) => ({ source: "MANUAL" as const, kind: "INTIMACAO" as const, title: "Intimação para contestar", content: "Cite-se o réu para contestar a ação no prazo legal. Publique-se.", caseNumber: "", court: "TJSP", publishedAt: "2026-03-05", receivedAt: "2026-03-05", caseId, ...o });
    it("ciência presumida é o primeiro dia útil depois da publicação (sexta → segunda)", () => {
      expect(presumedAwareness("2026-03-06")).toBe("2026-03-09");
      expect(presumedAwareness("2026-03-05")).toBe("2026-03-06");
    });
    it("gera triagem por regras: ato, prazo calculado e minuta em rascunho; nada vira prazo sozinho", async () => {
      const n = await createNotice(A.ctx, notice({}) as never);
      const t = await triageNotice(A.ctx, n.id);
      const got = await getTriage(A.ctx, n.id);
      expect(got!.actKey).toBe("cpc-contestacao");
      expect(got!.days).toBe(15);
      expect(got!.dueDate).toMatch(/^2026-03-/);
      expect(got!.source).toBe("RULES");
      expect(got!.minuta).toMatch(/\[PREENCHER/i);
      expect(t.calcNote).toMatch(/ciência presumida/i);
      expect(await db.deadline.count({ where: { organizationId: A.org.id, sourceNoticeId: n.id } })).toBe(0);
    });
    it("IA só com chave real e IA ligada; com IA a minuta leva o aviso de rascunho e sem número de processo inventado", async () => {
      const n = await createNotice(A.ctx, notice({ title: "Outra intimação contestar", content: "Intime-se para contestar no prazo de 15 dias úteis." }) as never);
      __setAiProviderForTests(null);
      await expect(triageNotice(A.ctx, n.id, { useAi: true })).rejects.toBeInstanceOf(ConflictError);
      __setAiProviderForTests(fake("Excelentíssimo Juiz, conforme processo 0001234-56.2019.8.26.0100 ..."));
      await setOrgAiEnabled(A.ctx, true);
      await triageNotice(A.ctx, n.id, { useAi: true });
      const got = await getTriage(A.ctx, n.id);
      expect(got!.source).toBe("AI");
      expect(got!.minuta).toMatch(/^RASCUNHO GERADO POR IA/);
      expect(got!.minuta).not.toContain("0001234-56.2019.8.26.0100");
      expect(await db.aiUsage.count({ where: { organizationId: A.org.id, feature: "notice_triage" } })).toBe(1);
    });
    it("validar com prazo cria o prazo em RASCUNHO; só quem pode; sem processo recusa; descartar encerra", async () => {
      const n = await createNotice(A.ctx, notice({ title: "Para validar", content: "Intime-se para contestar." }) as never);
      await triageNotice(A.ctx, n.id);
      await updateTriageMinuta(A.ctx, n.id, "Minuta revisada por advogado.");
      await expect(validateTriage(fin.ctx, n.id, { createDeadline: false })).rejects.toBeInstanceOf(ForbiddenError);
      const r = await validateTriage(A.ctx, n.id, { createDeadline: true });
      const dl = await db.deadline.findUniqueOrThrow({ where: { id: r.deadlineId! } });
      expect(dl.status).toBe("DRAFT");
      expect(dl.caseId).toBe(caseId);
      await expect(validateTriage(A.ctx, n.id, { createDeadline: false })).rejects.toBeInstanceOf(ConflictError);
      const semProc = await createNotice(A.ctx, notice({ title: "Sem processo", content: "Intime-se para contestar.", caseId: "" }) as never);
      await triageNotice(A.ctx, semProc.id);
      await expect(validateTriage(A.ctx, semProc.id, { createDeadline: true })).rejects.toBeInstanceOf(ValidationError);
      await discardTriage(A.ctx, semProc.id);
      await expect(updateTriageMinuta(A.ctx, semProc.id, "x")).rejects.toBeInstanceOf(ConflictError);
    });
    it("triagem é isolada por escritório", async () => {
      const n = await createNotice(A.ctx, notice({ title: "Isolada", content: "Intime-se para contestar." }) as never);
      await expect(getTriage(B.ctx, n.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("F5 — copiloto de atendimento", () => {
    const transcript = "Cliente relata que foi demitida sem justa causa em março e não recebeu as verbas rescisórias. Trabalhava há quatro anos como vendedora, com salário de dois mil reais. Pediu orientação sobre o que pode fazer e quais documentos levar.";
    const reply = '```json\n{"summary":"Demissão sem justa causa sem pagamento de verbas.","actions":[{"title":"Reclamação trabalhista","basis":"Relato de verbas não pagas; confirmar data de admissão."}],"tasks":[{"title":"Pedir CTPS e extrato do FGTS","description":"Solicitar ao cliente","priority":"HIGH"},{"title":"Calcular verbas rescisórias","description":"","priority":"NORMAL"}],"documents":[{"name":"CTPS","why":"comprovar vínculo"}]}\n```';
    it("transcrição curta é recusada; análise exige IA configurada e ligada", async () => {
      await expect(createSession(A.ctx, { title: "Atendimento", transcript: "curta" })).rejects.toBeInstanceOf(ValidationError);
      const s = await createSession(lawyer.ctx, { title: "Atendimento 1", transcript, caseId, clientId: client.id });
      __setAiProviderForTests(null);
      await expect(analyzeSession(lawyer.ctx, s.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(createSession(fin.ctx, { title: "Sem IA", transcript })).rejects.toBeInstanceOf(ForbiddenError);
    });
    it("a IA devolve rascunho; nada vira tarefa até uma pessoa marcar e revisar; só as marcadas são criadas", async () => {
      __setAiProviderForTests(fake(reply));
      await setOrgAiEnabled(A.ctx, true);
      const s = await createSession(lawyer.ctx, { title: "Atendimento 2", transcript, caseId, clientId: client.id });
      const a = await analyzeSession(lawyer.ctx, s.id);
      expect(a.tasks.length).toBe(2);
      expect(a.actions[0]!.title).toBe("Reclamação trabalhista");
      const before = await db.task.count({ where: { organizationId: A.org.id } });
      expect(before).toBe(0);
      const r = await approveSession(lawyer.ctx, s.id, { taskIndexes: [0, 0, 9], assigneeId: lawyer.user.id });
      expect(r.created).toBe(1);
      const t = await db.task.findFirstOrThrow({ where: { organizationId: A.org.id } });
      expect(t.title).toBe("Pedir CTPS e extrato do FGTS");
      expect(t.priority).toBe("HIGH");
      expect(t.assigneeId).toBe(lawyer.user.id);
      expect(t.caseId).toBe(caseId);
      await expect(approveSession(lawyer.ctx, s.id, { taskIndexes: [1] })).rejects.toBeInstanceOf(ConflictError);
      expect((await getSession(lawyer.ctx, s.id)).status).toBe("REVIEWED");
      await expect(getSession(A.ctx, s.id).then((x) => x.id)).resolves.toBe(s.id); // dono do escritório
      await deleteSession(lawyer.ctx, s.id);
    });
    it("a IA recebe a transcrição com dados sensíveis mascarados; resposta ilegível dá erro claro e número de processo some", async () => {
      let seen = "";
      __setAiProviderForTests({ name: "t", model: "m", async complete({ messages }) { seen = messages[0]!.content; return { text: "sem json", inputTokens: 1, outputTokens: 1, model: "m" }; } });
      const s = await createSession(lawyer.ctx, { title: "Mascara", transcript: `${transcript} O CPF dele é 529.982.247-25.` });
      await expect(analyzeSession(lawyer.ctx, s.id)).rejects.toBeInstanceOf(ConflictError);
      expect(seen).not.toContain("529.982.247-25");
      const p = parseAnalysis('{"summary":"ok 0001234-56.2019.8.26.0100","actions":[],"tasks":[{"title":"ab","description":"x","priority":"ZZ"},{"title":"Tarefa válida","description":"","priority":"ZZ"}],"documents":[]}');
      expect(p.summary).toContain("não verificado");
      expect(p.tasks).toHaveLength(1);
      expect(p.tasks[0]!.priority).toBe("NORMAL");
    });
    it("áudio: sem chave, ou formato inválido, nada é inventado; com transcritor simulado só o texto volta", async () => {
      __setTranscriberForTests(null);
      await expect(transcribeAudio(lawyer.ctx, { mime: "audio/mpeg", data: Buffer.from("abc") })).rejects.toBeInstanceOf(ConflictError);
      await expect(transcribeAudio(lawyer.ctx, { mime: "video/mp4", data: Buffer.from("abc") })).rejects.toBeInstanceOf(ValidationError);
      __setTranscriberForTests({ name: "gemini", model: "g", async transcribe() { return { text: "Texto do áudio.", inputTokens: 5, outputTokens: 3 }; } });
      expect((await transcribeAudio(lawyer.ctx, { mime: "audio/mpeg", data: Buffer.from("abc") })).text).toBe("Texto do áudio.");
      expect(await db.aiUsage.count({ where: { organizationId: A.org.id, feature: "audio_transcribe" } })).toBe(1);
    });
  });

  describe("F6 — metas e carga por peso", () => {
    const month = new Date().toISOString().slice(0, 7);
    let heavy: { id: string };
    beforeAll(async () => {
      const tt = await db.taskType.create({ data: { organizationId: A.org.id, name: "Peça complexa", points: 5 } });
      heavy = await createTask(A.ctx, { ...taskBase, title: "Peça pesada" });
      await db.task.update({ where: { id: heavy.id }, data: { typeId: tt.id } });
      await createTask(A.ctx, { ...taskBase, title: "Leve 1" });
      await createTask(A.ctx, { ...taskBase, title: "Leve 2" });
      await createTask(A.ctx, { ...taskBase, title: "Do advogado", assigneeId: lawyer.user.id });
    });
    it("metas: só administrador define; valida mês, medida e valor; atualizar não duplica", async () => {
      await expect(setGoal(lawyer.ctx, { userId: lawyer.user.id, month, metric: "TASKS_DONE", target: 10 })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setGoal(A.ctx, { month: "2026-13", metric: "TASKS_DONE", target: 10 })).rejects.toBeInstanceOf(ValidationError);
      await expect(setGoal(A.ctx, { month, metric: "NADA", target: 10 })).rejects.toBeInstanceOf(ValidationError);
      await expect(setGoal(A.ctx, { month, metric: "TASKS_DONE", target: 0 })).rejects.toBeInstanceOf(ValidationError);
      await setGoal(A.ctx, { userId: lawyer.user.id, month, metric: "POINTS_DONE", target: 4 });
      await setGoal(A.ctx, { userId: lawyer.user.id, month, metric: "POINTS_DONE", target: 6 });
      await setGoal(A.ctx, { month, metric: "TASKS_DONE", target: 3 });
      expect(await db.workGoal.count({ where: { organizationId: A.org.id, month } })).toBe(2);
      await expect(setGoal(A.ctx, { userId: clientUser.user.id, month, metric: "HOURS", target: 1 })).resolves.toBeDefined();
    });
    it("progresso conta só o concluído no mês, com peso do tipo (sem tipo = 1 ponto)", async () => {
      const mine = await createTask(A.ctx, { ...taskBase, title: "Concluída com peso", assigneeId: lawyer.user.id });
      const tt = await db.taskType.findFirstOrThrow({ where: { organizationId: A.org.id } });
      await db.task.update({ where: { id: mine.id }, data: { typeId: tt.id, status: "DONE", completedAt: new Date() } });
      const plain = await createTask(A.ctx, { ...taskBase, title: "Concluída sem tipo", assigneeId: lawyer.user.id });
      await db.task.update({ where: { id: plain.id }, data: { status: "DONE", completedAt: new Date() } });
      const old = await createTask(A.ctx, { ...taskBase, title: "Concluída ano passado", assigneeId: lawyer.user.id });
      await db.task.update({ where: { id: old.id }, data: { status: "DONE", completedAt: new Date(Date.now() - 400 * 86_400_000) } });
      const p = await goalProgress(A.ctx, month);
      const pts = p.rows.find((r) => r.userId === lawyer.user.id && r.metric === "POINTS_DONE")!;
      expect(pts.actual).toBe(6);
      expect(pts.pct).toBe(100);
      const team = p.rows.find((r) => r.userId === null)!;
      expect(team.actual).toBe(2);
      await expect(goalProgress(fin.ctx, month)).rejects.toBeInstanceOf(ForbiddenError);
    });
    it("carga por peso e sugestão de distribuição: mais pesada vai para quem tem menos pontos; nada muda sem confirmação", async () => {
      const w = await weightedWorkload(A.ctx);
      expect(w.members.find((m) => m.userId === lawyer.user.id)!.points).toBe(2); // 'Do advogado' + a tarefa criada pelo copiloto
      expect(w.unassigned.count).toBe(3);
      expect(w.unassigned.points).toBe(7);
      const sug = await suggestDistribution(A.ctx, { userIds: [A.owner.id, lawyer.user.id] });
      expect(sug).toHaveLength(3);
      expect(sug[0]!.taskId).toBe(heavy.id);
      expect(sug[0]!.userId).toBe(A.owner.id); // owner 0 pt < lawyer 2 pt
      expect(await db.task.count({ where: { organizationId: A.org.id, assigneeId: null, status: "TODO" } })).toBe(3);
      const r = await applyDistribution(A.ctx, [{ taskId: heavy.id, userId: A.owner.id }, { taskId: sug[1]!.taskId, userId: "00000000-0000-4000-8000-000000000000" }]);
      expect(r).toEqual({ applied: 1, skipped: 1 });
      expect((await db.task.findUniqueOrThrow({ where: { id: heavy.id } })).assigneeId).toBe(A.owner.id);
      expect((await applyDistribution(A.ctx, [{ taskId: heavy.id, userId: lawyer.user.id }])).skipped).toBe(1); // já tem responsável
      await expect(applyDistribution(fin.ctx, [])).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
