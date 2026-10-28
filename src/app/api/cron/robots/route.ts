import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withJobRun } from "@/server/job-runs";
import { enqueueDueSyncs } from "@/server/services/portal-access.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Agendador do robô: só ENFILEIRA a leitura periódica (quem executa é o worker). Desligado até ROBOT_SYNC_ENABLED=1. */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Agendamento não configurado." }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const r = await withJobRun("robots", "CRON", () => enqueueDueSyncs());
  return NextResponse.json(r);
}
