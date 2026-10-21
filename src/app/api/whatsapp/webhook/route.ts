import { NextResponse } from "next/server";
import { logger } from "@/lib/logging/logger";
import { handleWebhook, verifyChallenge, WhatsappWebhookAuthError, WhatsappWebhookDisabledError } from "@/server/services/whatsapp-webhook.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Verificação do webhook pela Meta (hub.mode, hub.verify_token, hub.challenge). */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  try {
    const challenge = verifyChallenge(p.get("hub.mode"), p.get("hub.verify_token"), p.get("hub.challenge"));
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e) {
    if (e instanceof WhatsappWebhookDisabledError) return NextResponse.json({ error: "WhatsApp desligado neste sistema." }, { status: 503 });
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }
}

/** Mensagens e avisos de entrega. Autenticado pela assinatura X-Hub-Signature-256 sobre o corpo bruto. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 2 * 1024 * 1024) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  try {
    const r = await handleWebhook(raw, req.headers.get("x-hub-signature-256"));
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof WhatsappWebhookDisabledError) return NextResponse.json({ error: "WhatsApp desligado neste sistema." }, { status: 503 });
    if (e instanceof WhatsappWebhookAuthError) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
    logger.error("whatsapp.webhook_failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Falha ao processar." }, { status: 500 });
  }
}
