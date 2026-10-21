import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db/client";
import { downloadMedia } from "@/lib/whatsapp/client";
import { parseWebhook, type InboundMessage, type StatusUpdate } from "@/lib/whatsapp/parse";
import { normalizeWaId } from "@/lib/whatsapp/phone";
import { verifySignature } from "@/lib/whatsapp/signature";
import { applyStatusUpdate, ingestMessage, type IngestAccount } from "./whatsapp-ingest.service";
import { loadAuth } from "./whatsapp-auth";

export class WhatsappWebhookAuthError extends Error {}
export class WhatsappWebhookDisabledError extends Error {}

const cfgEnv = () => ({ secret: process.env.WHATSAPP_APP_SECRET?.trim() ?? "", verify: process.env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "" });

/** Verificação inicial do webhook (GET): a Meta envia hub.verify_token e espera receber hub.challenge de volta. */
export function verifyChallenge(mode: string | null, token: string | null, challenge: string | null): string {
  const { verify } = cfgEnv();
  if (verify.length < 16) throw new WhatsappWebhookDisabledError();
  const a = Buffer.from(token ?? "");
  const b = Buffer.from(verify);
  if (mode !== "subscribe" || !challenge || a.length !== b.length || !timingSafeEqual(a, b)) throw new WhatsappWebhookAuthError();
  return challenge;
}

type Account = IngestAccount;

async function processInbound(account: Account, m: InboundMessage): Promise<void> {
  const waId = normalizeWaId(m.from) ?? m.from.replace(/\D/g, "");
  if (!waId) return;
  const media = m.media;
  await ingestMessage(account, {
    waMessageId: m.id, waId, contactName: m.contactName, type: m.type, text: m.text, timestamp: m.timestamp, fromMe: false,
    media: media
      ? {
          mime: media.mime, filename: media.filename,
          fetch: async () => {
            const { auth, cfg } = await loadAuth(account.organizationId);
            return downloadMedia(cfg, auth.token, media.id);
          },
        }
      : null,
  });
}

async function processStatus(account: Account, s: StatusUpdate): Promise<void> {
  await applyStatusUpdate(account.organizationId, s.id, s.status, s.error);
}

/**
 * Recebe o POST da Meta. Autentica pela assinatura HMAC-SHA256 do corpo bruto (WHATSAPP_APP_SECRET).
 * Cada mensagem é gravada uma só vez. Erro inesperado lança (resposta 5xx → a Meta reenvia).
 */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<{ messages: number; statuses: number }> {
  const { secret } = cfgEnv();
  if (!secret) throw new WhatsappWebhookDisabledError();
  if (!verifySignature(rawBody, signature, secret)) throw new WhatsappWebhookAuthError();
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { messages: 0, statuses: 0 };
  }
  let nm = 0;
  let ns = 0;
  for (const change of parseWebhook(json)) {
    const account = await db.whatsappAccount.findFirst({ where: { phoneNumberId: change.phoneNumberId, enabled: true, provider: "META" }, select: { id: true, organizationId: true, awayEnabled: true, awayMessage: true, openFrom: true, openUntil: true, openDays: true } });
    if (!account) continue; // número que não é de nenhum escritório (ou desligado)
    for (const m of change.messages) {
      await processInbound(account, m);
      nm++;
    }
    for (const s of change.statuses) {
      await processStatus(account, s);
      ns++;
    }
  }
  return { messages: nm, statuses: ns };
}
