const digits = (jid: string) => jid.split("@")[0]!.split(":")[0]!.replace(/\D/g, "");

/** Conversa individual a partir da chave da mensagem. Grupos, listas de transmissão, status e canais são ignorados (null). */
export function chatFromKey(key: { remoteJid?: string | null; remoteJidAlt?: string | null }): string | null {
  const jid = key.remoteJid;
  if (!jid) return null;
  if (jid.endsWith("@s.whatsapp.net")) return digits(jid) || null;
  if (jid.endsWith("@lid")) {
    const alt = key.remoteJidAlt;
    if (alt?.endsWith("@s.whatsapp.net") && digits(alt)) return digits(alt);
    const d = digits(jid);
    return d ? `lid:${d}` : null;
  }
  return null;
}

/** Status numérico do protocolo → status do LegalOS. */
export function statusFromProto(n: number | null | undefined): "sent" | "delivered" | "read" | "failed" | null {
  if (n === 0) return "failed";
  if (n === 2) return "sent";
  if (n === 3) return "delivered";
  if (n === 4 || n === 5) return "read";
  return null;
}
