import { db } from "@/lib/db/client";
import { ConflictError } from "@/lib/permissions/check";
import { certKey, openBytes } from "@/lib/security/pfx";
import { waConfigFromEnv } from "@/lib/whatsapp/client";

export function requireCertKey(): Buffer {
  const k = certKey();
  if (!k) throw new ConflictError("O cofre não está configurado neste sistema (falta CERT_ENCRYPTION_KEY).");
  return k;
}

/** Credenciais da API oficial (Meta) do escritório, com o token decifrado. Nunca devolvido ao navegador. */
export async function loadAuth(organizationId: string) {
  const a = await db.whatsappAccount.findUnique({ where: { organizationId } });
  if (!a) throw new ConflictError("O WhatsApp ainda não foi conectado neste escritório.");
  if (!a.enabled) throw new ConflictError("O WhatsApp está desligado neste escritório.");
  if (a.provider !== "META" || !a.phoneNumberId || !a.tokenEnc) throw new ConflictError("Este escritório usa a conexão por QR-Code; esta operação é só da API oficial da Meta.");
  const token = openBytes(a.tokenEnc, requireCertKey()).toString("utf8");
  return { account: a, auth: { phoneNumberId: a.phoneNumberId, token }, cfg: waConfigFromEnv() };
}
