import { chatContactBlocked } from "./chat-contact-control.service";
import { emitChatEvent } from "./chat-workbench.service";
import { applyInboundLifecycle, humanReplyLifecycle } from "./chat-lifecycle.service";
import { randomUUID } from "node:crypto";
import { recordSurveyAnswer } from "@/server/services/chat-extras.service";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { deleteObject, putObject } from "@/lib/storage/local-storage";
import { WhatsappApiError } from "@/lib/whatsapp/client";
import { AWAY_COOLDOWN_MS, TYPE_LABEL } from "@/lib/whatsapp/constants";
import { isOutsideHours } from "@/lib/whatsapp/hours";
import { phoneCandidates } from "@/lib/whatsapp/phone";
import { runInboundAutomations } from "./chat-automation.service";
import { runInboundDialogs } from "./chat-dialogs.service";
import { runBot } from "./chat-bot.service";
import { handleBillingReply } from "./chat-billing.service";
import { autoAssign } from "./chat-queue.service";
import { isUniqueViolation } from "./db-errors";
import { assertStorageAvailable } from "./plan.service";
import { getTransport } from "./whatsapp-transport";

export type IngestAccount = { id: string; organizationId: string; awayEnabled: boolean; awayMessage: string | null; openFrom: string; openUntil: string; openDays: number[] };
export type IngestMessage = {
  /** Já com o prefixo do meio (QR) quando for o caso: é o que vai para `wa_message_id`. */
  waMessageId: string;
  referral?: {source:string;adId:string;campaign:string};
  waId: string;
  contactName: string | null;
  type: string;
  text: string | null;
  timestamp: Date;
  /** Mensagem enviada pelo próprio aparelho (só existe na conexão por QR-Code). */
  fromMe: boolean;
  media: { mime: string | null; filename: string | null; fetch: () => Promise<{ buffer: Buffer; mime: string }> } | null;
};

async function matchClient(organizationId: string, waId: string): Promise<string | null> {
  if (waId.startsWith("lid:")) return null;
  const cands = phoneCandidates(waId);
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM clients
     WHERE organization_id = ${organizationId}::uuid AND deleted_at IS NULL
       AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = ANY(${cands}::text[])
     LIMIT 2`;
  return rows.length === 1 ? (rows[0]?.id ?? null) : null; // ambiguidade (mesmo telefone em 2 clientes): não vincula sozinho
}

async function storeMedia(organizationId: string, m: IngestMessage) {
  if (!m.media) return null;
  try {
    const f = await m.media.fetch();
    await assertStorageAvailable(organizationId, f.buffer.length);
    const key = `${organizationId}/${randomUUID()}`;
    await putObject(key, f.buffer);
    return { key, mime: (m.media.mime ?? f.mime).slice(0, 100), size: f.buffer.length };
  } catch (e) {
    logger.warn("whatsapp.media_failed", { error: e instanceof Error ? e.message : String(e) });
    return { error: e instanceof WhatsappApiError ? e.message : "A mídia não pôde ser baixada." };
  }
}

/** Grava uma mensagem recebida (ou enviada pelo próprio aparelho) uma única vez. */
export async function ingestMessage(account: IngestAccount, m: IngestMessage): Promise<void> {
  const dup = await db.whatsappMessage.findFirst({ where: { waMessageId: m.waMessageId }, select: { id: true } });
  if (dup) return; // reenvio da Meta, eco do próprio envio, ou histórico repetido

  const sel = { id: true, clientId: true, lastAwayAt: true, status: true, assignedToId: true, lastMessageAt:true } as const;
  let created = false;
  let conv = await db.whatsappConversation.findUnique({ where: { accountId_waId: { accountId: account.id, waId: m.waId } }, select: sel });
  if (!conv) {
    const clientId = await matchClient(account.organizationId, m.waId);
    try {
      conv = await db.whatsappConversation.create({ data: { organizationId: account.organizationId, accountId: account.id, waId: m.waId, contactName: m.fromMe ? null : m.contactName, clientId }, select: sel });
      created = true;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      conv = await db.whatsappConversation.findUniqueOrThrow({ where: { accountId_waId: { accountId: account.id, waId: m.waId } }, select: sel });
    }
  } else if (!conv.clientId) {
    const clientId = await matchClient(account.organizationId, m.waId);
    if (clientId) await db.whatsappConversation.update({ where: { id: conv.id }, data: { clientId } });
  }

  const media = await storeMedia(account.organizationId, m);
  const stored = media && "key" in media ? media : null;
  const mediaError = media && "error" in media ? media.error : null;
  const label = TYPE_LABEL[m.type] ?? "Mensagem";
  const body = m.text ?? (m.media ? null : m.type === "text" ? null : `[${label}]`);
  try {
    await db.whatsappMessage.create({
      data: {
        organizationId: account.organizationId, conversationId: conv.id, direction: m.fromMe ? "OUT" : "IN", waMessageId: m.waMessageId, type: m.type, body,
        mediaKey: stored?.key ?? null, mediaMime: stored?.mime ?? m.media?.mime ?? null, mediaName: m.media?.filename ?? null, mediaSize: stored?.size ?? null,
        status: m.fromMe ? "SENT" : "RECEIVED", error: mediaError, createdAt: m.timestamp,
      },
    });
  } catch (e) {
    if (stored?.key) await deleteObject(stored.key);
    if (isUniqueViolation(e)) return;
    throw e;
  }
  const preview = (body ?? `[${label}]`).replace(/\s+/g, " ").slice(0, 120);
  if (m.fromMe) {
    if(conv.lastMessageAt&&m.timestamp<conv.lastMessageAt)return;
    await humanReplyLifecycle(account.organizationId,conv.id);
    await db.whatsappConversation.update({ where: { id: conv.id }, data: { lastMessageAt: m.timestamp, lastPreview: preview } });
    return;
  }
  // Cobrança: "PARAR" em resposta a um lembrete só registra a saída da lista; não reabre nem aciona robô/automações.
  if (!created) {
    await db.whatsappConversation.update({ where: { id: conv.id }, data: { lastInboundAt: m.timestamp } }); // abre a janela de 24 h para a confirmação
    if (await handleBillingReply(account.organizationId, conv.id, m.waId, m.text)) {
      await db.whatsappConversation.update({ where: { id: conv.id }, data: { lastMessageAt: m.timestamp, lastPreview: preview } });
      return;
    }
  }
  const transition=await applyInboundLifecycle(account.organizationId,conv.id,m.timestamp);
  if(transition.stale)return;
  await db.whatsappConversation.update({
    where: { id: conv.id },
    data: { unreadCount: { increment: 1 }, lastInboundAt: m.timestamp, lastMessageAt: m.timestamp, lastPreview: preview, ...(m.contactName ? { contactName: m.contactName } : {}) },
  });
  if(m.referral)await db.$executeRaw`INSERT INTO chat_contact_events(id,organization_id,conversation_id,kind,payload) VALUES(${randomUUID()}::uuid,${account.organizationId}::uuid,${conv.id}::uuid,'ATTRIBUTION',${JSON.stringify(m.referral)}::jsonb)`;
  await emitChatEvent(account.organizationId,"chat.message.received",{conversationId:conv.id,providerMessageId:m.waMessageId,type:m.type}).catch(()=>0);
  if(await chatContactBlocked(account.organizationId,account.id,m.waId))return;
  // Pesquisa de satisfação: resposta só com nota (0 a 10) fica registrada e não aciona robô nem automações.
  if (!created && (await recordSurveyAnswer(account.organizationId, conv.id, m.text).catch(() => false))) return;
  // LegalOS Chat: conversa nova, reaberta ou sem responsável entra na fila e é distribuída.
  const distributing = (await db.whatsappAccount.findUnique({ where: { id: account.id }, select: { autoAssignEnabled: true } }))?.autoAssignEnabled ?? true;
  if (distributing && (created || transition.reassign || !conv.assignedToId)) await autoAssign(account.organizationId, conv.id).catch((e) => logger.warn("whatsapp.auto_assign_failed", { error: e instanceof Error ? e.message : String(e) }));
  const now = new Date();
  await runInboundAutomations(account, conv.id, { created, text: m.text, messageKey: m.waMessageId, now });
  await runInboundDialogs(account, conv.id, { text: m.text, messageKey: m.waMessageId, now });
  await runBot(account.organizationId, conv.id, { created, reopened: !created && conv.status === "CLOSED", text: m.text, now });
  await maybeAway(account, conv.id, conv.lastAwayAt, m.waId, now);
}

/** Mensagem de ausência: fora do expediente, no máximo uma vez a cada 12 horas por conversa. Falha de envio não afeta o recebimento. */
async function maybeAway(account: IngestAccount, conversationId: string, lastAwayAt: Date | null, waId: string, now: Date) {
  if (!account.awayEnabled || !account.awayMessage) return;
  const org = await db.organization.findUnique({ where: { id: account.organizationId }, select: { timezone: true } });
  if (!org || !isOutsideHours(now, org.timezone, account.openFrom, account.openUntil, account.openDays)) return;
  if (lastAwayAt && now.getTime() - lastAwayAt.getTime() < AWAY_COOLDOWN_MS) return;
  // Reserva o envio antes (condicional), para duas mensagens simultâneas não gerarem duas respostas.
  const claimed = await db.whatsappConversation.updateMany({ where: { id: conversationId, OR: [{ lastAwayAt: null }, { lastAwayAt: { lt: new Date(now.getTime() - AWAY_COOLDOWN_MS) } }] }, data: { lastAwayAt: now } });
  if (claimed.count !== 1) return;
  try {
    const t = await getTransport(account.organizationId, account.id);
    const id = await t.sendText(waId, account.awayMessage);
    await db.whatsappMessage.create({ data: { organizationId: account.organizationId, conversationId, direction: "OUT", type: "text", body: account.awayMessage, status: "SENT", waMessageId: id, automatic: true } });
  } catch (e) {
    logger.warn("whatsapp.away_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

const RANK = { SENT: 1, DELIVERED: 2, READ: 3 } as const;

/** Aviso de entrega: só avança (enviada → entregue → lida); falha sempre registra o motivo. Ignora mensagens de outro escritório ou desconhecidas. */
export async function applyStatusUpdate(organizationId: string, waMessageId: string, status: "sent" | "delivered" | "read" | "failed", error: string | null): Promise<void> {
  const m = await db.whatsappMessage.findFirst({ where: { waMessageId, organizationId }, select: { id: true, status: true, conversationId:true } });
  if (!m) return;
  const next = status.toUpperCase();
  // A late sent/delivered/failed event cannot undo a read receipt.
  const eligible=status==="failed"?["PENDING","SENT"]:Object.keys(RANK).filter(k=>RANK[k as keyof typeof RANK]<RANK[next as keyof typeof RANK]).concat(["PENDING","FAILED"]);
  const changed=await db.whatsappMessage.updateMany({where:{id:m.id,organizationId,status:{in:eligible}},data:{status:next,error:status==="failed"?error??"O WhatsApp informou falha na entrega.":null}});
  if(changed.count)await emitChatEvent(organizationId,"chat.message.status",{conversationId:m.conversationId,messageId:m.id,status:next}).catch(()=>0);
}
