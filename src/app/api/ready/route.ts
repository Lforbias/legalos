import { access, constants, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** Prontidão: banco responde, migrações aplicadas e armazenamento gravável. Só devolve booleanos (nada interno). */
export async function GET() {
  const checks = { database: false, migrations: false, storage: false };
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = true;
    const r = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM _legalos_migrations`;
    checks.migrations = Number(r[0]?.n ?? 0) > 0;
  } catch {
    // mantém false
  }
  try {
    const dir = path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), ".storage"));
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    checks.storage = true;
  } catch {
    // mantém false
  }
  const ok = checks.database && checks.migrations && checks.storage;
  return NextResponse.json({ status: ok ? "ready" : "not_ready", checks }, { status: ok ? 200 : 503 });
}
