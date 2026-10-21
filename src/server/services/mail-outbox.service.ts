import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { getMailer } from "@/lib/mail/mailer";

/**
 * Fila de e-mails com reenvio (avisos de cobrança e de teste). NÃO é usada para e-mails com link de acesso
 * (recuperação de senha, convite, confirmação): o token não pode ficar gravado em texto no banco; esses são enviados na hora.
 */
const MAX_ATTEMPTS = 6;
const BACKOFF_MIN = [2, 10, 60, 240, 720];
const LEASE_MIN = 5;
const EMAIL_RE = /^[^<>@\s,;]+@[^<>@\s,;]+\.[^<>@\s,;]+$/;

export type OutboxInput = { organizationId?: string | null; kind: string; to: string; subject: string; text: string; html?: string; dedupeKey?: string };

/** Enfileira. Sem driver que entregue de verdade (console) não enfileira: nada seria entregue. Com `dedupeKey` igual, só um é criado. */
export async function enqueueMail(input: OutboxInput): Promise<{ queued: boolean; reason?: "driver" | "duplicate" | "invalid_email" }> {
  const to = input.to.trim();
  if (!EMAIL_RE.test(to) || /[\r\n]/.test(input.subject)) return { queued: false, reason: "invalid_email" };
  if (!getMailer().delivers) return { queued: false, reason: "driver" };
  try {
    await db.mailOutbox.create({ data: { organizationId: input.organizationId ?? null, kind: input.kind, toEmail: to, subject: input.subject, textBody: input.text, htmlBody: input.html ?? null, dedupeKey: input.dedupeKey ?? null } });
    return { queued: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { queued: false, reason: "duplicate" };
    throw e;
  }
}

type Row = { id: string; toEmail: string; subject: string; textBody: string; htmlBody: string | null; attempts: number };
export type MailRunResult = { claimed: number; sent: number; retrying: number; failed: number; skipped: boolean; purged: number };

export async function runMailOutbox(limit = 30): Promise<MailRunResult> {
  const out: MailRunResult = { claimed: 0, sent: 0, retrying: 0, failed: 0, skipped: false, purged: 0 };
  const mailer = getMailer();
  if (!mailer.delivers) return { ...out, skipped: true }; // sem driver real, a fila fica parada (nada é marcado como enviado)
  const rows = await db.$queryRaw<Row[]>`
    UPDATE mail_outbox SET next_attempt_at = now() + make_interval(mins => ${LEASE_MIN})
    WHERE id IN (SELECT id FROM mail_outbox WHERE status = 'PENDING' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, to_email AS "toEmail", subject, text_body AS "textBody", html_body AS "htmlBody", attempts`;
  out.claimed = rows.length;
  for (const r of rows) {
    try {
      await mailer.send({ to: r.toEmail, subject: r.subject, text: r.textBody, ...(r.htmlBody ? { html: r.htmlBody } : {}) });
      await db.mailOutbox.update({ where: { id: r.id }, data: { status: "SENT", sentAt: new Date(), attempts: r.attempts + 1, lastError: null } });
      out.sent++;
    } catch (e) {
      const attempts = r.attempts + 1;
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      logger.error("mail.outbox_failed", { id: r.id, attempts, error: msg });
      if (attempts >= MAX_ATTEMPTS) {
        await db.mailOutbox.update({ where: { id: r.id }, data: { status: "FAILED", attempts, lastError: msg } });
        out.failed++;
      } else {
        await db.mailOutbox.update({ where: { id: r.id }, data: { attempts, lastError: msg, nextAttemptAt: new Date(Date.now() + (BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] ?? 720) * 60_000) } });
        out.retrying++;
      }
    }
  }
  // Corpo dos e-mails enviados não precisa ficar guardado: apaga após 30 dias (e falhos após 90).
  const p1 = await db.mailOutbox.deleteMany({ where: { status: "SENT", sentAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
  const p2 = await db.mailOutbox.deleteMany({ where: { status: "FAILED", createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } });
  out.purged = p1.count + p2.count;
  return out;
}

export async function mailQueueStats() {
  const [pending, failed, sent24h] = await Promise.all([
    db.mailOutbox.count({ where: { status: "PENDING" } }),
    db.mailOutbox.count({ where: { status: "FAILED" } }),
    db.mailOutbox.count({ where: { status: "SENT", sentAt: { gt: new Date(Date.now() - 86_400_000) } } }),
  ]);
  return { pending, failed, sent24h, delivers: getMailer().delivers, driver: getMailer().name };
}
