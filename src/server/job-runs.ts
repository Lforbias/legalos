import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";

/** Rotinas automáticas do sistema. `everyMin` = intervalo esperado do agendador (para apontar atraso). `manual` = o dono pode disparar na mão. */
export const JOBS = {
  webhooks: { label: "Entrega de webhooks", everyMin: 1, manual: true },
  mail: { label: "Fila de e-mails", everyMin: 5, manual: true },
  djen: { label: "Captura do DJEN", everyMin: 30, manual: true },
  mni: { label: "Sincronização PJe/MNI", everyMin: 30, manual: true },
  billing: { label: "Rotina de assinaturas (cobrança da plataforma)", everyMin: 60, manual: false },
  "chat-sla": { label: "SLA de resposta do Chat (avisos internos)", everyMin: 5, manual: true },
  "push-due": { label: "Avisos no celular (prazos e tarefas a vencer)", everyMin: 15, manual: true },
  "petition-queue": { label: "Fila de protocolos agendados", everyMin: 1, manual: true },
  monitoring: { label: "Alertas do monitoramento de intimações", everyMin: 30, manual: true },
  "whatsapp-billing": { label: "Lembretes de cobrança no WhatsApp", everyMin: 60, manual: false },
} as const;
export type JobKey = keyof typeof JOBS;

/** Mensagem técnica curta e mascarada: sem e-mails, sem sequências longas de dígitos (CPF/CNPJ/CNJ), sem pilha. */
export function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return raw
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/\d[\d.\-/]{8,}\d/g, "[número]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

export async function recordAppError(source: string, err: unknown, correlationId?: string | null): Promise<void> {
  try {
    await db.appError.create({ data: { source: source.slice(0, 60), message: sanitizeError(err), correlationId: correlationId ?? null } });
  } catch (e) {
    logger.error("app_error.record_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

function numericSummary(r: unknown): Record<string, number | boolean> | undefined {
  if (!r || typeof r !== "object") return undefined;
  const out: Record<string, number | boolean> = {};
  for (const [k, v] of Object.entries(r as Record<string, unknown>)) if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

/** Executa uma rotina registrando início, fim, duração, contagens e erro. O registro nunca derruba a rotina. */
export async function withJobRun<T>(job: JobKey, trigger: "CRON" | "MANUAL", fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  let id: string | null = null;
  try {
    id = (await db.jobRun.create({ data: { job, trigger }, select: { id: true } })).id;
  } catch (e) {
    logger.error("job_run.start_failed", { job, error: e instanceof Error ? e.message : String(e) });
  }
  const finish = async (status: "OK" | "ERROR", summary?: Record<string, number | boolean>, error?: string) => {
    if (!id) return;
    try {
      await db.jobRun.update({ where: { id }, data: { status, finishedAt: new Date(), durationMs: Date.now() - t0, summary: summary ?? undefined, error: error ?? null } });
      if (Math.random() < 0.02) {
        const cut = new Date(Date.now() - 30 * 86_400_000);
        await db.jobRun.deleteMany({ where: { startedAt: { lt: cut } } });
        await db.appError.deleteMany({ where: { createdAt: { lt: cut } } });
      }
    } catch (e) {
      logger.error("job_run.finish_failed", { job, error: e instanceof Error ? e.message : String(e) });
    }
  };
  try {
    const r = await fn();
    await finish("OK", numericSummary(r));
    return r;
  } catch (err) {
    await finish("ERROR", undefined, sanitizeError(err));
    await recordAppError(`rotina:${job}`, err);
    throw err;
  }
}
