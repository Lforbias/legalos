import { logger } from "@/lib/logging/logger";
import { makeAuthState } from "./auth-state";
import { chatFromKey, statusFromProto } from "./jid";
import { jidOfChat, type MediaKind, type OutMedia, type QrDriver, type QrEvent, type QrInbound, type QrSession } from "./types";

/**
 * Driver REAL (biblioteca Baileys, protocolo do WhatsApp Web). Escrito a partir da documentação/tipos da biblioteca e NUNCA
 * testado contra o WhatsApp de verdade neste ambiente. A biblioteca quebra de tempos em tempos quando o WhatsApp muda o protocolo.
 */
const KINDS: [string, MediaKind][] = [["imageMessage", "image"], ["documentMessage", "document"], ["audioMessage", "audio"], ["videoMessage", "video"], ["stickerMessage", "sticker"]];

export const baileysDriver: QrDriver = {
  async connect({ accountId, kv, onEvent }) {
    const B = await import("@whiskeysockets/baileys");
    const pino = (await import("pino")).default;
    const silent = pino({ level: "silent" });
    const { state, saveCreds } = await makeAuthState(kv, B as never);
    let version: [number, number, number] | undefined;
    try {
      version = (await B.fetchLatestBaileysVersion()).version as [number, number, number];
    } catch {
      /* usa a versão embutida na biblioteca */
    }
    const sock = B.makeWASocket({
      auth: { creds: state.creds, keys: B.makeCacheableSignalKeyStore(state.keys, silent) },
      ...(version ? { version } : {}),
      logger: silent,
      browser: ["LegalOS", "Chrome", "1.0.0"],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
    let closed = false;
    const emit = (e: QrEvent) => {
      if (!closed) onEvent(e);
    };
    sock.ev.on("creds.update", () => void saveCreds().catch((e) => logger.error("whatsapp.qr_creds_save_failed", { error: String(e) })));
    sock.ev.on("connection.update", (u) => {
      if (u.qr) emit({ type: "qr", qr: u.qr });
      if (u.connection === "open") emit({ type: "open", phone: sock.user?.id ? sock.user.id.split("@")[0]!.split(":")[0]!.replace(/\D/g, "") : null });
      if (u.connection === "close") {
        const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        emit({ type: "close", loggedOut: code === B.DisconnectReason.loggedOut, reason: code ? `código ${code}` : "conexão encerrada" });
      }
    });
    sock.ev.on("call", calls=>{
      for(const c of calls){
        if(c.isGroup||!["offer","ringing","accept","reject","timeout","terminate"].includes(c.status))continue;
        const chat=chatFromKey({remoteJid:c.chatId||c.from,remoteJidAlt:c.callerPn});if(!chat)continue;
        emit({type:"call",call:{id:c.id,chat,status:c.status as "offer"|"ringing"|"accept"|"reject"|"timeout"|"terminate",video:!!c.isVideo,at:c.date}});
      }
    });
    sock.ev.on("messages.update", (list) => {
      for (const { key, update } of list) {
        if (!key.fromMe || !key.id) continue;
        const s = statusFromProto(update.status as number | undefined);
        if (s) emit({ type: "status", id: key.id, status: s });
      }
    });
    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return; // histórico sincronizado não é importado
      for (const m of messages) {
        try {
          const chat = chatFromKey(m.key as { remoteJid?: string | null; remoteJidAlt?: string | null });
          if (!chat || !m.key.id || !m.message) continue;
          const content = B.normalizeMessageContent(m.message) as Record<string, unknown> | undefined;
          if (!content) continue;
          if (content.protocolMessage || content.reactionMessage || content.senderKeyDistributionMessage) continue;
          let text: string | null = null;
          let media: QrInbound["media"] = null;
          const kind = KINDS.find(([k]) => content[k]);
          if (kind) {
            const x = content[kind[0]] as { mimetype?: string; fileName?: string; caption?: string };
            text = x.caption ?? null;
            media = { kind: kind[1], mime: x.mimetype ?? null, filename: x.fileName ?? null, download: async () => (await B.downloadMediaMessage(m, "buffer", {}, { logger: silent, reuploadRequest: sock.updateMediaMessage })) as Buffer };
          } else if (typeof content.conversation === "string") text = content.conversation;
          else if (content.extendedTextMessage) text = (content.extendedTextMessage as { text?: string }).text ?? null;
          else if (content.buttonsResponseMessage) text = (content.buttonsResponseMessage as { selectedDisplayText?: string }).selectedDisplayText ?? null;
          else if (content.listResponseMessage) text = (content.listResponseMessage as { title?: string }).title ?? null;
          else if (content.locationMessage) {
            const l = content.locationMessage as { degreesLatitude?: number; degreesLongitude?: number };
            text = `Localização: ${l.degreesLatitude}, ${l.degreesLongitude}`;
          } else continue; // tipo não suportado
          const ts = typeof m.messageTimestamp === "number" ? m.messageTimestamp : Number(m.messageTimestamp ?? 0);
          emit({ type: "message", msg: { id: m.key.id, chat, fromMe: !!m.key.fromMe, name: m.key.fromMe ? null : (m.pushName ?? null), text, timestamp: ts > 0 ? new Date(ts * 1000) : new Date(), media } });
        } catch (e) {
          logger.warn("whatsapp.qr_message_skipped", { error: e instanceof Error ? e.message : String(e) });
        }
      }
    });

    const session: QrSession = {
      async sendText(chat, body) {
        const r = await sock.sendMessage(jidOfChat(chat), { text: body });
        if (!r?.key.id) throw new Error("O WhatsApp não confirmou o envio.");
        return r.key.id;
      },
      async sendMedia(chat, m: OutMedia) {
        const jid = jidOfChat(chat);
        const cap = m.caption ?? undefined;
        const content = m.kind === "image" ? { image: m.buffer, caption: cap } : m.kind === "video" ? { video: m.buffer, caption: cap } : m.kind === "audio" ? { audio: m.buffer, mimetype: m.mime } : { document: m.buffer, mimetype: m.mime, fileName: m.filename, caption: cap };
        const r = await sock.sendMessage(jid, content);
        if (!r?.key.id) throw new Error("O WhatsApp não confirmou o envio.");
        return r.key.id;
      },
      async logout() {
        closed = true;
        await sock.logout().catch(() => undefined);
      },
      close() {
        closed = true;
        try {
          sock.end(undefined);
        } catch {
          /* já fechado */
        }
      },
    };
    void accountId;
    return session;
  },
};
