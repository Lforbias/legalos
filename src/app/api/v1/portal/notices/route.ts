import { jsonOk, v1Route } from "@/lib/api/v1";
import { db } from "@/lib/db/client";
import { importPortalNotices } from "@/server/services/portal-notice-import.service";
export const dynamic = "force-dynamic";
export const POST = v1Route("portal:import", async ({ principal, body }) => jsonOk(await importPortalNotices(principal.ctx, await body())));
export const GET = v1Route("portal:import", async ({ principal }) => {
  const org = await db.organization.findUniqueOrThrow({ where: { id: principal.ctx.organizationId }, select: { name: true } });
  return jsonOk({ organizationName: org.name, supported: ["trf3-1g"], mode: "ASSISTED_LIST_METADATA" });
});
