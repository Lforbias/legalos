import { NextResponse } from "next/server";
import { liveKitConfig, verifyWebhook } from "@/server/cowork/livekit";
import { recordVideoEvent } from "@/server/services/cowork-meeting.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Webhook do servidor LiveKit (sem cookie de sessão: autenticado pela assinatura com a API secret).
 * Usado só para registrar presença verificável (`participant_joined`) em reuniões em andamento.
 */
export async function POST(req: Request) {
  const c = liveKitConfig();
  if (!c.ok) return NextResponse.json({ error: "Vídeo não habilitado." }, { status: 404 });
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > 64 * 1024) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  const raw = await req.text();
  if (raw.length > 64 * 1024) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  const event = verifyWebhook(c.config, raw, req.headers.get("authorization"));
  if (!event) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  const result = await recordVideoEvent(event);
  return NextResponse.json({ ok: true, updated: result.updated });
}
