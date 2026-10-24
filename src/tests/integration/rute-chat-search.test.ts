import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { __setToolChatForTests } from "@/lib/ai/tool-chat";
import { callTool, toolCatalog } from "@/server/services/rute-tools.service";
import { createConversation, sendMessage } from "@/server/services/rute-assistant.service";
import { setRuteFeature } from "@/server/services/rute-settings.service";
import { setOrgAiEnabled } from "@/server/services/ai.service";
import { createApiKey } from "@/server/services/apikey.service";
import { encryptSecret, mfaKey } from "@/lib/security/totp";
import { POST as restExecute } from "@/app/api/v1/tools/[name]/route";
import { POST as mcpExecute } from "@/app/api/mcp/route";
import { makeOrgWithOwner } from "./helpers";

const READ = new Set(["read"] as const);
const origin = { via: "API" as const, connection: null, provider: "teste" };
describe("RUTE encontra conversas por nome e lê a última fala recebida", () => {
 let a: Awaited<ReturnType<typeof makeOrgWithOwner>>, b: typeof a;
 let accountId: string, contactId: string, linkedId: string, clientId: string, secretId: string;
 const invoke = (name: string, args: object) => callTool(a.ctx, READ, origin, name, args);
 beforeAll(async () => {
  a = await makeOrgWithOwner("rute-chat-search"); b = await makeOrgWithOwner("rute-chat-other");
  await setRuteFeature(a.ctx, "mcp", true, {consent: true});
  await setRuteFeature(a.ctx, "assistant", true); await setOrgAiEnabled(a.ctx, true);
  const account = await db.whatsappAccount.create({data: {organizationId: a.org.id, label: "Atendimento teste", provider: "QR", riskAckAt: new Date()}}); accountId = account.id;
  const client = await db.client.create({data: {organizationId: a.org.id, type: "PERSON", name: "Luiz Felipe Oliveira Roweder Bernardes"}}); clientId = client.id;
  contactId = (await db.whatsappConversation.create({data: {organizationId: a.org.id, accountId, waId: "5511999991001", contactName: "Luiz Felipe Oliveira Roweder Bernardes", unreadCount: 7}})).id;
  linkedId = (await db.whatsappConversation.create({data: {organizationId: a.org.id, accountId, waId: "5511999991002", contactName: "Apelido no aparelho", clientId, status: "CLOSED"}})).id;
  const secret = await db.case.create({data: {organizationId: a.org.id, title: "Sigilo", confidential: true}});
  secretId = (await db.whatsappConversation.create({data: {organizationId: a.org.id, accountId, waId: "5511999991003", contactName: "Contato reservado", caseId: secret.id}})).id;
  const foreign = await db.whatsappAccount.create({data: {organizationId: b.org.id, label: "Outro", provider: "QR", riskAckAt: new Date()}});
  await db.whatsappConversation.create({data: {organizationId: b.org.id, accountId: foreign.id, waId: "5511999991004", contactName: "Luiz Felipe Oliveira Roweder Bernardes"}});
  await db.whatsappMessage.createMany({data: [
   {organizationId: a.org.id, conversationId: contactId, direction: "IN", status: "RECEIVED", body: "Mensagem antiga", createdAt: new Date("2026-10-20T10:00:00Z")},
   {organizationId: a.org.id, conversationId: contactId, direction: "IN", status: "RECEIVED", body: "Enviei o documento. Contato pessoa@example.test", createdAt: new Date("2026-10-20T11:00:00Z")},
   {organizationId: a.org.id, conversationId: contactId, direction: "OUT", status: "SENT", body: "Resposta da equipe", createdAt: new Date("2026-10-20T12:00:00Z")},
   {organizationId: a.org.id, conversationId: contactId, direction: "NOTE", type: "call", status: "NOTE", body: "Nota posterior", createdAt: new Date("2026-10-20T13:00:00Z")},
  ]});
 });
 afterAll(() => __setToolChatForTests(undefined));
 it("busca contato e cliente vinculado, inclui encerradas só quando solicitado e não mistura escritórios", async () => {
  const all = await invoke("listar_conversas_chat", {q: "Bernardes Luiz Felipe", status: "ALL"});
  expect(all.ok).toBe(true); expect(all.data).toMatchObject({total: 2});
  expect(JSON.stringify(all.data)).toContain(contactId); expect(JSON.stringify(all.data)).toContain(linkedId);
  expect((await invoke("listar_conversas_chat", {q: "Luiz Felipe"})).data).toMatchObject({total: 1});
  expect((await invoke("listar_conversas_chat", {clientId, status: "ALL"})).data).toMatchObject({total: 1, conversas: [{id: linkedId}]});
  expect((await invoke("listar_conversas_chat", {q: "não existe", status: "ALL"})).data).toMatchObject({total: 0, conversas: []});
  expect((await invoke("listar_conversas_chat", {q: "Luiz", mine: true, status: "ALL"})).data).toMatchObject({total: 0});
 });
 it("última fala IN ignora resposta e nota posteriores, mascara dados e preserva não lidas", async () => {
  const r = await invoke("ler_conversa_chat", {id: contactId, direction: "IN", limit: 1});
  expect(r.ok).toBe(true); expect(r.data).toMatchObject({total: 2, tem_mais: true, mensagens: [{direction: "IN", body: expect.stringContaining("Enviei o documento")}]});
  expect(JSON.stringify(r.data)).not.toContain("pessoa@example.test");
  expect(JSON.stringify(r.data)).not.toContain("Nota posterior"); expect(JSON.stringify(r.data)).not.toContain("Resposta da equipe");
  expect((await invoke("ler_conversa_chat", {id: contactId, direction: "IN", limit: 1, page: 2})).data).toMatchObject({mensagens: [{body: "Mensagem antiga"}], tem_mais: false});
  expect((await db.whatsappConversation.findUniqueOrThrow({where: {id: contactId}})).unreadCount).toBe(7);
  const legacy = await invoke("ler_conversa_chat", {id: contactId}); expect(legacy.data).toMatchObject({total: 4});
  expect(JSON.stringify(legacy.data)).not.toContain("mediaKey");
 });
 it("pagina além de 50 conversas e rejeita argumentos inválidos", async () => {
  await db.whatsappConversation.createMany({data: Array.from({length: 51}, (_,i) => ({organizationId: a.org.id, accountId, waId: `551199998${String(i).padStart(4,"0")}`, contactName: "Paginação teste"}))});
  const p1 = await invoke("listar_conversas_chat", {q: "Paginação teste"});
  const p2 = await invoke("listar_conversas_chat", {q: "Paginação teste", page: 2});
  expect(p1.data).toMatchObject({total: 51, pages: 2, tem_mais: true});
  expect(p2.data).toMatchObject({total: 51, tem_mais: false, conversas: [expect.objectContaining({contactName: "Paginação teste"})]});
  for (const args of [{page: 0}, {limit: 51}, {clientId: "inválido"}]) expect((await invoke("listar_conversas_chat", args)).status).toBe(422);
 });
 it("aplica permissão e sigilo na busca e leitura direta, inclusive por ID", async () => {
  const limited = {...a.ctx, isOwner: false, permissions: new Set(["ai:use", "whatsapp:read"] as const)};
  expect((await callTool(limited, READ, origin, "listar_conversas_chat", {q: "Contato reservado"})).data).toMatchObject({total: 0});
  expect((await callTool(limited, READ, origin, "ler_conversa_chat", {id: secretId})).status).toBe(404);
  expect((await callTool({...limited, permissions: new Set(["ai:use"] as const)}, READ, origin, "listar_conversas_chat", {})).status).toBe(403);
  await setRuteFeature(b.ctx, "mcp", true, {consent: true});
  expect((await callTool(b.ctx, READ, origin, "ler_conversa_chat", {id: contactId})).status).toBe(404);
 });
 it("REST e MCP expõem a mesma busca e leitura", async () => {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32,9).toString("base64");
  await db.userMfa.create({data: {userId: a.owner.id, secretEnc: encryptSecret("S", mfaKey()!), enabledAt: new Date()}});
  const token = (await createApiKey(a.ctx, {name: "Teste transporte", scopes: ["tools:read", "mcp:read"]})).token;
  const headers = {authorization: `Bearer ${token}`, "content-type": "application/json"};
  const rest = await restExecute(new Request("http://localhost/api/v1/tools/listar_conversas_chat", {method: "POST", headers, body: JSON.stringify({q: "Bernardes", status: "ALL"})}), {params: Promise.resolve({name: "listar_conversas_chat"})});
  expect(rest.status).toBe(200); expect((await rest.json()).data).toMatchObject({total: 2});
  const mcp = await mcpExecute(new Request("http://localhost/api/mcp", {method: "POST", headers, body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: "ler_conversa_chat", arguments: {id: contactId, direction: "IN", limit: 1}}})}));
  const rpc = await mcp.json(); expect(rpc.result.isError).toBe(false);
  expect(JSON.stringify(rpc.result)).toContain("Enviei o documento"); expect(JSON.stringify(rpc.result)).not.toContain("Resposta da equipe");
  const schema = toolCatalog(a.ctx, READ).find(t => t.name === "listar_conversas_chat")!.inputSchema;
  expect(schema.properties).toHaveProperty("q"); expect(schema.properties).toHaveProperty("clientId");
 });
 it("assistente encadeia busca e leitura com o mesmo catálogo e registra as consultas", async () => {
  __setToolChatForTests({name: "TEST", model: "teste", async run(input) {
   expect(input.system).toContain("direction=IN");
   expect(input.tools.find(t => t.name === "listar_conversas_chat")!.input.properties).toHaveProperty("q");
   const search = await input.runTool("listar_conversas_chat", {q: "Luiz Felipe", status: "OPEN"});
   expect(search).toContain(contactId);
   const read = await input.runTool("ler_conversa_chat", {id: contactId, direction: "IN", limit: 1});
   expect(read).toContain("Enviei o documento");
   return {text: "A última mensagem recebida diz que enviou o documento.", inputTokens: 10, outputTokens: 10, model: "teste", toolCalls: 2};
  }});
  const conv = await createConversation(a.ctx);
  const reply = await sendMessage(a.ctx, conv.id, "Veja a última mensagem recebida do Luiz Felipe");
  expect(reply.answer).toContain("enviou o documento");
  expect(reply.refs).toEqual([{type: "tool", name: "listar_conversas_chat", ok: true}, {type: "tool", name: "ler_conversa_chat", ok: true}]);
  expect((await db.whatsappConversation.findUniqueOrThrow({where: {id: contactId}})).unreadCount).toBe(7);
 });
});
