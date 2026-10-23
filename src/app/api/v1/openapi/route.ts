import { jsonOk, v1Route } from "@/lib/api/v1";
import { buildOpenApi } from "@/lib/api/openapi";
import { toolCatalog, type ToolScope } from "@/server/services/rute-tools.service";
export const dynamic = "force-dynamic";
export const GET = v1Route(null, async ({ principal }) => {
  const scopes = new Set<ToolScope>();
  if (principal.scopes.has("tools:read")) scopes.add("read");
  if (principal.scopes.has("tools:propose")) scopes.add("propose");
  return jsonOk(buildOpenApi(toolCatalog(principal.ctx, scopes)));
});
