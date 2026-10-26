import { jsonError, jsonOk, v1Route } from "@/lib/api/v1";
import { callTool } from "@/server/services/rute-tools.service";
import { apiToolScopes } from "@/server/services/tool-api.service";
export const dynamic = "force-dynamic";
export const POST = v1Route<{ name: string }>(null, async ({ principal, params, body }) => {
  const scopes = apiToolScopes(principal);
  const result = await callTool(principal.ctx, scopes, { via: "API", connection: principal.keyId, provider: "API" }, params.name, await body());
  if (!result.ok) return jsonError(result.status ?? 500, result.code ?? "internal_error", result.text);
  return jsonOk({ data: result.data ?? null, meta: { tool: params.name, truncated: result.truncated ?? false, ...(result.truncated ? { content: result.text } : {}) } });
});
