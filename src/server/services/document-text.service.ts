import { db } from "@/lib/db/client";
import { extractText, normalizeForSearch } from "@/lib/ocr/extract";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { getObjectStream } from "@/lib/storage/local-storage";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { documentVisibilityWhere, loadDocumentChecked } from "./document.service";

export type ExtractSummary = { status: "EXTRACTED" | "EMPTY" | "UNAVAILABLE" | "FAILED"; method: string | null; chars: number; pages: number | null; error: string | null };

async function readObject(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const reader = (await getObjectStream(key)).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Extrai (e guarda) o texto da versão atual do documento. Exige `documents:write` e acesso ao dono do documento. */
export async function extractDocumentText(ctx: TenantContext, documentId: string): Promise<ExtractSummary> {
  assertCan(ctx, "documents:write");
  const doc = await loadDocumentChecked(ctx, documentId);
  const v = await db.documentVersion.findFirst({ where: { documentId: doc.id, organizationId: ctx.organizationId, version: doc.currentVersion } });
  if (!v) throw new ConflictError("Versão do documento não encontrada.");
  const ext = v.fileName.includes(".") ? v.fileName.split(".").pop()! : "";
  let buffer: Buffer;
  try {
    buffer = await readObject(v.storageKey);
  } catch {
    throw new ConflictError("O arquivo deste documento não foi encontrado no armazenamento.");
  }
  const r = await extractText(buffer, ext);
  const content = r.text.normalize("NFC");
  const data = { status: r.status, method: r.method, content, searchText: normalizeForSearch(content), pages: r.pages, error: r.error, extractedById: ctx.userId, extractedAt: new Date() };
  await db.documentText.upsert({
    where: { documentId_version: { documentId: doc.id, version: v.version } },
    create: { organizationId: ctx.organizationId, documentId: doc.id, version: v.version, ...data },
    update: data,
  });
  await audit({ action: "document.extract_text", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: doc.id, metadata: { version: v.version, status: r.status, method: r.method, chars: content.length }, meta: ctx.meta });
  return { status: r.status, method: r.method, chars: content.length, pages: r.pages, error: r.error };
}

/** Extrai o texto dos documentos visíveis cuja versão atual ainda não foi processada (até `limit`, em sequência). */
export async function extractPendingTexts(ctx: TenantContext, limit = 10): Promise<{ processed: number; extracted: number; failed: number; remaining: number }> {
  assertCan(ctx, "documents:write");
  const base = documentVisibilityWhere(ctx);
  if (!base) return { processed: 0, extracted: 0, failed: 0, remaining: 0 };
  // pendente = nenhuma linha de texto para a versão corrente (versões antigas com texto não contam)
  const candidates = await db.document.findMany({ where: base, orderBy: { updatedAt: "desc" }, select: { id: true, currentVersion: true, texts: { select: { version: true } } }, take: 500 });
  const pending = candidates.filter((d) => !d.texts.some((t) => t.version === d.currentVersion));
  const batch = pending.slice(0, Math.min(Math.max(limit, 1), 20));
  let extracted = 0;
  let failed = 0;
  for (const d of batch) {
    try {
      const r = await extractDocumentText(ctx, d.id);
      if (r.status === "EXTRACTED") extracted++;
      else if (r.status === "FAILED") failed++;
    } catch {
      failed++;
    }
  }
  return { processed: batch.length, extracted, failed, remaining: Math.max(0, pending.length - batch.length) };
}

/** Situação e prévia do texto da versão atual (para a página do documento). */
export async function getDocumentTextInfo(ctx: TenantContext, documentId: string) {
  assertCan(ctx, "documents:read");
  const doc = await loadDocumentChecked(ctx, documentId);
  const t = await db.documentText.findUnique({ where: { documentId_version: { documentId: doc.id, version: doc.currentVersion } } });
  if (!t) return null;
  return { status: t.status, method: t.method, pages: t.pages, error: t.error, chars: t.content.length, preview: t.content.slice(0, 3000), extractedAt: t.extractedAt };
}

export type ContentHit = { id: string; name: string; caseTitle: string | null; clientName: string | null; snippet: string; version: number };

const MAX_Q = 100;

/** Busca por palavras no texto extraído (sem acento, com radical em português). Respeita sigilo, permissões e escritório. */
export async function searchDocumentContent(ctx: TenantContext, rawQuery: string): Promise<ContentHit[]> {
  assertCan(ctx, "documents:read");
  const q = rawQuery.trim().slice(0, MAX_Q);
  if (q.length < 3) throw new ValidationError("Digite pelo menos 3 caracteres para buscar no conteúdo.", { q: ["Digite pelo menos 3 caracteres."] });
  const base = documentVisibilityWhere(ctx);
  if (!base) return [];
  const nq = normalizeForSearch(q);
  const rows = await db.$queryRaw<{ document_id: string; version: number }[]>`
    SELECT t.document_id::text AS document_id, t.version
    FROM document_texts t
    WHERE t.organization_id = ${ctx.organizationId}::uuid AND t.status = 'EXTRACTED'
      AND to_tsvector('portuguese', t.search_text) @@ websearch_to_tsquery('portuguese', ${nq})
    ORDER BY ts_rank(to_tsvector('portuguese', t.search_text), websearch_to_tsquery('portuguese', ${nq})) DESC
    LIMIT 200`;
  if (rows.length === 0) return [];
  const docs = await db.document.findMany({
    where: { AND: [base, { id: { in: rows.map((r) => r.document_id) } }] },
    select: { id: true, name: true, currentVersion: true, case: { select: { title: true } }, client: { select: { name: true } } },
  });
  const byId = new Map(docs.map((d) => [d.id, d]));
  const terms = nq.split(/\s+/).filter((w) => w.length >= 3 && !w.startsWith("-"));
  const out: ContentHit[] = [];
  for (const r of rows) {
    const d = byId.get(r.document_id);
    if (!d || d.currentVersion !== r.version) continue; // só a versão atual
    const t = await db.documentText.findUnique({ where: { documentId_version: { documentId: d.id, version: r.version } }, select: { content: true, searchText: true } });
    if (!t) continue;
    let at = -1;
    for (const term of terms) {
      at = t.searchText.indexOf(term.replace(/"/g, ""));
      if (at >= 0) break;
    }
    const from = Math.max(0, (at < 0 ? 0 : at) - 80);
    const snippet = `${from > 0 ? "…" : ""}${t.content.slice(from, from + 240).replace(/\s+/g, " ").trim()}…`;
    out.push({ id: d.id, name: d.name, caseTitle: d.case?.title ?? null, clientName: d.client?.name ?? null, snippet, version: r.version });
    if (out.length >= 50) break;
  }
  return out;
}

/** Trechos do texto extraído dos documentos de UM processo (para a IA). O chamador é quem garante acesso ao processo. */
export async function caseDocumentExcerpts(ctx: TenantContext, caseId: string, opts: { docs: number; chars: number }) {
  if (!can(ctx, "documents:read")) return [];
  const docs = await db.document.findMany({ where: { caseId, organizationId: ctx.organizationId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, name: true, currentVersion: true } });
  if (docs.length === 0) return [];
  const texts = await db.documentText.findMany({ where: { organizationId: ctx.organizationId, status: "EXTRACTED", documentId: { in: docs.map((d) => d.id) } }, select: { documentId: true, version: true, content: true } });
  const out: { id: string; name: string; text: string }[] = [];
  for (const d of docs) {
    const t = texts.find((x) => x.documentId === d.id && x.version === d.currentVersion);
    if (!t) continue;
    out.push({ id: d.id, name: d.name, text: t.content.slice(0, opts.chars) });
    if (out.length >= opts.docs) break;
  }
  return out;
}
