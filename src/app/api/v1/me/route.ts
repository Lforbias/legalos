import { jsonOk, v1Route } from "@/lib/api/v1";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** Identifica a chave: escritório e acessos efetivos. Útil para testar a conexão. */
export const GET = v1Route(null, async ({ principal }) => {
  const org = await db.organization.findUnique({ where: { id: principal.ctx.organizationId }, select: { id: true, name: true } });
  return jsonOk({ data: { organization: org, scopes: [...principal.scopes].sort() } });
});
