import { IDEMPOTENCY_SCHEMA } from "@/server/services/external-tool-request.service";
import type { toolCatalog } from "@/server/services/rute-tools.service";

type Catalog = ReturnType<typeof toolCatalog>;
const response = { description: "Resultado JSON; erros usam { error: { code, message } }." };
/** O contrato de ferramentas usa o mesmo catálogo consumido pela RUTE e pelo MCP. */
export function buildOpenApi(tools: Catalog) {
  const paths: Record<string, unknown> = {};
  const resources = [
    ["/api/v1/me", "get", "Identificar escritório e escopos", []],
    ["/api/v1/cases", "get", "Listar processos", ["status", "number", "limit", "cursor"]],
    ["/api/v1/cases/{id}", "get", "Consultar processo", []],
    ["/api/v1/clients", "get", "Listar clientes", ["status", "q", "limit", "cursor"]],
    ["/api/v1/clients/{id}", "get", "Consultar cliente", []],
    ["/api/v1/deadlines", "get", "Listar prazos", ["status", "caseId", "from", "to", "limit", "cursor"]],
    ["/api/v1/notices", "get", "Listar intimações", ["status", "caseId", "limit", "cursor"]],
    ["/api/v1/notices/{id}", "get", "Consultar intimação", []],
    ["/api/v1/notices", "post", "Registrar intimação", []],
    ["/api/v1/tools", "get", "Descobrir ferramentas autorizadas", []],
    ["/api/v1/openapi", "get", "Consultar contrato OpenAPI", []],
  ] as const;
  for (const [path, method, summary, queries] of resources) {
    paths[path] = { ...(paths[path] as object ?? {}), [method]: {
      summary, tags: ["REST"], security: [{ bearerAuth: [] }],
      parameters: [...(path.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }] : []), ...queries.map(name => ({ name, in: "query", schema: { type: "string" } }))],
      ...(method === "post" ? { requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["title", "content"], properties: { title: { type: "string" }, content: { type: "string" }, kind: { type: "string", enum: ["INTIMACAO", "CITACAO", "DESPACHO", "DECISAO", "SENTENCA", "OUTRO"] }, caseNumber: { type: "string" }, court: { type: "string" }, publishedAt: { type: "string", format: "date" }, receivedAt: { type: "string", format: "date" }, externalId: { type: "string" } } } } } } } : {}),
      responses: { "200": response, ...(method === "post" ? { "201": response } : {}), "401": response, "403": response, "422": response, "429": response },
    } };
  }
  for (const tool of tools) paths[`/api/v1/tools/${tool.name}`] = { post: {
    operationId: tool.name, summary: tool.title, description: tool.description, tags: [tool.scope === "read" ? "Consultas" : tool.scope === "execute" ? "Ações diretas" : "Propostas para aprovação"],
    "x-legalos-scope": `tools:${tool.scope}`, "x-legalos-permission": tool.permission,
    security: [{ bearerAuth: [] }], parameters: tool.scope === "read" ? [] : [{ name: "Idempotency-Key", in: "header", required: true, schema: IDEMPOTENCY_SCHEMA }], requestBody: { required: true, content: { "application/json": { schema: tool.inputSchema } } },
    responses: { "200": response, "401": response, "403": response, "404": response, "409": response, "422": response, "429": response, "500": response },
  } };
  paths["/api/v1/chat/conversations/{id}/messages"]={post:{
    summary:"Enviar mensagem aprovada por pessoa",tags:["Chat"],"x-legalos-scope":"chat:send",security:[{bearerAuth:[]}],
    description:"Exige aprovação humana declarada. Janela de 24 horas da Meta, bloqueio do contato e permissões são conferidos no servidor. Reutilize a mesma chave para consultar o resultado sem repetir o envio; resultado incerto exige conferência manual.",
    parameters:[{name:"id",in:"path",required:true,schema:{type:"string",format:"uuid"}},{name:"Idempotency-Key",in:"header",required:true,schema:{type:"string",minLength:12,maxLength:120,pattern:"^[A-Za-z0-9_-]+$"}}],
    requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["text","approvedByHuman"],properties:{text:{type:"string",minLength:1,maxLength:4096},approvedByHuman:{const:true}}}}}},
    responses:{"200":response,"401":response,"403":response,"404":response,"409":response,"422":response,"429":response}
  }};
  return {
    openapi: "3.1.0", info: { title: "LegalOS API", version: "1.1.0", description: "REST de recursos e catálogo compartilhado com a RUTE e o MCP. Ferramentas são filtradas pelas permissões e escopos desta chave. Propostas exigem decisão humana no LegalOS. Escopos REST de recursos são descritos em docs/api.md; tools:read, tools:propose e tools:execute concedem acesso às consultas, propostas e ações diretas respectivamente, condicionado aos interruptores e permissões do escritório. Ações diretas gravam imediatamente e não passam por aprovação posterior." },
    paths, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "LegalOS API key" } } },
  };
}
