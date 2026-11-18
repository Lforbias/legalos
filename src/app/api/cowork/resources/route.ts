import { NextResponse, type NextRequest } from "next/server";
import { RESOURCE_KINDS, type ResourceKind } from "@/modules/cowork/constants";
import { errorResponse } from "@/server/http";
import { coworkRouteContext, NO_STORE } from "@/server/cowork/route-auth";
import { searchShareable } from "@/server/services/cowork-resource.service";

export const dynamic = "force-dynamic";

/** Busca de itens para compartilhar: devolve apenas o que a pessoa pode ver. */
export async function GET(req: NextRequest) {
  try {
    const auth = await coworkRouteContext();
    if ("error" in auth) return auth.error;
    const kind = req.nextUrl.searchParams.get("kind") ?? "";
    if (!(RESOURCE_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ results: [] }, { headers: NO_STORE });
    return NextResponse.json({ results: await searchShareable(auth.ctx, kind as ResourceKind, req.nextUrl.searchParams.get("q") ?? "") }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}
