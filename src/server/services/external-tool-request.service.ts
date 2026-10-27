import { ConflictError } from "@/lib/permissions/check";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import type { TenantContext } from "@/server/context";
import { assertRuteOn } from "./rute-settings.service";
import { callTool, toolList, type Origin, type ToolResult, type ToolScope } from "./rute-tools.service";

const error = (status: number, code: string, text: string): ToolResult => ({ ok: false, status, code, text });
const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const IDEMPOTENCY_DESCRIPTION = "Obrigatória para escrita: chave única da operação (12 a 120 caracteres, letras, números, _ ou -). Reutilize exatamente a mesma chave e argumentos em um reenvio. Nunca gere outra chave para repetir uma operação cujo resultado é incerto.";
export const IDEMPOTENCY_SCHEMA = { type: "string", minLength: 12, maxLength: 120, pattern: "^[A-Za-z0-9_-]+$", description: IDEMPOTENCY_DESCRIPTION };

/** Shared REST/MCP boundary. Authentication happens on every request; authorization precedes cache access. */
export async function callExternalTool(ctx: TenantContext, scopes: ReadonlySet<ToolScope>, origin: Origin & { via: "API" | "MCP" }, principalId: string, name: string, args: unknown, key?: unknown): Promise<ToolResult & { replayed?: boolean }> {
  const tool = toolList(ctx, scopes).find(t => t.name === name);
  // Preserve normal permission/not-found errors; callers cannot discover or replay unauthorized tools.
  if (!tool || tool.scope === "read") return callTool(ctx, scopes, origin, name, args);
  try { await assertRuteOn(ctx.organizationId, "mcp"); } catch (e) { return error(409, "conflict", e instanceof ConflictError ? e.message : "RUTE indisponível."); }
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{12,120}$/.test(key)) return error(422, "idempotency_key_required", IDEMPOTENCY_DESCRIPTION);
  const hash = createHash("sha256").update(canonical([name, args ?? {}])).digest("hex");
  const inserted = await db.$executeRaw`INSERT INTO external_tool_requests
    (organization_id,user_id,channel,principal_id,idempotency_key,request_hash,state)
    VALUES (${ctx.organizationId}::uuid,${ctx.userId}::uuid,${origin.via},${principalId},${key},${hash},'RUNNING') ON CONFLICT DO NOTHING`;
  if (!inserted) {
    const [prior] = await db.$queryRaw<{ request_hash: string; state: string; result: ToolResult | null; created_at: Date }[]>`
      SELECT request_hash,state,result,created_at FROM external_tool_requests WHERE organization_id=${ctx.organizationId}::uuid
      AND user_id=${ctx.userId}::uuid AND channel=${origin.via} AND principal_id=${principalId} AND idempotency_key=${key}`;
    if (!prior || prior.request_hash !== hash) return error(409, "idempotency_conflict", "Essa chave já foi usada para outra ferramenta ou outros argumentos. Use uma chave diferente somente para uma nova operação.");
    if (prior.state === "DONE" && prior.result) return { ...prior.result, replayed: true };
    const inProgress = prior.state === "RUNNING" && Date.now() - new Date(prior.created_at).getTime() < 30 * 60_000;
    return error(409, inProgress ? "idempotency_in_progress" : "idempotency_outcome_unknown", "Essa operação está em andamento ou teve resultado incerto. Consulte os registros e a auditoria antes de uma nova operação; não será executada novamente com essa chave.");
  }
  try {
    const result = await callTool(ctx, scopes, origin, name, args);
    const state = !result.ok && (result.status ?? 500) >= 500 ? "UNKNOWN" : "DONE";
    await db.$executeRaw`UPDATE external_tool_requests SET state=${state},result=${JSON.stringify(result)}::jsonb
      WHERE organization_id=${ctx.organizationId}::uuid AND user_id=${ctx.userId}::uuid AND channel=${origin.via}
      AND principal_id=${principalId} AND idempotency_key=${key}`;
    return { ...result, replayed: false };
  } catch (e) {
    await db.$executeRaw`UPDATE external_tool_requests SET state='UNKNOWN' WHERE organization_id=${ctx.organizationId}::uuid
      AND user_id=${ctx.userId}::uuid AND channel=${origin.via} AND principal_id=${principalId} AND idempotency_key=${key}`.catch(() => undefined);
    throw e;
  }
}
