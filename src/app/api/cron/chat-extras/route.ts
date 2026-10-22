import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withJobRun } from "@/server/job-runs";
import { runChatExtras } from "@/server/services/chat-extras.service";

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

/** Envia as mensagens agendadas já no horário (somente as aprovadas por humano ao agendar) e avisa a equipe dos retornos combinados. Disparado por agendador com `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Agendamento não configurado." }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const r = await withJobRun("chat-extras", "CRON", () => runChatExtras());
  return NextResponse.json(r);
}
