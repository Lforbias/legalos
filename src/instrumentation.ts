import type { Instrumentation } from "next";

/** Ao subir o servidor, religa as sessões de WhatsApp por QR-Code que já tinham sido pareadas. */
export async function register() {
  // Keep Node-only imports inside the positive runtime branch so the Edge compiler removes them.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.WHATSAPP_QR_DISABLE_RESUME === "1") return;
    // MVP: conexão por QR-Code desligada (WHATSAPP_QR_ENABLED=1 religa); não reabre sessões antigas.
    if (process.env.WHATSAPP_QR_ENABLED !== "1" && process.env.WHATSAPP_QR_FAKE !== "1") return;
    // Atraso curto: deixa o servidor e o banco ficarem prontos antes de abrir conexões externas.
    const t = setTimeout(() => {
      void import("@/server/services/whatsapp-qr.service").then((m) => m.resumeQrSessions()).catch(() => undefined);
    }, 5000);
    t.unref?.();
  }
}

/** Monitoramento: todo erro capturado pelo servidor vira alerta no webhook de ALERT_WEBHOOK_URL (sem dados pessoais). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest?: unknown }).digest) : undefined;
  const { sendErrorAlert } = await import("@/lib/observability/alert");
  await sendErrorAlert({ message, digest, path: request.path, method: request.method, routeType: context.routeType });
};
