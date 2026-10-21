import { jsonOk, v1Route } from "@/lib/api/v1";
import { apiGetClient } from "@/server/services/public-api.service";

export const dynamic = "force-dynamic";

export const GET = v1Route<{ id: string }>("clients:read", async ({ principal, params }) => jsonOk({ data: await apiGetClient(principal.ctx, params.id) }));
