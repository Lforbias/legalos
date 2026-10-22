import { db } from "@/lib/db/client";
import { getTranscriber } from "@/lib/ai/gemini";
import { AiProviderError } from "@/lib/ai/provider";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { getObjectStream } from "@/lib/storage/local-storage";
import { assertCan, type TenantContext } from "@/server/context";
import { assertModule } from "./org-security.service";
import { audit } from "./audit.service";
import { assertCredits, chargeCredits } from "./credit.service";

/**
 * 4.0-F9 — transcrição de áudio do Chat com o Gemini. O áudio é enviado ao Google SOMENTE quando uma pessoa aperta "Transcrever".
 * Regras: chave GEMINI_API_KEY real, IA ligada no escritório, chave "Transcrição de áudio" ligada no Chat, créditos (se o escritório usa).
 * A transcrição fica salva (cobra uma única vez por áudio). O áudio em si não é guardado pelo provedor por nossa conta; só enviamos o necessário.
 */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MIME_OK = ["audio/ogg", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/aac", "audio/flac", "audio/aiff", "audio/mp4", "audio/webm"];

async function toBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const r = stream.getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function transcribeMessage(ctx: TenantContext, messageId: string): Promise<{ text: string; cached: boolean }> {
  assertCan(ctx, "whatsapp:read");
  assertCan(ctx, "ai:use");
  const m = await db.whatsappMessage.findFirst({ where: { id: messageId, organizationId: ctx.organizationId }, select: { id: true, mediaKey: true, mediaMime: true, mediaSize: true } });
  if (!m) throw new NotFoundError("Mensagem não encontrada.");
  const done = await db.whatsappTranscript.findUnique({ where: { messageId } });
  if (done) return { text: done.text, cached: true };
  const mime = (m.mediaMime ?? "").split(";")[0]!.trim().toLowerCase();
  if (!m.mediaKey || !mime.startsWith("audio/")) throw new ValidationError("Esta mensagem não é um áudio.");
  if (!MIME_OK.includes(mime)) throw new ValidationError("Formato de áudio não suportado para transcrição.");
  if ((m.mediaSize ?? 0) > MAX_AUDIO_BYTES) throw new ValidationError("Áudio grande demais para transcrever (limite de 10 MB).");
  const sw = await db.whatsappExtrasSettings.findUnique({ where: { organizationId: ctx.organizationId }, select: { transcribeEnabled: true } });
  if (!sw?.transcribeEnabled) throw new ConflictError("A transcrição de áudio está desligada. Quem administra o Chat liga em Configurações.");
  await assertModule(ctx.organizationId, "ia");
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { aiEnabled: true } });
  if (!org?.aiEnabled) throw new ConflictError("A IA está desligada neste escritório. Peça a quem administra as integrações para ligá-la (o áudio é enviado ao Google).");
  const t = getTranscriber();
  if (!t) throw new ConflictError("A transcrição não está configurada neste sistema (falta a chave do Gemini).");
  await assertCredits(ctx.organizationId, "audio.transcribe");
  const data = await toBuffer(await getObjectStream(m.mediaKey));
  if (data.length > MAX_AUDIO_BYTES) throw new ValidationError("Áudio grande demais para transcrever (limite de 10 MB).");
  let r;
  try {
    r = await t.transcribe({ mime, data });
  } catch (e) {
    if (e instanceof AiProviderError) throw new ConflictError(e.message);
    throw e;
  }
  const saved = await db.whatsappTranscript.upsert({ where: { messageId }, create: { messageId, organizationId: ctx.organizationId, text: r.text, model: t.model, createdById: ctx.userId }, update: {} });
  await db.aiUsage.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, feature: "audio_transcribe", provider: t.name, model: t.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens } });
  await chargeCredits(ctx.organizationId, "audio.transcribe", { type: "whatsapp_message", id: messageId, userId: ctx.userId });
  await audit({ action: "ai.transcribe_audio", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_message", resourceId: messageId, meta: ctx.meta });
  return { text: saved.text, cached: false };
}

export async function transcriptsFor(ctx: TenantContext, messageIds: string[]): Promise<Record<string, string>> {
  assertCan(ctx, "whatsapp:read");
  if (!messageIds.length) return {};
  const rows = await db.whatsappTranscript.findMany({ where: { organizationId: ctx.organizationId, messageId: { in: messageIds } }, select: { messageId: true, text: true } });
  return Object.fromEntries(rows.map((r) => [r.messageId, r.text]));
}
