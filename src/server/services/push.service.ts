import webpush from "web-push";
import { db } from "@/lib/db/client";
import { todayYmd, dateToYmd, diffDays } from "@/lib/dates/ymd";
import { logger } from "@/lib/logging/logger";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { orgPushSchema, prefsSchema, subscriptionSchema } from "@/modules/push/push-schema";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/**
 * Avisos no celular (Web Push). Texto SEMPRE genérico (contagens): nenhum nome de cliente, número de processo ou título vai
 * para o serviço de push (Google/Apple/Mozilla). Nasce DESLIGADO por escritório; cada pessoa ativa no próprio aparelho.
 * Só envia entre 7h e 20h (horário do escritório). Cada item é avisado uma vez por etapa (a vencer / hoje / atrasado).
 */

const SEND_FROM_HOUR = 7;
const SEND_UNTIL_HOUR = 20;
/** Itens atrasados há mais de 3 dias não geram aviso (evita enxurrada ao ligar). */
const OVERDUE_MAX_DAYS = 3;
const MAX_FAILURES = 5;

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

/** Prepara o envio (chaves VAPID). Falso quando o servidor não está configurado. */
export function setup(): boolean {
  if (!pushConfigured()) return false;
  const subject = process.env.VAPID_SUBJECT || process.env.APP_URL || "mailto:contato@localhost.invalid";
  webpush.setVapidDetails(subject.startsWith("http") || subject.startsWith("mailto:") ? subject : `mailto:${subject}`, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };
type Sub = { id: string; endpoint: string; p256dh: string; auth: string; failures: number };

/** Envia a um aparelho. Retorna "ok" | "gone" (aparelho removido) | "error". */
export async function sendToSub(sub: Sub, payload: PushPayload): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: "normal" });
    await db.pushSubscription.update({ where: { id: sub.id }, data: { lastSentAt: new Date(), failures: 0 } }).catch(() => undefined);
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      return "gone";
    }
    const failures = sub.failures + 1;
    if (failures >= MAX_FAILURES) await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
    else await db.pushSubscription.update({ where: { id: sub.id }, data: { failures } }).catch(() => undefined);
    logger.warn("push.send_failed", { status });
    return "error";
  }
}

export async function getPushView(ctx: TenantContext) {
  const [org, prefs, devices] = await Promise.all([
    db.pushSettings.findUnique({ where: { organizationId: ctx.organizationId } }),
    db.pushPreference.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } } }),
    db.pushSubscription.findMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId }, select: { id: true, endpoint: true, userAgent: true, createdAt: true, lastSentAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    configured: pushConfigured(),
    publicKey: vapidPublicKey(),
    orgEnabled: org?.enabled ?? false,
    prefs: { deadlines: prefs?.deadlines ?? true, tasks: prefs?.tasks ?? true, announcements: prefs?.announcements ?? true, leadDays: prefs?.leadDays ?? 1 },
    devices: devices.map((d) => ({ id: d.id, endpoint: d.endpoint, userAgent: d.userAgent, createdAt: d.createdAt, lastSentAt: d.lastSentAt })),
  };
}

export async function saveOrgPush(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "organization:manage");
  const p = orgPushSchema.parse(raw);
  if (p.enabled && !pushConfigured()) throw new ValidationError("As chaves de aviso ainda não foram configuradas no servidor (veja docs/push.md).", { enabled: ["Chaves não configuradas."] });
  const before = await db.pushSettings.findUnique({ where: { organizationId: ctx.organizationId }, select: { enabled: true } });
  await db.pushSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, enabled: p.enabled, updatedById: ctx.userId }, update: { enabled: p.enabled, updatedById: ctx.userId } });
  if ((before?.enabled ?? false) !== p.enabled) await audit({ action: p.enabled ? "push.enable" : "push.disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "push_settings", meta: ctx.meta });
}

export async function savePrefs(ctx: TenantContext, raw: unknown) {
  const p = prefsSchema.safeParse(raw);
  if (!p.success) throw new ValidationError("Corrija os campos destacados.", { leadDays: [p.error.issues[0]?.message ?? "Valor inválido."] });
  await db.pushPreference.upsert({
    where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } },
    create: { organizationId: ctx.organizationId, userId: ctx.userId, ...p.data },
    update: p.data,
  });
}

const MAX_DEVICES = 5;

export async function subscribe(ctx: TenantContext, raw: unknown, userAgent?: string | null) {
  const p = subscriptionSchema.safeParse(raw);
  if (!p.success) throw new ValidationError("Aparelho não reconhecido pelo serviço de avisos.");
  const mine = await db.pushSubscription.count({ where: { organizationId: ctx.organizationId, userId: ctx.userId } });
  const existing = await db.pushSubscription.findUnique({ where: { endpoint: p.data.endpoint }, select: { userId: true } });
  if (!existing && mine >= MAX_DEVICES) throw new ConflictError(`Limite de ${MAX_DEVICES} aparelhos. Desative um antes de ativar outro.`);
  // O mesmo aparelho passa a pertencer a quem acabou de ativar (troca de usuário no mesmo celular).
  await db.pushSubscription.upsert({
    where: { endpoint: p.data.endpoint },
    create: { organizationId: ctx.organizationId, userId: ctx.userId, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null },
    update: { organizationId: ctx.organizationId, userId: ctx.userId, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null, failures: 0 },
  });
  await audit({ action: "push.subscribe", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "push_subscription", meta: ctx.meta });
}

export async function unsubscribe(ctx: TenantContext, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: ctx.userId, organizationId: ctx.organizationId } });
  await audit({ action: "push.unsubscribe", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "push_subscription", meta: ctx.meta });
}

const lastTest = new Map<string, number>();

/** Teste enviado só aos aparelhos de quem pediu. Funciona mesmo com o aviso do escritório desligado (é uma ação da própria pessoa). */
export async function sendTest(ctx: TenantContext, now = new Date()): Promise<{ sent: number; failed: number }> {
  if (!setup()) throw new ValidationError("As chaves de aviso ainda não foram configuradas no servidor (veja docs/push.md).");
  const prev = lastTest.get(ctx.userId) ?? 0;
  if (now.getTime() - prev < 20_000) throw new ConflictError("Aguarde alguns segundos antes de testar de novo.");
  lastTest.set(ctx.userId, now.getTime());
  const subs = await db.pushSubscription.findMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId }, select: { id: true, endpoint: true, p256dh: true, auth: true, failures: true } });
  if (!subs.length) throw new ValidationError("Nenhum aparelho ativado. Ative o aviso neste aparelho primeiro.");
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    const r = await sendToSub(s, { title: "LegalOS: teste de aviso", body: "Funcionou! Você vai receber aqui os avisos de prazos e tarefas.", url: "/conta", tag: "legalos-test" });
    if (r === "ok") sent++;
    else failed++;
  }
  await audit({ action: "push.test", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "push_subscription", metadata: { sent, failed }, meta: ctx.meta });
  return { sent, failed };
}

export type PushRunResult = { orgs: number; users: number; pushes: number; items: number; skippedNight: number; notConfigured?: true };

function localHour(tz: string, now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(now)) % 24;
}

/** Rotina agendada (a cada 15 min). Idempotente por item (`push_deliveries`). */
export async function runPushDue(now = new Date()): Promise<PushRunResult> {
  const out: PushRunResult = { orgs: 0, users: 0, pushes: 0, items: 0, skippedNight: 0 };
  if (!setup()) return { ...out, notConfigured: true };
  const orgs = await db.pushSettings.findMany({ where: { enabled: true }, select: { organizationId: true, organization: { select: { timezone: true } } } });
  for (const o of orgs) {
    out.orgs++;
    try {
      const tz = o.organization.timezone;
      const h = localHour(tz, now);
      if (h < SEND_FROM_HOUR || h >= SEND_UNTIL_HOUR) {
        out.skippedNight++;
        continue;
      }
      const today = todayYmd(tz, now);
      const subs = await db.pushSubscription.findMany({ where: { organizationId: o.organizationId, user: { disabledAt: null } }, select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true, failures: true } });
      const byUser = new Map<string, typeof subs>();
      for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
      const prefsRows = await db.pushPreference.findMany({ where: { organizationId: o.organizationId, userId: { in: [...byUser.keys()] } } });
      const prefs = new Map(prefsRows.map((p) => [p.userId, p]));
      for (const [userId, devices] of byUser) {
        out.users++;
        const pr = prefs.get(userId) ?? { deadlines: true, tasks: true, leadDays: 1 };
        const horizon = new Date(`${today}T00:00:00Z`);
        horizon.setUTCDate(horizon.getUTCDate() + pr.leadDays);
        const floor = new Date(`${today}T00:00:00Z`);
        floor.setUTCDate(floor.getUTCDate() - OVERDUE_MAX_DAYS);
        const keys: string[] = [];
        if (pr.deadlines) {
          const ds = await db.deadline.findMany({ where: { organizationId: o.organizationId, status: { in: ["DRAFT", "VALIDATED"] }, dueDate: { lte: horizon, gte: floor }, OR: [{ responsibleId: userId }, { responsibleId: null, createdById: userId }] }, select: { id: true, dueDate: true }, take: 200 });
          for (const d of ds) {
            const due = dateToYmd(d.dueDate);
            const left = diffDays(due, today);
            keys.push(`deadline:${d.id}:${due}:${left < 0 ? "overdue" : left === 0 ? "today" : "soon"}`);
          }
        }
        if (pr.tasks) {
          const ts = await db.task.findMany({ where: { organizationId: o.organizationId, deletedAt: null, assigneeId: userId, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, dueDate: { lte: horizon, gte: floor } }, select: { id: true, dueDate: true }, take: 200 });
          for (const t of ts) {
            const due = dateToYmd(t.dueDate!);
            const left = diffDays(due, today);
            keys.push(`task:${t.id}:${due}:${left < 0 ? "overdue" : left === 0 ? "today" : "soon"}`);
          }
        }
        if (!keys.length) continue;
        const done = await db.pushDelivery.findMany({ where: { userId, dedupeKey: { in: keys } }, select: { dedupeKey: true } });
        const doneSet = new Set(done.map((d) => d.dedupeKey));
        const fresh = keys.filter((k) => !doneSet.has(k));
        if (!fresh.length) continue;
        // Contagem só dos itens ainda não avisados.
        const nd = fresh.filter((k) => k.startsWith("deadline:")).length;
        const nt = fresh.filter((k) => k.startsWith("task:")).length;
        const parts = [nd ? `${nd} ${nd === 1 ? "prazo" : "prazos"}` : null, nt ? `${nt} ${nt === 1 ? "tarefa" : "tarefas"}` : null].filter(Boolean).join(" e ");
        const payload: PushPayload = { title: "LegalOS: atenção ao vencimento", body: `Você tem ${parts} para vencer ou em atraso. Toque para ver.`, url: nd && nt ? "/alertas" : nd ? "/prazos" : "/tarefas", tag: "legalos-due" };
        let ok = 0;
        for (const d of devices) if ((await sendToSub(d, payload)) === "ok") ok++;
        if (ok) {
          await db.pushDelivery.createMany({ data: fresh.map((dedupeKey) => ({ userId, dedupeKey })), skipDuplicates: true });
          out.pushes++;
          out.items += fresh.length;
        }
      }
    } catch (e) {
      logger.error("push.org_failed", { organizationId: o.organizationId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  // Limpeza do controle de entregas antigas.
  await db.pushDelivery.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } }).catch(() => undefined);
  return out;
}
