import { NextResponse } from "next/server";
import { getTenant } from "@/server/session";
export const dynamic = "force-dynamic";
export async function GET() {
  const t = await getTenant();
  if (!t) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  return NextResponse.json({ error: "Os recursos da RUTE estão desativados." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
