import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withJobRun } from "@/server/job-runs";
import { runDjenAll } from "@/server/services/djen.service";

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

/** Atualiza os monitoramentos públicos DJEN ligados por OAB. */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Agendamento não configurado." }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  return NextResponse.json(await withJobRun("djen", "CRON", () => runDjenAll()));
}
