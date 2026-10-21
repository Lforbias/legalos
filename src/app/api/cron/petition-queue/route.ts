import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withJobRun } from "@/server/job-runs";
import { runDueSchedules } from "@/server/services/petition-queue.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Disparado por um agendador (cron) com `Authorization: Bearer $CRON_SECRET`. Sem segredo configurado, a rota fica desligada. */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Agendamento não configurado." }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const r = await withJobRun("petition-queue", "CRON", () => runDueSchedules());
  return NextResponse.json(r);
}
