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
