import { jsonOk, queryOf, v1Route } from "@/lib/api/v1";
import { apiListClients } from "@/server/services/public-api.service";

export const dynamic = "force-dynamic";

export const GET = v1Route("clients:read", async ({ principal, url }) => jsonOk(await apiListClients(principal.ctx, queryOf(url))));
