import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http";
import { coworkRouteContext, NO_STORE } from "@/server/cowork/route-auth";
import { getMessage } from "@/server/services/cowork-message.service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await coworkRouteContext();
    if ("error" in auth) return auth.error;
    return NextResponse.json({ message: await getMessage(auth.ctx, (await params).id) }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}
