import type { QrDriver } from "./types";

let override: QrDriver | null = null;
/** Só para testes: troca o driver. */
export function setQrDriver(d: QrDriver | null) {
  override = d;
}

export async function getQrDriver(): Promise<QrDriver> {
  if (override) return override;
  if (process.env.WHATSAPP_QR_FAKE === "1") return (await import("./fake-driver")).fakeDriver;
  return (await import("./baileys-driver")).baileysDriver;
}

/**
 * MVP: a conexão por QR-Code (biblioteca não oficial, contra os termos do WhatsApp) fica desligada.
 * Liga com WHATSAPP_QR_ENABLED=1. O driver falso dos testes (WHATSAPP_QR_FAKE=1) continua funcionando.
 */
export const qrConnectionEnabled = () => process.env.WHATSAPP_QR_ENABLED === "1" || process.env.WHATSAPP_QR_FAKE === "1";
/** Campanhas em massa pelo QR-Code: risco alto de banimento do número. Só com WHATSAPP_QR_CAMPAIGNS=1. */
export const qrCampaignsEnabled = () => process.env.WHATSAPP_QR_CAMPAIGNS === "1";
