import { CASE_NATURES } from "@/modules/cases/schemas";
import { CaseStatus, ClientStatus, DeadlineStatus, NoticeStatus, type Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { dateToYmd, isYmd, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { NOTICE_KINDS } from "@/modules/inbox/schemas";
import type { TenantContext } from "@/server/context";
import { caseVisibility } from "./case.service";
import { isUniqueViolation } from "./db-errors";
import { createNotice, visibility as noticeVisibility } from "./notice.service";

/** Camada de leitura da API pública: DTOs estáveis (nunca expõem o modelo interno) e paginação por cursor. */

export const DEFAULT_PAGE = 50;
export const MAX_PAGE = 100;

export type Page<T> = { data: T[]; nextCursor: string | null };

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}
function decodeCursor(raw: string | null | undefined): { at: Date; id: string } | null {
  if (!raw) return null;
  const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const at = new Date(iso ?? "");
  if (!iso || !id || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError("Cursor inválido.", { cursor: ["Cursor inválido."] });
  return { at, id };
}
function cursorWhere(c: { at: Date; id: string } | null) {
  return c ? { OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] } : {};
}
export function parseLimit(raw: string | null | undefined): number {
  if (raw == null || raw === "") return DEFAULT_PAGE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE) throw new ValidationError("Limite inválido.", { limit: [`Use um inteiro de 1 a ${MAX_PAGE}.`] });
  return n;
}
function oneOf<T extends string>(raw: string | null | undefined, allowed: readonly T[], field: string): T | undefined {
  if (!raw) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) throw new ValidationError(`Valor inválido para ${field}.`, { [field]: [`Valores aceitos: ${allowed.join(", ")}.`] });
  return raw as T;
}
function uuid(raw: string | null | undefined, field: string): string | undefined {
  if (!raw) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) throw new ValidationError(`Valor inválido para ${field}.`, { [field]: ["Identificador inválido."] });
  return raw;
}
function ymd(raw: string | null | undefined, field: string): string | undefined {
  if (!raw) return undefined;
  if (!isYmd(raw)) throw new ValidationError(`Data inválida em ${field}.`, { [field]: ["Use AAAA-MM-DD."] });
  return raw;
}
const iso = (d: Date) => d.toISOString();
const dayOrNull = (d: Date | null) => (d ? dateToYmd(d) : null);

type Q = Record<string, string | undefined>;

async function paginate<T extends { id: string; createdAt: Date }>(rows: T[], limit: number): Promise<Page<T>> {
  const more = rows.length > limit;
  const data = more ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return { data, nextCursor: more && last ? encodeCursor(last.createdAt, last.id) : null };
}

// ---- Processos ----
const caseSelect = {
  id: true, number: true, legacyNumber: true, title: true, area: true, nature: true, departmentId: true, department: { select: { name: true } }, court: true, courtUnit: true, courtState: true, subject: true,
  claimValue: true, status: true, phase: true, distributedAt: true, confidential: true, createdAt: true, updatedAt: true,
} satisfies Prisma.CaseSelect;
type CaseRow = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;
const caseDto = (c: CaseRow) => ({
  id: c.id, number: c.number, legacyNumber: c.legacyNumber, title: c.title, area: c.area, nature: c.nature, departmentId: c.departmentId, departmentName: c.department?.name ?? null, court: c.court, courtUnit: c.courtUnit, courtState: c.courtState,
  subject: c.subject, claimValue: c.claimValue ? c.claimValue.toFixed(2) : null, status: c.status, phase: c.phase, distributedAt: dayOrNull(c.distributedAt),
  confidential: c.confidential, createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt),
});

export async function apiListCases(ctx: TenantContext, q: Q) {
  const limit = parseLimit(q.limit);
  const status = oneOf(q.status, Object.values(CaseStatus), "status");
  const nature = oneOf(q.nature, [...CASE_NATURES], "nature");
  const departmentId = uuid(q.departmentId, "departmentId");
  const where: Prisma.CaseWhereInput = {
    AND: [
      { organizationId: ctx.organizationId, deletedAt: null, ...(status ? { status } : {}), ...(nature ? { nature } : {}), ...(departmentId ? { departmentId } : {}), ...(q.number ? { number: q.number.slice(0, 40) } : {}) },
      caseVisibility(ctx),
      cursorWhere(decodeCursor(q.cursor)),
    ],
  };
  const rows = await db.case.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, select: caseSelect });
  const p = await paginate(rows, limit);
  return { data: p.data.map(caseDto), nextCursor: p.nextCursor };
}

export async function apiGetCase(ctx: TenantContext, id: string) {
  uuid(id, "id");
  const c = await db.case.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] }, select: caseSelect });
  if (!c) throw new NotFoundError("Processo não encontrado.");
  return caseDto(c);
}

// ---- Clientes ----
const clientSelect = {
  id: true, type: true, status: true, name: true, tradeName: true, document: true, email: true, phone: true, tags: true,
  addressCity: true, addressState: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ClientSelect;
type ClientRow = Prisma.ClientGetPayload<{ select: typeof clientSelect }>;
const clientDto = (c: ClientRow) => ({
  id: c.id, type: c.type, status: c.status, name: c.name, tradeName: c.tradeName, document: c.document, email: c.email, phone: c.phone, tags: c.tags,
  city: c.addressCity, state: c.addressState, createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt),
});

export async function apiListClients(ctx: TenantContext, q: Q) {
  const limit = parseLimit(q.limit);
  const status = oneOf(q.status, Object.values(ClientStatus), "status");
  const search = q.q?.trim().slice(0, 80);
  const where: Prisma.ClientWhereInput = {
    AND: [{ organizationId: ctx.organizationId, deletedAt: null, ...(status ? { status } : {}), ...(search ? { name: { contains: search, mode: "insensitive" } } : {}) }, cursorWhere(decodeCursor(q.cursor))],
  };
  const rows = await db.client.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, select: clientSelect });
  const p = await paginate(rows, limit);
  return { data: p.data.map(clientDto), nextCursor: p.nextCursor };
}

export async function apiGetClient(ctx: TenantContext, id: string) {
  uuid(id, "id");
  const c = await db.client.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, select: clientSelect });
  if (!c) throw new NotFoundError("Cliente não encontrado.");
  return clientDto(c);
}

// ---- Prazos ----
const deadlineSelect = {
  id: true, caseId: true, title: true, kind: true, status: true, dueDate: true, internalDueDate: true, responsibleId: true, fulfilledAt: true, validatedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.DeadlineSelect;
type DeadlineRow = Prisma.DeadlineGetPayload<{ select: typeof deadlineSelect }>;
const deadlineDto = (d: DeadlineRow) => ({
  id: d.id, caseId: d.caseId, title: d.title, kind: d.kind, status: d.status, dueDate: dateToYmd(d.dueDate), internalDueDate: dayOrNull(d.internalDueDate),
  responsibleId: d.responsibleId, validatedAt: d.validatedAt ? iso(d.validatedAt) : null, fulfilledAt: d.fulfilledAt ? iso(d.fulfilledAt) : null,
  createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt),
});

export async function apiListDeadlines(ctx: TenantContext, q: Q) {
  const limit = parseLimit(q.limit);
  const status = oneOf(q.status, Object.values(DeadlineStatus), "status");
  const from = ymd(q.from, "from");
  const to = ymd(q.to, "to");
  const caseId = uuid(q.caseId, "caseId");
  const due: Prisma.DateTimeFilter = { ...(from ? { gte: ymdToDate(from) } : {}), ...(to ? { lte: ymdToDate(to) } : {}) };
  const where: Prisma.DeadlineWhereInput = {
    AND: [
      { organizationId: ctx.organizationId, ...(status ? { status } : {}), ...(caseId ? { caseId } : {}), ...(from || to ? { dueDate: due } : {}), case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } },
      cursorWhere(decodeCursor(q.cursor)),
    ],
  };
  const rows = await db.deadline.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, select: deadlineSelect });
  const p = await paginate(rows, limit);
  return { data: p.data.map(deadlineDto), nextCursor: p.nextCursor };
}

// ---- Intimações ----
const noticeSelect = {
  id: true, source: true, status: true, kind: true, title: true, caseNumber: true, court: true, publishedAt: true, receivedAt: true, caseId: true,
  assigneeId: true, tags: true, duplicateOfId: true, processedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.CourtNoticeSelect;
type NoticeRow = Prisma.CourtNoticeGetPayload<{ select: typeof noticeSelect }>;
const noticeDto = (n: NoticeRow, content?: string) => ({
  id: n.id, source: n.source, status: n.status, kind: n.kind, title: n.title, caseNumber: n.caseNumber, court: n.court, publishedAt: dayOrNull(n.publishedAt),
  receivedAt: dateToYmd(n.receivedAt), caseId: n.caseId, assigneeId: n.assigneeId, tags: n.tags, duplicateOfId: n.duplicateOfId,
  processedAt: n.processedAt ? iso(n.processedAt) : null, createdAt: iso(n.createdAt), updatedAt: iso(n.updatedAt), ...(content !== undefined ? { content } : {}),
});

export async function apiListNotices(ctx: TenantContext, q: Q) {
  const limit = parseLimit(q.limit);
  const status = oneOf(q.status, Object.values(NoticeStatus), "status");
  const caseId = uuid(q.caseId, "caseId");
  const where: Prisma.CourtNoticeWhereInput = {
    AND: [{ organizationId: ctx.organizationId, deletedAt: null, ...(status ? { status } : {}), ...(caseId ? { caseId } : {}) }, noticeVisibility(ctx), cursorWhere(decodeCursor(q.cursor))],
  };
  const rows = await db.courtNotice.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, select: noticeSelect });
  const p = await paginate(rows, limit);
  return { data: p.data.map((n) => noticeDto(n)), nextCursor: p.nextCursor };
}

export async function apiGetNotice(ctx: TenantContext, id: string) {
  uuid(id, "id");
  const n = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, noticeVisibility(ctx)] }, select: { ...noticeSelect, content: true } });
  if (!n) throw new NotFoundError("Intimação não encontrada.");
  return noticeDto(n, n.content);
}

export type ApiNoticeInput = {
  title?: unknown; content?: unknown; kind?: unknown; caseNumber?: unknown; court?: unknown; publishedAt?: unknown; receivedAt?: unknown; caseId?: unknown; externalId?: unknown;
};
const str = (v: unknown, field: string, max: number, required = false): string => {
  if (v == null || v === "") {
    if (required) throw new ValidationError(`Campo obrigatório: ${field}.`, { [field]: ["Obrigatório."] });
    return "";
  }
  if (typeof v !== "string" || v.length > max) throw new ValidationError(`Campo inválido: ${field}.`, { [field]: [`Texto de até ${max} caracteres.`] });
  return v;
};

/** Registra uma intimação vinda de sistema externo. `externalId` torna a chamada idempotente (mesmo id = mesma intimação). */
export async function apiCreateNotice(ctx: TenantContext, body: ApiNoticeInput) {
  const kind = body.kind == null || body.kind === "" ? "INTIMACAO" : oneOf(String(body.kind), NOTICE_KINDS, "kind");
  const externalId = str(body.externalId, "externalId", 120);
  if (externalId && !/^[\w.:@/-]+$/.test(externalId)) throw new ValidationError("externalId inválido.", { externalId: ["Use letras, números e . : @ / _ -"] });
  const externalKey = externalId ? `api:${externalId}` : undefined;
  const find = () =>
    db.courtNotice.findFirst({ where: { AND: [{ organizationId: ctx.organizationId, externalKey, deletedAt: null }, noticeVisibility(ctx)] }, select: { ...noticeSelect, content: true } });
  if (externalKey) {
    const hit = await find();
    if (hit) return { created: false, notice: noticeDto(hit, hit.content) };
  }
  const input = {
    source: "MANUAL" as const,
    kind: kind as (typeof NOTICE_KINDS)[number],
    title: str(body.title, "title", 200, true),
    content: str(body.content, "content", 50_000, true),
    caseNumber: str(body.caseNumber, "caseNumber", 40),
    court: str(body.court, "court", 120),
    publishedAt: ymd(str(body.publishedAt, "publishedAt", 10), "publishedAt") ?? "",
    receivedAt: ymd(str(body.receivedAt, "receivedAt", 10), "receivedAt") ?? todayYmd(ctx.timezone),
    caseId: uuid(str(body.caseId, "caseId", 36), "caseId") ?? "",
  };
  let made;
  try {
    made = await createNotice(ctx, input, { source: "IMPORTED", externalKey });
  } catch (e) {
    if (externalKey && isUniqueViolation(e)) {
      const hit = await find();
      if (hit) return { created: false, notice: noticeDto(hit, hit.content) };
    }
    throw e;
  }
  const n = await db.courtNotice.findFirstOrThrow({ where: { id: made.id, organizationId: ctx.organizationId }, select: { ...noticeSelect, content: true } });
  return { created: true, notice: noticeDto(n, n.content) };
}
