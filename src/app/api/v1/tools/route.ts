import { jsonOk, v1Route } from "@/lib/api/v1";
import { apiToolCatalog } from "@/server/services/tool-api.service";
export const dynamic = "force-dynamic";
export const GET = v1Route(null, async ({ principal }) => jsonOk({ data: await apiToolCatalog(principal), executionPath: "/api/v1/tools/{name}", proposalsRequireHumanApproval: true }));
