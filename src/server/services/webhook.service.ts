import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { decryptSecret, encryptSecret, mfaKey } from "@/lib/security/totp";
import { assertWebhookUrl, postWebhook, signPayload, WebhookUrlError } from "@/lib/webhooks/transport";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

export const WEBHOOK_EVENTS = {
  "notice.created": "Intimação registrada",
  "case.created": "Processo cadastrado",
  "deadline.created": "Prazo cadastrado",
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;
export const WEBHOOK_EVENT_LIST = Object.keys(WEBHOOK_EVENTS) as WebhookEvent[];

const MAX_ENDPOINTS = 10;
const MAX_ATTEMPTS = 6;
const BACKOFF_MIN = [1, 5, 30, 120, 360];
const DISABLE_AFTER_FAILURES = 30;
const CLAIM_LEASE_MIN = 5;

function key(): Buffer {
  const k = mfaKey();
  if (!k) throw new ConflictError("A chave de cifra do sistema (MFA_ENCRYPTION_KEY) não está configurada: webhooks ficam indisponíveis.");
  return k;
}
export const webhooksAvailable = () => mfaKey() !== null;

async function requireMfa(userId: string) {
  const m = await db.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (!m?.enabledAt) throw new ConflictError("Ative a verificação em duas etapas em Minha conta para gerenciar webhooks.");
}

export type WebhookInput = { name: string; url: string; events: string[] };

export async function createWebhook(ctx: TenantContext, input: WebhookInput) {
  assertCan(ctx, "integrations:manage");
  const k = key();
  await requireMfa(ctx.userId);
  const name = input.name.trim();
  if (name.length < 3 || name.length > 80) throw new ValidationError("Nome inválido.", { name: ["Informe um nome de 3 a 80 caracteres."] });
  try {
    assertWebhookUrl(input.url.trim());
  } catch (e) {
    throw new ValidationError("Endereço inválido.", { url: [e instanceof WebhookUrlError ? e.message : "Endereço inválido."] });
  }
  const events = [...new Set(input.events)];
  if (events.length === 0 || events.some((e) => !(e in WEBHOOK_EVENTS))) throw new ValidationError("Escolha ao menos um evento válido.", { events: ["Escolha ao menos um evento."] });
  const count = await db.webhookEndpoint.count({ where: { organizationId: ctx.organizationId, deletedAt: null } });
  if (count >= MAX_ENDPOINTS) throw new ConflictError(`Limite de ${MAX_ENDPOINTS} webhooks. Remova algum antes de criar outro.`);
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const row = await db.$transaction(async (tx) => {
    const w = await tx.webhookEndpoint.create({
      data: { organizationId: ctx.organizationId, name, url: input.url.trim(), secretEnc: encryptSecret(secret, k), events, createdById: ctx.userId },
      select: { id: true },
    });
    await audit({ action: "webhook.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "webhook", resourceId: w.id, metadata: { events }, meta: ctx.meta }, tx);
    return w;
  });
  return { id: row.id, secret };
}

export async function listWebhooks(ctx: TenantContext) {
  assertCan(ctx, "integrations:manage");
  return db.webhookEndpoint.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, url: true, events: true, enabled: true, disabledReason: true, consecutiveFailures: true, lastSuccessAt: true, createdAt: true },
  });
}

export async function recentDeliveries(ctx: TenantContext, take = 15) {
  assertCan(ctx, "integrations:manage");
  return db.webhookDelivery.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, eventType: true, status: true, attempts: true, lastStatusCode: true, lastError: true, createdAt: true, deliveredAt: true, nextAttemptAt: true, endpoint: { select: { name: true } } },
  });
}

export async function setWebhookEnabled(ctx: TenantContext, id: string, enabled: boolean) {
  assertCan(ctx, "integrations:manage");
  const res = await db.webhookEndpoint.updateMany({
    where: { id, organizationId: ctx.organizationId, deletedAt: null },
    data: enabled ? { enabled: true, disabledReason: null, consecutiveFailures: 0 } : { enabled: false, disabledReason: "Desligado manualmente." },
  });
  if (res.count !== 1) throw new NotFoundError("Webhook não encontrado.");
  await audit({ action: enabled ? "webhook.enable" : "webhook.disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "webhook", resourceId: id, meta: ctx.meta });
}

export async function deleteWebhook(ctx: TenantContext, id: string) {
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  await db.$transaction(async (tx) => {
    const res = await tx.webhookEndpoint.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { deletedAt: new Date(), enabled: false } });
    if (res.count !== 1) throw new NotFoundError("Webhook não encontrado.");
    await tx.webhookDelivery.updateMany({ where: { endpointId: id, organizationId: ctx.organizationId, status: "PENDING" }, data: { status: "FAILED", lastError: "Webhook removido." } });
    await audit({ action: "webhook.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "webhook", resourceId: id, meta: ctx.meta }, tx);
  });
}

/** Reenvio manual de uma entrega que esgotou as tentativas. */
export async function retryDelivery(ctx: TenantContext, id: string) {
  assertCan(ctx, "integrations:manage");
  const res = await db.webhookDelivery.updateMany({
    where: { id, organizationId: ctx.organizationId, status: "FAILED", endpoint: { deletedAt: null, enabled: true } },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
  if (res.count !== 1) throw new NotFoundError("Entrega não encontrada, já reenviada ou o webhook está desligado.");
}

type Envelope = { id: string; type: string; createdAt: string; data: Record<string, unknown> };

/** Enfileira o evento para cada webhook ativo que o assinou. Nunca derruba a operação de origem. Carga mínima: só identificadores. */
export async function emitWebhookEvent(organizationId: string, type: WebhookEvent, data: Record<string, unknown>): Promise<number> {
  try {
    const endpoints = await db.webhookEndpoint.findMany({ where: { organizationId, deletedAt: null, enabled: true, events: { has: type } }, select: { id: true } });
    if (!endpoints.length) return 0;
    const eventId = randomUUID();
    const payload: Envelope = { id: eventId, type, createdAt: new Date().toISOString(), data };
    const r = await db.webhookDelivery.createMany({
      data: endpoints.map((e) => ({ organizationId, endpointId: e.id, eventId, eventType: type, payload: payload as object })),
      skipDuplicates: true,
    });
    return r.count;
  } catch (err) {
    logger.error("webhook.emit_failed", { type, error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

type DeliveryRow = { id: string; organizationId: string; endpointId: string; payload: unknown; attempts: number; eventType: string; eventId: string };

async function attempt(d: DeliveryRow): Promise<"SUCCEEDED" | "PENDING" | "FAILED"> {
  const ep = await db.webhookEndpoint.findFirst({ where: { id: d.endpointId, organizationId: d.organizationId, deletedAt: null }, select: { url: true, secretEnc: true, enabled: true } });
  if (!ep || !ep.enabled) {
    await db.webhookDelivery.update({ where: { id: d.id }, data: { status: "FAILED", lastError: "Webhook removido ou desligado." } });
    return "FAILED";
  }
  let secret: string;
  try {
    secret = decryptSecret(ep.secretEnc, key());
  } catch {
    await db.webhookDelivery.update({ where: { id: d.id }, data: { status: "FAILED", lastError: "Não foi possível abrir o segredo do webhook (chave de cifra trocada?)." } });
    return "FAILED";
  }
  const body = JSON.stringify(d.payload);
  const t = Math.floor(Date.now() / 1000);
  const r = await postWebhook(ep.url, body, {
    "x-legalos-event": d.eventType,
    "x-legalos-delivery": d.id,
    "x-legalos-signature": signPayload(secret, body, t),
  });
  const attempts = d.attempts + 1;
  if (r.ok) {
    await db.$transaction([
      db.webhookDelivery.update({ where: { id: d.id }, data: { status: "SUCCEEDED", attempts, lastStatusCode: r.status, lastError: null, deliveredAt: new Date() } }),
      db.webhookEndpoint.update({ where: { id: d.endpointId }, data: { consecutiveFailures: 0, lastSuccessAt: new Date() } }),
    ]);
    return "SUCCEEDED";
  }
  const final = attempts >= MAX_ATTEMPTS;
  const next = new Date(Date.now() + (BACKOFF_MIN[attempts - 1] ?? 360) * 60_000);
  await db.webhookDelivery.update({ where: { id: d.id }, data: { status: final ? "FAILED" : "PENDING", attempts, lastStatusCode: r.status, lastError: r.error, nextAttemptAt: next } });
  const upd = await db.webhookEndpoint.update({ where: { id: d.endpointId }, data: { consecutiveFailures: { increment: 1 } }, select: { consecutiveFailures: true } });
  if (upd.consecutiveFailures >= DISABLE_AFTER_FAILURES) {
    await db.webhookEndpoint.updateMany({ where: { id: d.endpointId, enabled: true }, data: { enabled: false, disabledReason: `Desligado automaticamente após ${DISABLE_AFTER_FAILURES} falhas seguidas.` } });
  }
  return final ? "FAILED" : "PENDING";
}

/** Evento de teste: envia na hora e mostra o resultado (fica no histórico). */
export async function testWebhook(ctx: TenantContext, id: string) {
  assertCan(ctx, "integrations:manage");
  key();
  const ep = await db.webhookEndpoint.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
  if (!ep) throw new NotFoundError("Webhook não encontrado.");
  const eventId = randomUUID();
  const payload: Envelope = { id: eventId, type: "ping", createdAt: new Date().toISOString(), data: { message: "Evento de teste do LegalOS." } };
  const d = await db.webhookDelivery.create({ data: { organizationId: ctx.organizationId, endpointId: id, eventId, eventType: "ping", payload: payload as object, nextAttemptAt: new Date(Date.now() + 365 * 86_400_000) } });
  const result = await attempt({ id: d.id, organizationId: d.organizationId, endpointId: id, payload, attempts: MAX_ATTEMPTS - 1, eventType: "ping", eventId });
  const row = await db.webhookDelivery.findUniqueOrThrow({ where: { id: d.id }, select: { status: true, lastStatusCode: true, lastError: true } });
  await audit({ action: "webhook.test", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "webhook", resourceId: id, metadata: { status: row.status }, meta: ctx.meta });
  return { ok: result === "SUCCEEDED", statusCode: row.lastStatusCode, error: row.lastError };
}

export type WebhookRunResult = { claimed: number; succeeded: number; retrying: number; failed: number; purged: number };

/** Rotina do agendador: entrega o que venceu (com reserva de 5 min para não duplicar entre instâncias) e limpa o histórico antigo. */
export async function runWebhookDeliveries(limit = 50): Promise<WebhookRunResult> {
  const claimed = await db.$queryRaw<DeliveryRow[]>`
    UPDATE webhook_deliveries SET next_attempt_at = now() + make_interval(mins => ${CLAIM_LEASE_MIN})
    WHERE id IN (
      SELECT id FROM webhook_deliveries
      WHERE status = 'PENDING' AND next_attempt_at <= now()
        AND organization_id NOT IN (SELECT id FROM organizations WHERE suspended_at IS NOT NULL OR deleted_at IS NOT NULL)
      ORDER BY next_attempt_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, organization_id AS "organizationId", endpoint_id AS "endpointId", payload, attempts, event_type AS "eventType", event_id AS "eventId"`;
  const out: WebhookRunResult = { claimed: claimed.length, succeeded: 0, retrying: 0, failed: 0, purged: 0 };
  for (let i = 0; i < claimed.length; i += 5) {
    const results = await Promise.all(
      claimed.slice(i, i + 5).map((d) =>
        attempt(d).catch((e) => {
          logger.error("webhook.attempt_crashed", { id: d.id, error: e instanceof Error ? e.message : String(e) });
          return "PENDING" as const;
        }),
      ),
    );
    for (const r of results) {
      if (r === "SUCCEEDED") out.succeeded++;
      else if (r === "PENDING") out.retrying++;
      else out.failed++;
    }
  }
  const purged = await db.webhookDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) }, status: { in: ["SUCCEEDED", "FAILED"] } } });
  out.purged = purged.count;
  return out;
}
