import { jsonOk, v1Route } from "@/lib/api/v1";
import { apiGetNotice } from "@/server/services/public-api.service";

export const dynamic = "force-dynamic";

export const GET = v1Route<{ id: string }>("notices:read", async ({ principal, params }) => jsonOk({ data: await apiGetNotice(principal.ctx, params.id) }));
