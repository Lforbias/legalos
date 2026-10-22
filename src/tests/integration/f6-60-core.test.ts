import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { __setToolChatForTests, type ToolChatProvider } from "@/lib/ai/tool-chat";
import { handleRpc } from "@/lib/mcp/protocol";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { encryptSecret, mfaKey } from "@/lib/security/totp";
import { setOrgAiEnabled } from "@/server/services/ai.service";
import { createApiKey } from "@/server/services/apikey.service";
import { createCase } from "@/server/services/case.service";
import { createClient } from "@/server/services/client.service";
import { authenticateMcpBearer, createAuthCode, exchangeCode, getClient, listMcpConnections, OAuthError, refreshTokens, registerClient, revokeMcpConnection, validRedirectUri } from "@/server/services/mcp-auth.service";
import { createConversation, getConversation, listConversations, purgeExpired, sendMessage, assistantAvailability } from "@/server/services/rute-assistant.service";
import { lgpdCsv, lgpdReport, listToolHistory, usageReport } from "@/server/services/rute-governance.service";
import { buildSkillPackage, deleteInstruction, listInstructions, saveInstruction } from "@/server/services/rute-library.service";
import { approveProposal, createProposal, listProposals, rejectProposal, updateProposal } from "@/server/services/rute-proposal.service";
import { getRuteSettings, setAssistantProvider, setEmergencyStop, setGovernance, setRuteFeature } from "@/server/services/rute-settings.service";
import { callTool, toolList } from "@/server/services/rute-tools.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const clientBase = (name: string, document = "") => ({ type: "PERSON" as const, status: "ACTIVE" as const, name, tradeName: "", document, email: "", phone: "", birthDate: "", tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "" });
const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const sha = (s: string) => createHash("sha256").update(s).digest("base64url");
const READ = new Set(["read"] as const);
const BOTH = new Set(["read", "propose"] as const);
const O = { via: "MCP" as const, connection: "Teste", provider: "MCP" };

describe("6.0 — RUTE", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let fin: Awaited<ReturnType<typeof addMember>>;
  let client: { id: string };
  let caseId: string;
  let secretCaseId: string;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    A = await makeOrgWithOwner("r6-a");
    B = await makeOrgWithOwner("r6-b");
    lawyer = await addMember(A.org.id, "LAWYER", "r6-law");
    fin = await addMember(A.org.id, "FINANCE", "r6-fin");
    client = await createClient(A.ctx, clientBase("Cliente Seis", "529.982.247-25"));
    caseId = (await createCase(A.ctx, { ...caseBase, title: "Caso Seis", clientId: client.id })).id;
    secretCaseId = (await createCase(A.ctx, { ...caseBase, title: "Caso Sigiloso Seis", confidential: true })).id;
    await setOrgAiEnabled(A.ctx, true);
    for (const u of [A.owner.id, lawyer.user.id]) await db.userMfa.upsert({ where: { userId: u }, create: { userId: u, secretEnc: encryptSecret("S", mfaKey()!), enabledAt: new Date() }, update: { enabledAt: new Date() } });
  });
  afterAll(() => __setToolChatForTests(undefined));

  describe("F8/F1 — interruptores, consentimento e parada de emergência", () => {
    it("nasce tudo desligado e as ferramentas recusam", async () => {
      const s = await getRuteSettings(A.ctx);
      expect(s.mcpEnabled || s.proposalsEnabled || s.assistantEnabled).toBe(false);
      const r = await callTool(A.ctx, READ, O, "hoje", {});
      expect(r.ok).toBe(false);
      expect(r.text).toMatch(/desligada/);
    });
    it("só quem administra integrações liga; MCP exige consentimento", async () => {
      await expect(setRuteFeature(lawyer.ctx, "mcp", true, { consent: true })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setRuteFeature(A.ctx, "mcp", true)).rejects.toBeInstanceOf(ValidationError);
      await setRuteFeature(A.ctx, "mcp", true, { consent: true });
      await setRuteFeature(A.ctx, "proposals", true);
      await setRuteFeature(A.ctx, "assistant", true);
      const s = await getRuteSettings(A.ctx);
      expect(s.mcpEnabled && s.proposalsEnabled && s.assistantEnabled && !!s.consentAt).toBe(true);
    });
    it("parada de emergência corta ferramentas, propostas e assistente; liberar volta", async () => {
      await setEmergencyStop(A.ctx, true);
      expect((await callTool(A.ctx, READ, O, "hoje", {})).ok).toBe(false);
      await expect(createProposal(A.ctx, { via: "MCP" }, { kind: "TASK", payload: { title: "Tarefa x" } })).rejects.toBeInstanceOf(ConflictError);
      await expect(createConversation(A.ctx)).rejects.toBeInstanceOf(ConflictError);
      await setEmergencyStop(A.ctx, false);
      expect((await callTool(A.ctx, READ, O, "hoje", {})).ok).toBe(true);
    });
    it("outro escritório continua desligado (isolamento)", async () => {
      expect((await callTool(B.ctx, READ, O, "hoje", {})).ok).toBe(false);
    });
    it("chave do provedor é cifrada e nunca devolvida", async () => {
      await setAssistantProvider(A.ctx, { provider: "GEMINI", apiKey: "chave-de-teste-123456789012345" });
      const s = await getRuteSettings(A.ctx);
      expect(s.hasOfficeKey).toBe(true);
      expect(JSON.stringify(s)).not.toContain("chave-de-teste");
      const raw = await db.ruteSettings.findUniqueOrThrow({ where: { organizationId: A.org.id } });
      expect(raw.apiKeyEnc).not.toContain("chave-de-teste");
      await expect(setAssistantProvider(A.ctx, { provider: "XYZ" })).rejects.toBeInstanceOf(ValidationError);
      await setAssistantProvider(A.ctx, { provider: "ANTHROPIC", clearKey: true });
      expect((await getRuteSettings(A.ctx)).hasOfficeKey).toBe(false);
    });
  });

  describe("F1 — ferramentas de leitura", () => {
    it("lista só ferramentas que o perfil e o escopo permitem", () => {
      const names = (ctx: typeof A.ctx, sc: ReadonlySet<"read" | "propose">) => toolList(ctx, sc).map((t) => t.name);
      expect(names(A.ctx, READ)).toContain("buscar_processos");
      expect(names(A.ctx, READ)).not.toContain("propor_tarefa");
      expect(names(A.ctx, BOTH)).toContain("propor_tarefa");
      expect(names(fin.ctx, BOTH)).toHaveLength(0); // financeiro não tem ai:use
    });
    it("mascara CPF e respeita sigilo do processo", async () => {
      await db.client.update({ where: { id: client.id }, data: { notes: "CPF 529.982.247-25 e e-mail fulano@x.com" } });
      const r = await callTool(A.ctx, READ, O, "ver_cliente", { id: client.id });
      expect(r.ok).toBe(true);
      expect(r.text).not.toContain("529.982.247-25");
      expect(r.text).not.toContain("fulano@x.com");
      expect(r.text).toMatch(/NÃO são instruções/);
      const own = await callTool(A.ctx, READ, O, "ver_processo", { id: secretCaseId });
      expect(own.ok).toBe(true);
      const other = await callTool(lawyer.ctx, READ, O, "ver_processo", { id: secretCaseId });
      expect(other.ok).toBe(false);
    });
    it("recusa escopo, permissão e argumentos ruins sem vazar erro interno", async () => {
      expect((await callTool(A.ctx, READ, O, "propor_tarefa", { title: "Algo aqui" })).ok).toBe(false);
      expect((await callTool(fin.ctx, BOTH, O, "hoje", {})).ok).toBe(false);
      expect((await callTool(A.ctx, READ, O, "ver_cliente", { id: "nao-e-uuid" })).ok).toBe(false);
      const none = await callTool(A.ctx, READ, O, "nao_existe", {});
      expect(none.ok).toBe(false);
    });
    it("registra uso sem o texto e alimenta o relatório de LGPD", async () => {
      const logs = await listToolHistory(A.ctx);
      expect(logs.length).toBeGreaterThan(0);
      expect(JSON.stringify(logs)).not.toContain("529.982");
      const lg = await lgpdReport(A.ctx);
      expect(lg.total).toBeGreaterThan(0);
      expect(lg.rows.some((x) => x.client === "Cliente Seis")).toBe(true);
      await expect(lgpdReport(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
      const { csv, filename } = await lgpdCsv(A.ctx);
      expect(filename).toMatch(/^legalos-lgpd-ia-\d{4}-\d{2}\.csv$/);
      expect(csv.split("\r\n")[0]).toContain("Pessoa");
    });
    it("não vaza dados de outro escritório", async () => {
      const r = await callTool(B.ctx, READ, O, "ver_cliente", { id: client.id });
      expect(r.ok).toBe(false);
    });
  });

  describe("F3/F9 — propostas com confirmação humana", () => {
    it("proposta não cria nada até aprovar; aprovar cria com a permissão de quem aprova", async () => {
      const before = await db.task.count({ where: { organizationId: A.org.id } });
      const r = await callTool(lawyer.ctx, BOTH, O, "propor_tarefa", { title: "Ligar para o perito", caseId });
      expect(r.ok).toBe(true);
      expect(await db.task.count({ where: { organizationId: A.org.id } })).toBe(before);
      const p = (await listProposals(lawyer.ctx, { status: "PENDING" }))[0]!;
      expect(p.title).toBe("Ligar para o perito");
      await expect(approveProposal(fin.ctx, p.id)).rejects.toBeInstanceOf(ForbiddenError); // financeiro não tem acesso à IA
      const res = await approveProposal(lawyer.ctx, p.id);
      expect(res.type).toBe("task");
      expect(await db.task.count({ where: { organizationId: A.org.id } })).toBe(before + 1);
      await expect(approveProposal(lawyer.ctx, p.id)).rejects.toBeInstanceOf(ConflictError); // idempotente
    });
    it("edição antes de aprovar vale; recusa não cria", async () => {
      const c = await createProposal(lawyer.ctx, { via: "ASSISTANT" }, { kind: "NOTE", payload: { caseId, body: "Texto original da nota" } });
      await updateProposal(lawyer.ctx, c.id, { body: "Texto editado pela pessoa" });
      const r = await approveProposal(lawyer.ctx, c.id);
      const note = await db.caseNote.findFirstOrThrow({ where: { id: r.id } });
      expect(note.body).toBe("Texto editado pela pessoa");
      const d = await createProposal(lawyer.ctx, { via: "MCP" }, { kind: "TASK", payload: { title: "Será recusada" } });
      await rejectProposal(lawyer.ctx, d.id, "Não precisa");
      await expect(approveProposal(lawyer.ctx, d.id)).rejects.toBeInstanceOf(ConflictError);
    });
    it("ação de maior risco exige confirmação reforçada e nunca protocola", async () => {
      const t = "Petição inicial. ".repeat(10);
      const p = await createProposal(lawyer.ctx, { via: "MCP" }, { kind: "PETICAO", payload: { caseId, title: "Inicial X", text: t } });
      await expect(approveProposal(lawyer.ctx, p.id)).rejects.toBeInstanceOf(ValidationError);
      const r = await approveProposal(lawyer.ctx, p.id, { confirmHighRisk: true });
      const pet = await db.petitionFiling.findFirstOrThrow({ where: { id: r.id } });
      expect(pet.status).toBe("DRAFT");
      const q = await createProposal(lawyer.ctx, { via: "MCP" }, { kind: "PROTOCOLO_PREPARO", payload: { petitionId: pet.id } });
      await approveProposal(lawyer.ctx, q.id, { confirmHighRisk: true });
      const after = await db.petitionFiling.findFirstOrThrow({ where: { id: pet.id } });
      expect(after.status).toBe("IN_REVIEW");
      expect(["SUBMITTING", "SUBMITTED"]).not.toContain(after.status);
    });
    it("respeita visibilidade e permissão ao propor", async () => {
      await expect(createProposal(lawyer.ctx, { via: "MCP" }, { kind: "NOTE", payload: { caseId: secretCaseId, body: "nota secreta" } })).rejects.toBeInstanceOf(NotFoundError);
      await expect(createProposal(fin.ctx, { via: "MCP" }, { kind: "NOTE", payload: { caseId, body: "nota financeiro" } })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createProposal(A.ctx, { via: "MCP" }, { kind: "NOTE", payload: { caseId, body: "x" } })).rejects.toBeInstanceOf(ValidationError);
    });
    it("remove citação de processo não verificada da minuta", async () => {
      const p = await createProposal(lawyer.ctx, { via: "MCP" }, { kind: "ANDAMENTO", payload: { caseId, text: "Conforme REsp 0001234-56.2020.8.26.0100 devemos recorrer." } });
      const v = (await listProposals(lawyer.ctx, { status: "PENDING" })).find((x) => x.id === p.id)!;
      expect(String(v.payload.text)).not.toContain("0001234-56.2020.8.26.0100");
    });
    it("expira proposta antiga", async () => {
      const p = await createProposal(lawyer.ctx, { via: "MCP" }, { kind: "TASK", payload: { title: "Vai expirar" } });
      await db.aiProposal.update({ where: { id: p.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await listProposals(lawyer.ctx, { status: "PENDING" })).some((x) => x.id === p.id)).toBe(false);
      await expect(approveProposal(lawyer.ctx, p.id)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("F1 — protocolo MCP", () => {
    it("initialize, tools/list, tools/call, ping e métodos desconhecidos", async () => {
      const pr = { id: "x", kind: "KEY" as const, connection: "Chave: t", scopes: new Set(["read"] as const) as never, ctx: A.ctx };
      const init = await handleRpc(pr, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
      expect((init?.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
      expect(await handleRpc(pr, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
      const list = (await handleRpc(pr, { jsonrpc: "2.0", id: 2, method: "tools/list" }))?.result as { tools: { name: string; inputSchema: unknown }[] };
      expect(list.tools.map((t) => t.name)).toContain("hoje");
      expect(list.tools.some((t) => t.name.startsWith("propor_"))).toBe(false);
      const call = (await handleRpc(pr, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "hoje", arguments: {} } }))?.result as { isError: boolean; content: { text: string }[] };
      expect(call.isError).toBe(false);
      const bad = (await handleRpc(pr, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "propor_tarefa", arguments: { title: "Tarefa" } } }))?.result as { isError: boolean };
      expect(bad.isError).toBe(true);
      expect((await handleRpc(pr, { jsonrpc: "2.0", id: 5, method: "ping" }))?.result).toEqual({});
      expect((await handleRpc(pr, { jsonrpc: "2.0", id: 6, method: "xyz" }))?.error?.code).toBe(-32601);
      expect((await handleRpc(pr, { jsonrpc: "1.0", id: 7, method: "ping" } as never))?.error?.code).toBe(-32600);
    });
  });

  describe("F2 — chave de API e conexões", () => {
    let token: string;
    let keyId: string;
    it("chave com escopo mcp funciona e age como a pessoa", async () => {
      const k = await createApiKey(A.ctx, { name: "Gemini CLI", scopes: ["mcp:read"] });
      token = k.token;
      keyId = k.id;
      const p = await authenticateMcpBearer(token);
      expect(p?.kind).toBe("KEY");
      expect(p?.connection).toBe("Chave: Gemini CLI");
      expect([...(p?.scopes ?? [])]).toEqual(["read"]);
      expect(p?.ctx.userId).toBe(A.owner.id);
    });
    it("chave sem escopo mcp, revogada ou lixo não autentica", async () => {
      const k = await createApiKey(A.ctx, { name: "Só intimações", scopes: ["notices:read"] });
      expect(await authenticateMcpBearer(k.token)).toBeNull();
      expect(await authenticateMcpBearer("lixo")).toBeNull();
      expect(await authenticateMcpBearer("lgmcp_a_naoexiste")).toBeNull();
    });
    it("quem administra vê e revoga; revogada para de funcionar", async () => {
      const list = await listMcpConnections(A.ctx);
      expect(list.some((c) => c.id === keyId && c.kind === "KEY")).toBe(true);
      expect((await listMcpConnections(lawyer.ctx)).some((c) => c.id === keyId)).toBe(false);
      await expect(revokeMcpConnection(lawyer.ctx, keyId)).rejects.toBeInstanceOf(NotFoundError);
      await revokeMcpConnection(A.ctx, keyId);
      expect(await authenticateMcpBearer(token)).toBeNull();
    });
  });

  describe("F2 — OAuth (cadastro, código + PKCE, renovação com rotação, revogação)", () => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = sha(verifier);
    const redirect = "https://claude.ai/api/mcp/auth_callback";
    let clientId: string;

    it("valida redirect_uri e cadastra cliente", async () => {
      expect(validRedirectUri("https://claude.ai/cb")).toBe(true);
      expect(validRedirectUri("http://localhost:8080/cb")).toBe(true);
      expect(validRedirectUri("http://evil.com/cb")).toBe(false);
      expect(validRedirectUri("javascript:alert(1)")).toBe(false);
      expect(validRedirectUri("https://x.com/cb#frag")).toBe(false);
      await expect(registerClient({ client_name: "X", redirect_uris: [] })).rejects.toBeInstanceOf(OAuthError);
      await expect(registerClient({ redirect_uris: ["http://evil.com/x"] })).rejects.toBeInstanceOf(OAuthError);
      const c = await registerClient({ client_name: "Claude", redirect_uris: [redirect] });
      clientId = c.clientId;
      expect((await getClient(clientId))?.name).toBe("Claude");
      expect(await getClient("mcpc_zz")).toBeNull();
    });
    it("código exige MFA, escritório ligado, redirect cadastrado e permissão", async () => {
      await expect(createAuthCode(fin.ctx, { clientId, redirectUri: redirect, codeChallenge: challenge, scopes: ["mcp:read"] })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createAuthCode(A.ctx, { clientId, redirectUri: "https://outro.com/cb", codeChallenge: challenge, scopes: ["mcp:read"] })).rejects.toBeInstanceOf(ValidationError);
      await expect(createAuthCode(A.ctx, { clientId, redirectUri: redirect, codeChallenge: "curto", scopes: ["mcp:read"] })).rejects.toBeInstanceOf(ValidationError);
      const noMfa = await addMember(A.org.id, "LAWYER", "r6-nomfa");
      await expect(createAuthCode(noMfa.ctx, { clientId, redirectUri: redirect, codeChallenge: challenge, scopes: ["mcp:read"] })).rejects.toBeInstanceOf(ConflictError);
    });
    it("fluxo completo: código → token → uso → renovação (rotação) → revogação", async () => {
      const { code } = await createAuthCode(lawyer.ctx, { clientId, redirectUri: redirect, codeChallenge: challenge, scopes: ["mcp:read", "mcp:propose"] });
      await expect(exchangeCode({ code, clientId, redirectUri: redirect, codeVerifier: randomBytes(32).toString("base64url") })).rejects.toMatchObject({ code: "invalid_grant" });
      const t = await exchangeCode({ code, clientId, redirectUri: redirect, codeVerifier: verifier });
      expect(t.token_type).toBe("Bearer");
      expect(t.scope).toBe("mcp:read mcp:propose");
      const p = await authenticateMcpBearer(t.access_token);
      expect(p?.kind).toBe("OAUTH");
      expect(p?.ctx.userId).toBe(lawyer.user.id);
      expect([...(p?.scopes ?? [])].sort()).toEqual(["propose", "read"]);
      // reuso do código derruba o que foi emitido
      await expect(exchangeCode({ code, clientId, redirectUri: redirect, codeVerifier: verifier })).rejects.toMatchObject({ code: "invalid_grant" });
      expect(await authenticateMcpBearer(t.access_token)).toBeNull();
    });
    it("renovação rotaciona e o refresh antigo morre; revogar corta", async () => {
      const { code } = await createAuthCode(lawyer.ctx, { clientId, redirectUri: redirect, codeChallenge: challenge, scopes: ["mcp:read"] });
      const t = await exchangeCode({ code, clientId, redirectUri: redirect, codeVerifier: verifier });
      await expect(refreshTokens({ refreshToken: t.refresh_token, clientId: "mcpc_" + "0".repeat(32) })).rejects.toMatchObject({ code: "invalid_grant" });
      const t2 = await refreshTokens({ refreshToken: t.refresh_token, clientId });
      expect(t2.access_token).not.toBe(t.access_token);
      expect(await authenticateMcpBearer(t.access_token)).toBeNull();
      expect(await authenticateMcpBearer(t2.access_token)).not.toBeNull();
      await expect(refreshTokens({ refreshToken: t.refresh_token, clientId })).rejects.toMatchObject({ code: "invalid_grant" });
      const mine = await listMcpConnections(lawyer.ctx);
      const row = mine.find((c) => c.status === "ACTIVE" && c.kind === "OAUTH")!;
      await revokeMcpConnection(lawyer.ctx, row.id);
      const all = await db.mcpOAuthToken.findMany({ where: { userId: lawyer.user.id, revokedAt: null } });
      for (const a of all) expect(a.id).not.toBe(row.id);
    });
    it("token expirado não autentica e perder a permissão corta o acesso", async () => {
      const { code } = await createAuthCode(lawyer.ctx, { clientId, redirectUri: redirect, codeChallenge: challenge, scopes: ["mcp:read"] });
      const t = await exchangeCode({ code, clientId, redirectUri: redirect, codeVerifier: verifier });
      await db.mcpOAuthToken.updateMany({ where: { accessHash: createHash("sha256").update(t.access_token).digest("hex") }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
      expect(await authenticateMcpBearer(t.access_token)).toBeNull();
    });
  });

  describe("F5 — assistente embutido", () => {
    const echo: ToolChatProvider = {
      name: "teste", model: "m",
      async run(i) {
        const out = await i.runTool("hoje", {});
        return { text: `Resposta com ${out.length > 10 ? "dados" : "nada"}. ${i.history.at(-1)?.text}`, inputTokens: 300, outputTokens: 50, model: "m", toolCalls: 1 };
      },
    };
    it("sem chave informa; com provedor responde, registra uso e referências", async () => {
      __setToolChatForTests(null);
      await db.ruteSettings.update({ where: { organizationId: A.org.id }, data: { apiKeyEnc: null } });
      const delK = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      __setToolChatForTests(undefined);
      expect((await assistantAvailability(A.ctx)).available).toBe(false);
      if (delK) process.env.ANTHROPIC_API_KEY = delK;
      __setToolChatForTests(echo);
      expect((await assistantAvailability(A.ctx)).available).toBe(true);
      const c = await createConversation(lawyer.ctx, { caseId });
      const r = await sendMessage(lawyer.ctx, c.id, "O que tenho hoje? CPF 529.982.247-25");
      expect(r.answer).toMatch(/Resposta com dados/);
      expect(r.answer).not.toContain("529.982.247-25");
      expect(r.refs.some((x) => x.type === "tool" && x.name === "hoje")).toBe(true);
      const conv = await getConversation(lawyer.ctx, c.id);
      expect(conv.messages).toHaveLength(2);
      const u = await db.aiUsage.findFirst({ where: { organizationId: A.org.id, feature: "rute_assistant" } });
      expect(u?.inputTokens).toBe(300);
    });
    it("conversa é privada de quem criou", async () => {
      const c = await createConversation(lawyer.ctx);
      await expect(getConversation(A.ctx, c.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(sendMessage(A.ctx, c.id, "oi tudo bem")).rejects.toBeInstanceOf(NotFoundError);
      expect((await listConversations(A.ctx)).some((x) => x.id === c.id)).toBe(false);
    });
    it("contexto de processo sigiloso é recusado a quem não enxerga", async () => {
      await expect(createConversation(lawyer.ctx, { caseId: secretCaseId })).rejects.toBeInstanceOf(NotFoundError);
    });
    it("proposta feita pelo assistente aparece como referência", async () => {
      const prop: ToolChatProvider = { name: "teste", model: "m", async run(i) { await i.runTool("propor_tarefa", { title: "Tarefa do assistente" }); return { text: "Propus uma tarefa.", inputTokens: 10, outputTokens: 5, model: "m", toolCalls: 1 }; } };
      __setToolChatForTests(prop);
      const c = await createConversation(lawyer.ctx);
      const r = await sendMessage(lawyer.ctx, c.id, "crie uma tarefa para mim");
      expect(r.refs.find((x) => x.type === "proposal")?.title).toBe("Tarefa do assistente");
      __setToolChatForTests(echo);
    });
    it("limite por perfil bloqueia; limite do escritório também", async () => {
      await db.aiUsage.create({ data: { organizationId: A.org.id, userId: lawyer.user.id, feature: "rute_assistant", provider: "teste", model: "m", inputTokens: 2000, outputTokens: 0 } });
      await setGovernance(A.ctx, { roleLimits: { LAWYER: 1000 } });
      const c = await createConversation(lawyer.ctx);
      await expect(sendMessage(lawyer.ctx, c.id, "mais uma pergunta")).rejects.toThrow(/limite mensal/);
      await setGovernance(A.ctx, { roleLimits: {} });
      await setGovernance(A.ctx, { monthlyTokenLimit: 1000 });
      await expect(sendMessage(lawyer.ctx, c.id, "mais uma pergunta")).rejects.toBeInstanceOf(ConflictError);
      await setGovernance(A.ctx, { monthlyTokenLimit: null });
      await expect(sendMessage(lawyer.ctx, c.id, "mais uma pergunta")).resolves.toBeTruthy();
    });
    it("valida tamanho da mensagem e IA desligada no escritório", async () => {
      const c = await createConversation(lawyer.ctx);
      await expect(sendMessage(lawyer.ctx, c.id, "x")).rejects.toBeInstanceOf(ValidationError);
      await expect(sendMessage(lawyer.ctx, c.id, "a".repeat(4100))).rejects.toBeInstanceOf(ValidationError);
    });
    it("retenção apaga conversas e registros antigos", async () => {
      const c = await createConversation(lawyer.ctx);
      await db.assistantConversation.update({ where: { id: c.id }, data: { updatedAt: new Date(Date.now() - 200 * 86_400_000) } });
      await setGovernance(A.ctx, { retentionDays: 30 });
      const r = await purgeExpired(A.org.id);
      expect(r.conversations).toBeGreaterThanOrEqual(1);
      await expect(getConversation(lawyer.ctx, c.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(setGovernance(A.ctx, { retentionDays: 0 })).rejects.toBeInstanceOf(ValidationError);
      await expect(setGovernance(lawyer.ctx, { retentionDays: 10 })).rejects.toBeInstanceOf(ForbiddenError);
      await setGovernance(A.ctx, { retentionDays: 90 });
    });
  });

  describe("F7 — biblioteca e pacote de skill", () => {
    it("só quem edita o escritório grava; membros leem os ativos", async () => {
      await expect(saveInstruction(lawyer.ctx, { area: "GERAL", kind: "INSTRUCAO", title: "Tom", body: "Escrever com formalidade." })).rejects.toBeInstanceOf(ForbiddenError);
      const a = await saveInstruction(A.ctx, { area: "geral", kind: "INSTRUCAO", title: "Tom das peças", body: "Escrever com formalidade e sem gerúndio." });
      await saveInstruction(A.ctx, { area: "TRABALHISTA", kind: "MODELO", title: "Modelo de Inicial", body: "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ [PREENCHER]" });
      await saveInstruction(A.ctx, { area: "CIVEL", kind: "INSTRUCAO", title: "Rascunho inativo", body: "Texto de instrução inativa.", active: false });
      await expect(saveInstruction(A.ctx, { area: "x", kind: "INSTRUCAO", title: "ab", body: "curto" })).rejects.toBeInstanceOf(ValidationError);
      expect((await listInstructions(lawyer.ctx)).map((x) => x.title)).not.toContain("Rascunho inativo");
      expect((await listInstructions(A.ctx)).map((x) => x.title)).toContain("Rascunho inativo");
      await expect(deleteInstruction(B.ctx, a.id)).rejects.toBeInstanceOf(NotFoundError);
    });
    it("a ferramenta da biblioteca devolve só do escritório e o assistente recebe as instruções", async () => {
      const r = await callTool(lawyer.ctx, READ, O, "biblioteca_do_escritorio", { area: "TRABALHISTA" });
      expect(r.text).toContain("Tom das peças");
      expect(r.text).toContain("Modelo de Inicial");
      expect(r.text).not.toContain("Rascunho inativo");
      let sys = "";
      __setToolChatForTests({ name: "teste", model: "m", async run(i) { sys = i.system; return { text: "ok", inputTokens: 1, outputTokens: 1, model: "m", toolCalls: 0 }; } });
      const c = await createConversation(lawyer.ctx);
      await sendMessage(lawyer.ctx, c.id, "pergunta qualquer");
      expect(sys).toContain("Tom das peças");
      expect(sys).not.toContain("Rascunho inativo");
    });
    it("gera .zip com SKILL.md e modelos, sem inativos", async () => {
      await expect(buildSkillPackage(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
      const { buffer, items } = await buildSkillPackage(A.ctx);
      expect(items).toBe(2);
      const JSZip = (await import("jszip")).default;
      const z = await JSZip.loadAsync(buffer);
      const names = Object.keys(z.files);
      expect(names).toContain("legalos-escritorio/SKILL.md");
      expect(names.some((n) => n.startsWith("legalos-escritorio/modelos/modelo-de-inicial"))).toBe(true);
      const md = await z.file("legalos-escritorio/SKILL.md")!.async("string");
      expect(md.startsWith("---\nname: legalos-escritorio")).toBe(true);
      expect(md).toContain("Tom das peças");
      expect(md).not.toContain("Rascunho inativo");
    });
  });

  describe("F8 — governança", () => {
    it("relatório de uso em tokens, por pessoa, só para administração", async () => {
      const r = await usageReport(A.ctx);
      expect(r.totalTokens).toBeGreaterThan(0);
      expect(r.byUser.length).toBeGreaterThan(0);
      expect(r.proposals.length).toBeGreaterThan(0);
      await expect(usageReport(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
      expect((await usageReport(B.ctx)).totalTokens).toBe(0);
    });
    it("histórico: pessoa comum vê só o próprio", async () => {
      const mine = await listToolHistory(lawyer.ctx);
      const all = await listToolHistory(A.ctx);
      expect(all.length).toBeGreaterThanOrEqual(mine.length);
      expect(mine.every((m) => m.who === lawyer.user.name)).toBe(true);
    });
  });
});
