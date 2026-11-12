import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { formatCnj, isValidCnj } from "@/lib/validation/br-documents";
import { authenticateApiKey } from "@/server/services/apikey.service";
import { createNotice } from "@/server/services/notice.service";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

type LegalMailDocument = {
  tipo?: unknown;
  title?: unknown;
  text?: unknown;
  idmovimentacoes?: unknown;
  movement_date?: unknown;
  "intimation_date "?: unknown;
};
type LegalMailProcess = {
  numero_processo?: unknown;
  tribunal?: unknown;
  documento?: unknown;
};

const str = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const ymd = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

/** Recebe apenas intimações/movimentações. Eventos de protocolo e conta são deliberadamente ignorados. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  const event = body as { clientkey?: unknown; params?: unknown; teste?: unknown };
  const clientkey = str(event.clientkey, 256);
  if (!clientkey) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const principal = await authenticateApiKey(clientkey, { ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: req.headers.get("user-agent") });
  if (!principal?.scopes.has("legalmail:ingest")) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (event.teste === true) return NextResponse.json({ ok: true, teste: true });
  if (!Array.isArray(event.params)) return NextResponse.json({ ok: true, ignored: true });
  const items = event.params as LegalMailProcess[];
  if (items.length > 50) return NextResponse.json({ error: "Eventos demais no mesmo envio." }, { status: 413 });

  let imported = 0;
  let duplicates = 0;
  let pdfPending = 0;
  let unmatched = 0;
  try {
    for (const process of items) {
      const rawCaseNumber = str(process.numero_processo, 40);
      const caseNumber = isValidCnj(rawCaseNumber) ? formatCnj(rawCaseNumber) : "";
      const docs = Array.isArray(process.documento) ? process.documento as LegalMailDocument[] : [];
      if (docs.length > 100) return NextResponse.json({ error: "Documentos demais no mesmo envio." }, { status: 413 });
      for (const doc of docs) {
        // Arquivos PDF usam URLs assinadas; esta primeira etapa importa o teor textual e deixa o download binário para uma etapa com armazenamento privado configurado.
        if (doc.tipo === "pdf") { pdfPending++; continue; }
        if (doc.tipo !== "text") continue;
        const content = str(doc.text, 50_000);
        const movementId = typeof doc.idmovimentacoes === "number" || typeof doc.idmovimentacoes === "string" ? String(doc.idmovimentacoes).slice(0, 80) : "";
        if (content.length < 10 || !movementId) continue;
        const externalKey = `legalmail:${movementId}`;
        const existing = await db.courtNotice.findFirst({ where: { organizationId: principal.ctx.organizationId, externalKey }, select: { id: true } });
        if (existing) { duplicates++; continue; }
        const title = str(doc.title, 200) || "Comunicação do LegalMail";
        const receivedAt = ymd(str(doc.movement_date, 10)) || new Date().toISOString().slice(0, 10);
        const publishedAt = ymd(str(doc["intimation_date "], 10));
        const mappedKind = /cita/i.test(title) ? "CITACAO" : /senten/i.test(title) ? "SENTENCA" : /decis/i.test(title) ? "DECISAO" : /despach/i.test(title) ? "DESPACHO" : /intima/i.test(title) ? "INTIMACAO" : "OUTRO";
        const notice = await createNotice(principal.ctx, {
          source: "FILE", kind: mappedKind, title, content,
          caseNumber, court: str(process.tribunal, 120), publishedAt,
          receivedAt, caseId: "",
        }, { source: "IMPORTED", externalKey, integrationImport: true });
        imported++;
        if (!notice.caseId) unmatched++;
      }
    }
    return NextResponse.json({ ok: true, imported, duplicates, unmatched, pdfPending });
  } catch (error) {
    logger.error("legalmail.webhook_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Falha ao processar a comunicação." }, { status: 500 });
  }
}
