import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withJobRun } from "@/server/job-runs";
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
  const r = await withJobRun("monitoring", "CRON", () => runMonitoringCheck());
  return NextResponse.json(r);
}
