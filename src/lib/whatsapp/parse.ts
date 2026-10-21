/** Leitura defensiva do corpo do webhook da Meta (WhatsApp Cloud API). Nada aqui confia no formato: o que não reconhece é ignorado. */
export type InboundMedia = { id: string; mime: string | null; filename: string | null };
export type InboundMessage = {
  id: string;
  from: string;
  timestamp: Date;
  type: string;
  text: string | null;
  media: InboundMedia | null;
  contactName: string | null;
};
export type StatusUpdate = { id: string; status: "sent" | "delivered" | "read" | "failed"; timestamp: Date; recipient: string | null; error: string | null };
export type ParsedChange = { phoneNumberId: string; messages: InboundMessage[]; statuses: StatusUpdate[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const toDate = (v: unknown): Date => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

const MEDIA_TYPES = ["image", "document", "audio", "video", "sticker"] as const;

export function parseWebhook(body: unknown): ParsedChange[] {
  if (!isObj(body) || body.object !== "whatsapp_business_account") return [];
  const out: ParsedChange[] = [];
  for (const entry of arr(body.entry)) {
    if (!isObj(entry)) continue;
    for (const change of arr(entry.changes)) {
      if (!isObj(change) || change.field !== "messages" || !isObj(change.value)) continue;
      const v = change.value;
      const phoneNumberId = isObj(v.metadata) ? str(v.metadata.phone_number_id) : null;
      if (!phoneNumberId) continue;
      const names = new Map<string, string>();
      for (const c of arr(v.contacts)) if (isObj(c) && str(c.wa_id) && isObj(c.profile) && str(c.profile.name)) names.set(str(c.wa_id)!, str(c.profile.name)!);

      const messages: InboundMessage[] = [];
      for (const m of arr(v.messages)) {
        if (!isObj(m)) continue;
        const id = str(m.id);
        const from = str(m.from);
        const type = str(m.type) ?? "unknown";
        if (!id || !from || type === "reaction") continue;
        let text: string | null = null;
        let media: InboundMedia | null = null;
        if (type === "text" && isObj(m.text)) text = str(m.text.body);
        else if ((MEDIA_TYPES as readonly string[]).includes(type) && isObj(m[type])) {
          const x = m[type] as Record<string, unknown>;
          const mid = str(x.id);
          if (mid) media = { id: mid, mime: str(x.mime_type), filename: str(x.filename) };
          text = str(x.caption);
        } else if (type === "button" && isObj(m.button)) text = str(m.button.text);
        else if (type === "interactive" && isObj(m.interactive)) {
          const i = m.interactive;
          const r = isObj(i.button_reply) ? i.button_reply : isObj(i.list_reply) ? i.list_reply : null;
          text = r ? str(r.title) : null;
        } else if (type === "location" && isObj(m.location)) {
          const lat = m.location.latitude;
          const lng = m.location.longitude;
          if (typeof lat === "number" && typeof lng === "number") text = `Localização: ${lat}, ${lng}${str(m.location.name) ? ` (${str(m.location.name)})` : ""}`;
        }
        messages.push({ id, from, timestamp: toDate(m.timestamp), type, text, media, contactName: names.get(from) ?? null });
      }

      const statuses: StatusUpdate[] = [];
      for (const s of arr(v.statuses)) {
        if (!isObj(s)) continue;
        const id = str(s.id);
        const status = str(s.status);
        if (!id || (status !== "sent" && status !== "delivered" && status !== "read" && status !== "failed")) continue;
        let error: string | null = null;
        const e = arr(s.errors)[0];
        if (isObj(e)) error = [typeof e.code === "number" ? `código ${e.code}` : null, str(e.title) ?? str(e.message)].filter(Boolean).join(": ") || "falha informada pela Meta";
        statuses.push({ id, status, timestamp: toDate(s.timestamp), recipient: str(s.recipient_id), error });
      }
      if (messages.length || statuses.length) out.push({ phoneNumberId, messages, statuses });
    }
  }
  return out;
}
