import { jsonOk, queryOf, v1Route } from "@/lib/api/v1";
import { apiListDeadlines } from "@/server/services/public-api.service";

export const dynamic = "force-dynamic";

export const GET = v1Route("deadlines:read", async ({ principal, url }) => jsonOk(await apiListDeadlines(principal.ctx, queryOf(url))));
