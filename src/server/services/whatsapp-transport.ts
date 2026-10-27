import { assertChatContactAllowed } from "./chat-contact-control.service";
import { db } from "@/lib/db/client";
import { ConflictError } from "@/lib/permissions/check";
import { sendMedia, sendText, uploadMedia, WhatsappApiError, type OutKind } from "@/lib/whatsapp/client";
import { enqueueSend } from "@/lib/whatsapp/qr/live";
import { loadAuth } from "./whatsapp-auth";

export type OutFile = { kind: OutKind; buffer: Buffer; mime: string; name: string; caption: string | null };
export type Transport = {
  provider: "META" | "QR";
  accountId: string;
  /** Devolve o identificador a gravar em `wa_message_id`. Falhas viram WhatsappApiError (a mensagem fica salva como FALHOU). */
  sendText(waId: string, body: string): Promise<string>;
  sendFile(waId: string, f: OutFile): Promise<string>;
};

export const qrMessageId = (accountId: string, id: string) => `qr:${accountId}:${id}`;

const wrap = async (fn: () => Promise<string>): Promise<string> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof WhatsappApiError) throw e;
    throw new WhatsappApiError(e instanceof Error ? e.message : "Falha ao enviar pelo WhatsApp.");
  }
};

/** Meio de envio do escritório: API oficial da Meta ou sessão por QR-Code. */
export async function getTransport(organizationId: string, accountId?: string): Promise<Transport> {
  const a = await db.whatsappAccount.findFirst({ where: accountId ? { id: accountId, organizationId } : { organizationId, isPrimary: true }, select: { id: true, provider: true, enabled: true } });
  if (!a) throw new ConflictError("O WhatsApp ainda não foi conectado neste escritório.");
  if (!a.enabled) throw new ConflictError("O WhatsApp está desligado neste escritório.");
  if (a.provider === "QR") {
    return {
      provider: "QR",
      accountId: a.id,
      sendText: (waId, body) => wrap(async () => { await assertChatContactAllowed(organizationId,a.id,waId); return qrMessageId(a.id, await enqueueSend(a.id, (s) => s.sendText(waId, body))); }),
      sendFile: (waId, f) => wrap(async () => { await assertChatContactAllowed(organizationId,a.id,waId); return qrMessageId(a.id, await enqueueSend(a.id, (s) => s.sendMedia(waId, { kind: f.kind, buffer: f.buffer, mime: f.mime, filename: f.name, caption: f.caption }))); }),
    };
  }
  const { auth, cfg } = await loadAuth(organizationId, a.id);
  return {
    provider: "META",
    accountId: a.id,
    sendText: async (waId, body) => { await assertChatContactAllowed(organizationId,a.id,waId); return sendText(cfg, auth, waId, body); },
    sendFile: async (waId, f) => {
      await assertChatContactAllowed(organizationId,a.id,waId);
      const mediaId = await uploadMedia(cfg, auth, { buffer: f.buffer, mime: f.mime, name: f.name });
      return sendMedia(cfg, auth, waId, { kind: f.kind, mediaId, caption: f.caption, filename: f.name });
    },
  };
}
