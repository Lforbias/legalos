import { jsonOk, queryOf, v1Route } from "@/lib/api/v1";
import { apiListCases } from "@/server/services/public-api.service";

export const dynamic = "force-dynamic";

export const GET = v1Route("cases:read", async ({ principal, url }) => jsonOk(await apiListCases(principal.ctx, queryOf(url))));
