import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/server/http";
import { coworkRouteContext, NO_STORE } from "@/server/cowork/route-auth";
import { searchMessages } from "@/server/services/cowork-message.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await coworkRouteContext();
    if ("error" in auth) return auth.error;
    return NextResponse.json({ results: await searchMessages(auth.ctx, req.nextUrl.searchParams.get("q") ?? "") }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}
