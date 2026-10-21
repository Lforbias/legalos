import { jsonOk, v1Route } from "@/lib/api/v1";
import { apiGetCase } from "@/server/services/public-api.service";

export const dynamic = "force-dynamic";

export const GET = v1Route<{ id: string }>("cases:read", async ({ principal, params }) => jsonOk({ data: await apiGetCase(principal.ctx, params.id) }));
