import { jsonError, jsonOk, v1Route } from "@/lib/api/v1";
import { callExternalTool } from "@/server/services/external-tool-request.service";
import { apiToolScopes } from "@/server/services/tool-api.service";
export const dynamic = "force-dynamic";
export const POST = v1Route<{ name: string }>(null, async ({ principal, params, body, req }) => {
  const scopes = apiToolScopes(principal);
  const result = await callExternalTool(principal.ctx, scopes, { via: "API", connection: principal.keyId, provider: "API" }, principal.keyId, params.name, await body(), req.headers.get("idempotency-key"));
  if (!result.ok) return jsonError(result.status ?? 500, result.code ?? "internal_error", result.text);
  return jsonOk({ data: result.data ?? null, meta: { ...(result.replayed !== undefined ? { replayed: result.replayed } : {}), tool: params.name, truncated: result.truncated ?? false, ...(result.truncated ? { content: result.text } : {}) } });
});
