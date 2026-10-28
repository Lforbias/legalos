import { jsonOk, v1Route } from "@/lib/api/v1";
import { receivePjeDiscoveries } from "@/server/services/pje-discovery.service";
export const dynamic = "force-dynamic";
export const POST = v1Route("pje:discover", async ({ principal, body }) => jsonOk(await receivePjeDiscoveries(principal.ctx, await body())));

export const GET = v1Route("pje:discover", async ({ principal }) => {
  const { db } = await import("@/lib/db/client");
  const org = await db.organization.findUniqueOrThrow({ where: { id: principal.ctx.organizationId }, select: { id: true, name: true } });
  return jsonOk({ organizationId: org.id, organizationName: org.name });
});
