import { timingSafeEqual } from "node:crypto";
import { sourceSweep } from "@/server/audience/editorial";
import { marketingSweep } from "@/server/audience/marketing";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(req: Request) {
  const s = process.env.CRON_SECRET ?? "",
    given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (
    s.length < 24 ||
    Buffer.byteLength(given) !== Buffer.byteLength(s) ||
    !timingSafeEqual(Buffer.from(s), Buffer.from(given))
  )
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  return Response.json({
    editorial: await sourceSweep(),
    marketing: await marketingSweep(),
  });
}
