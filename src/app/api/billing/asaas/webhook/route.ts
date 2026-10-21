import { NextResponse } from "next/server";
import { logger } from "@/lib/logging/logger";
import { ConflictError } from "@/lib/permissions/check";
import { handleAsaasWebhook, WebhookAuthError } from "@/server/services/billing.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Aviso do Asaas. Autentica pelo cabeçalho `asaas-access-token` (ASAAS_WEBHOOK_TOKEN). Responde 5xx se não deu para processar, para o Asaas reenviar. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 64 * 1024) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  try {
    const r = await handleAsaasWebhook(req.headers.get("asaas-access-token"), body);
    return NextResponse.json({ ok: true, status: r.status });
  } catch (e) {
    if (e instanceof WebhookAuthError) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    if (e instanceof ConflictError && /não está ativada/.test(e.message)) return NextResponse.json({ error: "Cobrança automática desligada." }, { status: 503 });
    logger.error("billing.webhook_failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Falha ao processar." }, { status: 500 });
  }
}
