import { ForbiddenError } from "@/lib/permissions/check";
import type { ApiPrincipal } from "./apikey.service";
import { assertRuteOn } from "./rute-settings.service";
import { toolCatalog, type ToolScope } from "./rute-tools.service";

export function apiToolScopes(principal: ApiPrincipal) {
  const scopes = new Set<ToolScope>();
  if (principal.scopes.has("tools:read")) scopes.add("read");
  if (principal.scopes.has("tools:propose")) scopes.add("propose");
  if (principal.scopes.has("tools:execute")) scopes.add("execute");
  if (!scopes.size) throw new ForbiddenError("Esta chave precisa de tools:read, tools:propose ou tools:execute. Os acessos MCP não concedem acesso às ferramentas pela REST.");
  return scopes;
}
export async function apiToolCatalog(principal: ApiPrincipal) {
  const scopes = apiToolScopes(principal);
  await assertRuteOn(principal.ctx.organizationId, "mcp");
  return toolCatalog(principal.ctx, scopes);
}
