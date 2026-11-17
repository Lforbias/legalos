import { db, type Tx } from "@/lib/db/client";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { errorResponse, isSameOrigin } from "@/server/http";
import { ASTREA_ZIP_MAX_BYTES, withAstreaArchive } from "@/server/import/astrea-archive";
import { runAstreaImport } from "@/server/import/astrea-import";
import { getTenant } from "@/server/session";

export const runtime = "nodejs";

async function readZip(request: Request) {
  if (!request.body || Number(request.headers.get("content-length")) > ASTREA_ZIP_MAX_BYTES) {
    throw new ValidationError("Selecione um ZIP do Astrea de até 48 MB.");
  }
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > ASTREA_ZIP_MAX_BYTES) {
        await reader.cancel();
        throw new ValidationError("Selecione um ZIP do Astrea de até 48 MB.");
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem não permitida." }, { status: 403 });
  const tenant = await getTenant();
  if (!tenant) return Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
  const { ctx } = tenant;
  if (!ctx.isOwner) return Response.json({ error: "A importação completa está disponível para o titular do escritório." }, { status: 403 });
  const mode = new URL(request.url).searchParams.get("modo");
  if (mode !== "simular" && mode !== "importar") return Response.json({ error: "Modo de importação inválido." }, { status: 400 });

  try {
    const bytes = await readZip(request);
    const dryRun = mode === "simular";
    const report = await withAstreaArchive(bytes, async (dir) => {
      const execute = (transaction?: Tx) => runAstreaImport({
        organizationId: ctx.organizationId, importerUserId: ctx.userId, timezone: ctx.timezone, dir, dryRun, transaction,
      });
      if (dryRun) return execute();
      return db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${`import.astrea:${ctx.organizationId}`}, 0)) AS locked`;
        if (!row?.locked) throw new ConflictError("Já há uma importação do Astrea em andamento neste escritório.");
        return execute(tx);
      }, { timeout: 240_000 });
    });
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
