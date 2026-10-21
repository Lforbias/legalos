/**
 * Conexão do WhatsApp por QR-Code (WhatsApp Web). NÃO é a API oficial: viola os termos do WhatsApp, o número pode ser banido
 * e a sessão pode cair a qualquer momento. Fica isolada atrás desta interface para poder ser trocada ou removida sem tocar no resto.
 */
export type MediaKind = "image" | "document" | "audio" | "video" | "sticker";

export type QrInbound = {
  /** Identificador da mensagem no WhatsApp (sem prefixo). */
  id: string;
  /** Conversa: número só com dígitos (com 55) ou `lid:<dígitos>` quando o WhatsApp só informa o identificador oculto. */
  chat: string;
  fromMe: boolean;
  name: string | null;
  text: string | null;
  timestamp: Date;
  media: { kind: MediaKind; mime: string | null; filename: string | null; download: () => Promise<Buffer> } | null;
};

export type QrEvent =
  | { type: "qr"; qr: string }
  | { type: "open"; phone: string | null }
  | { type: "close"; loggedOut: boolean; reason: string }
  | { type: "message"; msg: QrInbound }
  | { type: "status"; id: string; status: "sent" | "delivered" | "read" | "failed" };

export type OutMedia = { kind: "image" | "document" | "audio" | "video"; buffer: Buffer; mime: string; filename: string; caption: string | null };

export interface QrSession {
  sendText(chat: string, body: string): Promise<string>;
  sendMedia(chat: string, m: OutMedia): Promise<string>;
  logout(): Promise<void>;
  close(): void;
}

/** Armazenamento chave-valor do estado de autenticação (o conteúdo é cifrado antes de ir ao banco). */
export interface AuthKv {
  get(key: string): Promise<string | null>;
  set(entries: [string, string | null][]): Promise<void>;
  clear(): Promise<void>;
}

export interface QrDriver {
  connect(opts: { accountId: string; kv: AuthKv; onEvent: (e: QrEvent) => void }): Promise<QrSession>;
}

/** Número/identificador de conversa → JID do WhatsApp. */
export function jidOfChat(chat: string): string {
  return chat.startsWith("lid:") ? `${chat.slice(4)}@lid` : `${chat}@s.whatsapp.net`;
}
