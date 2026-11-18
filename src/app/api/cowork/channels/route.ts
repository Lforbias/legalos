import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http";
import { coworkRouteContext, NO_STORE } from "@/server/cowork/route-auth";
import { listJoinableChannels, listMyChannels } from "@/server/services/cowork-channel.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await coworkRouteContext();
    if ("error" in auth) return auth.error;
    const url = new URL(req.url);
    if (url.searchParams.get("joinable") === "1") return NextResponse.json({ channels: await listJoinableChannels(auth.ctx) }, { headers: NO_STORE });
    const channels = await listMyChannels(auth.ctx, { includeArchived: url.searchParams.get("archived") === "1" });
    return NextResponse.json({ channels }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}
