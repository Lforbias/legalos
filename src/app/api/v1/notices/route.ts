import { jsonOk, queryOf, v1Route } from "@/lib/api/v1";
import { apiCreateNotice, apiListNotices, type ApiNoticeInput } from "@/server/services/public-api.service";

export const dynamic = "force-dynamic";

export const GET = v1Route("notices:read", async ({ principal, url }) => jsonOk(await apiListNotices(principal.ctx, queryOf(url))));

/** Registra uma intimação (ex.: vinda de outro sistema). `externalId` evita duplicar em reenvios. */
export const POST = v1Route("notices:write", async ({ principal, body }) => {
  const r = await apiCreateNotice(principal.ctx, (await body()) as ApiNoticeInput);
  return jsonOk({ data: r.notice, created: r.created }, r.created ? 201 : 200);
});
