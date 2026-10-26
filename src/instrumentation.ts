/** Ao subir o servidor, religa as sessões de WhatsApp por QR-Code que já tinham sido pareadas. */
export async function register() {
  // Keep Node-only imports inside the positive runtime branch so the Edge compiler removes them.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.WHATSAPP_QR_DISABLE_RESUME === "1") return;
    // Atraso curto: deixa o servidor e o banco ficarem prontos antes de abrir conexões externas.
    const t = setTimeout(() => {
      void import("@/server/services/whatsapp-qr.service").then((m) => m.resumeQrSessions()).catch(() => undefined);
    }, 5000);
    t.unref?.();
  }
}
