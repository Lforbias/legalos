import { NextResponse } from "next/server";
import { logger } from "@/lib/logging/logger";
import { FeeWebhookAuthError, handleFeeWebhook } from "@/server/services/fee-charge.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Aviso do Asaas da conta DO ESCRITÓRIO (honorários). Autentica por `asaas-access-token`. 5xx faz o Asaas reenviar. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 64 * 1024) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  try {
    const r = await handleFeeWebhook(orgId, req.headers.get("asaas-access-token"), body);
    return NextResponse.json({ ok: true, status: r.status });
  } catch (e) {
    if (e instanceof FeeWebhookAuthError) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    logger.error("fee.webhook_failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Falha ao processar." }, { status: 500 });
  }
}
