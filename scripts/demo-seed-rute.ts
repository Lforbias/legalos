/**
 * Complemento do escritório de DEMONSTRAÇÃO (5.0 e 6.0): cálculo, copiloto, metas e RUTE, tudo fictício, só para as capturas de /produto.
 * Rodar DEPOIS de demo-seed.ts, no mesmo banco "_demo":  DATABASE_URL=postgresql://.../legalos_demo npx tsx scripts/demo-seed-rute.ts
 */
import { db } from "../src/lib/db/client";
import { __setAiProviderForTests } from "../src/lib/ai/provider";
import { encryptSecret, mfaKey } from "../src/lib/security/totp";
import { setOrgAiEnabled } from "../src/server/services/ai.service";
import { createApiKey } from "../src/server/services/apikey.service";
import { saveCalculation } from "../src/server/services/calculation.service";
import { setGoal } from "../src/server/services/goals.service";
import { createProposal } from "../src/server/services/rute-proposal.service";
import { saveInstruction } from "../src/server/services/rute-library.service";
import { setGovernance, setRuteFeature } from "../src/server/services/rute-settings.service";
import { callTool } from "../src/server/services/rute-tools.service";
import { analyzeSession, createSession } from "../src/server/services/service-session.service";
import { resolveTenantContext } from "../src/server/services/tenant.service";
import type { TenantContext } from "../src/server/context";

if (!/_demo(\?.*)?$/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Recusado: DATABASE_URL precisa apontar para um banco terminado em _demo.");
  process.exit(1);
}
process.env.MFA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
const META = { ipAddress: "127.0.0.1", userAgent: "demo-seed", correlationId: "demo" };

(async () => {
  const owner = await db.user.findFirstOrThrow({ where: { email: "demo@escritoriomodelo.test" } });
  const m = await db.membership.findFirstOrThrow({ where: { userId: owner.id } });
  const orgId = m.organizationId;
  const ctx = (await resolveTenantContext(owner.id, orgId, META)) as TenantContext;
  const bruno = await db.user.findFirstOrThrow({ where: { email: "bruno@escritoriomodelo.test" } });
  const camila = await db.user.findFirstOrThrow({ where: { email: "camila@escritoriomodelo.test" } });
  const lawyer = (await resolveTenantContext(bruno.id, orgId, META)) as TenantContext;
  const cases = await db.case.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } });
  const clients = await db.client.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } });
  const c0 = cases[0]!;
  const month = new Date().toISOString().slice(0, 7);

  // 5.0 — cálculo salvo no processo
  await saveCalculation(ctx, "PRAZO", { actKey: "cpc-contestacao", intimacao: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10) }, { caseId: c0.id });

  // 5.0 — copiloto de atendimento (IA simulada só aqui, para a captura)
  __setAiProviderForTests({
    name: "demo", model: "demo",
    async complete() {
      return { text: JSON.stringify({
        summary: "Cliente relata que trabalhou 3 anos sem registro em carteira e que fazia horas extras diárias, nunca pagas. Foi dispensado há duas semanas sem receber as verbas rescisórias. Procura orientação sobre o que pode cobrar.",
        actions: [{ title: "Reclamação trabalhista com pedido de reconhecimento de vínculo", basis: "Relato de trabalho habitual e subordinado sem registro; a confirmar com provas (mensagens, testemunhas)." }, { title: "Cobrança de verbas rescisórias e horas extras", basis: "Dispensa sem pagamento; a confirmar jornada e salário." }],
        tasks: [{ title: "Pedir ao cliente prints de conversas com o patrão", description: "Mensagens que mostrem ordens e horários.", priority: "HIGH" }, { title: "Levantar testemunhas", description: "Nomes e contatos de colegas.", priority: "NORMAL" }],
        documents: [{ name: "Extrato do FGTS", why: "Confirmar se houve depósitos." }, { name: "Comprovante de residência e documentos pessoais", why: "Abertura do cadastro e procuração." }],
      }), inputTokens: 900, outputTokens: 400, model: "demo" };
    },
  });
  await setOrgAiEnabled(ctx, true);
  const s = await createSession(ctx, { title: "Atendimento — vínculo e verbas rescisórias", transcript: "Cliente: Trabalhei três anos numa loja sem carteira assinada. Fazia mais de duas horas extras por dia e nunca recebi. Fui mandado embora há duas semanas e não recebi nada. Advogada: Você tem mensagens ou testemunhas? Cliente: Tenho conversas no WhatsApp com o dono e dois colegas viram tudo.", clientId: clients[3]!.id, caseId: null });
  await analyzeSession(ctx, s.id);
  __setAiProviderForTests(undefined);

  // 5.0 — metas
  for (const [uid, t] of [[null, 60], [owner.id, 18], [bruno.id, 22], [camila.id, 20]] as const) await setGoal(ctx, { userId: uid, month, metric: "TASKS_DONE", target: t });
  await setGoal(ctx, { userId: null, month, metric: "DEADLINES_DONE", target: 25 });

  // 6.0 — RUTE ligada (consentimento dado), biblioteca, conexões, propostas, conversa
  await setRuteFeature(ctx, "mcp", true, { consent: true });
  await setRuteFeature(ctx, "proposals", true);
  await setRuteFeature(ctx, "assistant", true);
  await setGovernance(ctx, { retentionDays: 90, roleLimits: { LAWYER: 200000, ASSISTANT: 100000 } });
  await saveInstruction(ctx, { area: "GERAL", kind: "INSTRUCAO", title: "Tom das peças do escritório", body: "Escrever em linguagem formal e direta, sem gerúndio e sem adjetivação excessiva. Sempre pedir a revisão de um advogado antes de qualquer protocolo." });
  await saveInstruction(ctx, { area: "TRABALHISTA", kind: "INSTRUCAO", title: "Checklist da inicial trabalhista", body: "Conferir: vínculo e datas, jornada, verbas rescisórias, FGTS, provas disponíveis e valor da causa por pedido. Indicar o que falta como [PREENCHER]." });
  await saveInstruction(ctx, { area: "PREVIDENCIARIO", kind: "MODELO", title: "Modelo de inicial — auxílio por incapacidade", body: "EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) FEDERAL DO JUIZADO ESPECIAL FEDERAL DE [PREENCHER]\n\n[NOME DO CLIENTE], qualificação [PREENCHER], vem propor a presente ação contra o INSS, pelos fatos e fundamentos a seguir." });

  await db.userMfa.upsert({ where: { userId: owner.id }, create: { userId: owner.id, secretEnc: encryptSecret("DEMO", mfaKey()!), enabledAt: new Date() }, update: { enabledAt: new Date() } });
  await createApiKey(ctx, { name: "Gemini do escritório", scopes: ["mcp:read", "mcp:propose"] });
  await db.userMfa.delete({ where: { userId: owner.id } });
  const client = await db.mcpOAuthClient.create({ data: { clientId: "mcpc_" + "d".repeat(32), name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] } });
  await db.mcpOAuthToken.create({ data: { organizationId: orgId, userId: bruno.id, clientId: client.clientId, clientName: "Claude", scopes: ["mcp:read", "mcp:propose"], accessHash: "demo-a", refreshHash: "demo-r", accessExpiresAt: new Date(Date.now() + 3_600_000), refreshExpiresAt: new Date(Date.now() + 25 * 86_400_000), lastUsedAt: new Date(Date.now() - 600_000) } });

  const O = { via: "MCP" as const, connection: "Claude", provider: "MCP" };
  const both = new Set(["read", "propose"] as const);
  await callTool(lawyer, both, O, "hoje", {});
  await callTool(lawyer, both, O, "buscar_processos", { query: "trabalhista" });
  await callTool(lawyer, both, O, "ver_cliente", { id: clients[0]!.id });
  await callTool(lawyer, both, O, "listar_prazos", {});
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  await createProposal(lawyer, { via: "MCP", connection: "Claude" }, { kind: "TASK", payload: { title: "Pedir ao cliente os holerites dos últimos 12 meses", description: "Necessário para conferir a base de cálculo das horas extras.", priority: "HIGH", dueDate: day(2), caseId: c0.id } });
  await createProposal(lawyer, { via: "MCP", connection: "Claude" }, { kind: "DEADLINE", payload: { caseId: cases[2]!.id, title: "Réplica à contestação", startDate: day(-1), days: 15, countType: "BUSINESS", notes: "Calculado a partir da ciência da intimação." } });
  await createProposal(lawyer, { via: "MCP", connection: "Claude" }, { kind: "NOTE", payload: { caseId: cases[3]!.id, title: "Resumo da sentença", body: "Sentença parcialmente procedente: devolução de 80% dos valores pagos. Avaliar recurso quanto aos juros e à multa contratual." } });
  const hi = await createProposal(lawyer, { via: "MCP", connection: "Claude" }, { kind: "PETICAO", payload: { caseId: cases[2]!.id, title: "Réplica à contestação — cobrança de empreitada", text: "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 2ª VARA CÍVEL DE CAMPINAS.\n\nO autor, já qualificado, vem apresentar RÉPLICA à contestação, pelos fatos e fundamentos que seguem. [PREENCHER: síntese da contestação e dos documentos juntados].", kind: "Réplica" } });
  void hi;
  const done = await createProposal(lawyer, { via: "ASSISTANT" }, { kind: "TASK", payload: { title: "Conferir cálculo de liquidação", priority: "NORMAL", dueDate: day(5), caseId: cases[4]!.id } });
  await db.aiProposal.update({ where: { id: done.id }, data: { status: "APPROVED", decidedById: bruno.id, decidedAt: new Date() } });

  const conv = await db.assistantConversation.create({ data: { organizationId: orgId, userId: owner.id, title: "O que preciso fazer hoje?" } });
  const msgs: [string, string, object[]][] = [
    ["user", "O que preciso fazer hoje?", []],
    ["assistant", "Hoje você tem 2 prazos nos próximos dias: a réplica à contestação (cobrança de empreitada, vence em 3 dias) e os embargos à execução fiscal (5 dias). Há 3 tarefas suas em aberto, sendo 1 urgente (revisar a minuta de embargos), e 5 intimações novas na caixa de entrada. Quer que eu proponha uma tarefa para cada prazo?", [{ type: "tool", name: "hoje", ok: true }, { type: "tool", name: "listar_prazos", ok: true }]],
    ["user", "Sim, proponha uma tarefa para a réplica.", []],
    ["assistant", "Propus a tarefa “Preparar a réplica à contestação” com vencimento em 2 dias. Ela só será criada depois que você confirmar em RUTE → Propostas.", [{ type: "tool", name: "propor_tarefa", ok: true }]],
  ];
  for (const [i, [role, content, refs]] of msgs.entries()) await db.assistantMessage.create({ data: { organizationId: orgId, conversationId: conv.id, role, content, refs: refs as never, tokens: role === "assistant" ? 420 : 0, createdAt: new Date(Date.now() - (msgs.length - i) * 60_000) } });
  await db.aiUsage.createMany({ data: [
    { organizationId: orgId, userId: owner.id, feature: "rute_assistant", provider: "anthropic", model: "claude", inputTokens: 5200, outputTokens: 900 },
    { organizationId: orgId, userId: bruno.id, feature: "rute_assistant", provider: "anthropic", model: "claude", inputTokens: 8300, outputTokens: 1400 },
    { organizationId: orgId, userId: camila.id, feature: "case_qa", provider: "anthropic", model: "claude", inputTokens: 2100, outputTokens: 600 },
  ] });
  console.log("ok rute demo", conv.id, s.id);
})().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
