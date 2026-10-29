import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withJobRun } from "@/server/job-runs";
import { runHealthCheck } from "@/server/judicial/health.service";
import { runMonitoringCheck } from "@/server/services/monitoring.service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Disparado por um agendador (cron) com `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Agendamento não configurado." }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  // Box 2.0: saúde por fonte (tolerância própria, silêncio suspeito, certificado vencendo, rotina parada). O alerta legado de 36 h
  // só continua para escritórios que ainda usam a tela antiga; as duas verificações são idempotentes e não se duplicam em tela nova.
  const r = await withJobRun("monitoring", "CRON", async () => {
    const health = await runHealthCheck();
    const legacy = await runMonitoringCheck();
    return { ...health, legacyChecked: legacy.checked, legacyAlerts: legacy.alerts };
  });
  return NextResponse.json(r);
}
