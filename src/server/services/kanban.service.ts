import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { boardNameSchema, cardSchema, columnNameSchema, DEFAULT_COLUMNS, MAX_COLUMNS, type CardInput } from "@/modules/kanban/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertActiveMember, assertCaseVisible, caseVisibility } from "./case.service";
import { userNames } from "./members";

/**
 * 2.0-F3 — quadros Kanban de gestão. Livres por escritório: o escritório cria quadros e colunas.
 * Ver = tasks:read; mexer nos cartões = tasks:write; criar/arquivar quadros e editar colunas = organization:manage.
 * Cartão ligado a processo sigiloso só aparece para quem pode ver o processo.
 */
const cardVisibility = (ctx: TenantContext): Prisma.KanbanCardWhereInput => ({
  OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }],
});

const dup = (e: unknown, msg: string): never => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationError(msg, { name: [msg] });
  throw e;
};

async function board(ctx: TenantContext, id: string) {
  const b = await db.kanbanBoard.findFirst({ where: { id, organizationId: ctx.organizationId, archivedAt: null } });
  if (!b) throw new NotFoundError("Quadro não encontrado.");
  return b;
}

async function event(tx: Prisma.TransactionClient | typeof db, ctx: TenantContext, cardId: string, kind: string, text: string) {
  await tx.kanbanCardEvent.create({ data: { organizationId: ctx.organizationId, cardId, userId: ctx.userId, kind, text } });
}

/* ---------- quadros ---------- */
export async function listBoards(ctx: TenantContext) {
  assertCan(ctx, "tasks:read");
  const boards = await db.kanbanBoard.findMany({ where: { organizationId: ctx.organizationId, archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const counts = await db.kanbanCard.groupBy({ by: ["boardId"], where: { organizationId: ctx.organizationId, deletedAt: null, closedAt: null, boardId: { in: boards.map((b) => b.id) } }, _count: true });
  return boards.map((b) => ({ ...b, open: counts.find((c) => c.boardId === b.id)?._count ?? 0 }));
}

export async function createBoard(ctx: TenantContext, name: string) {
  assertCan(ctx, "organization:manage");
  const n = boardNameSchema.parse(name);
  try {
    const b = await db.kanbanBoard.create({
      data: { organizationId: ctx.organizationId, name: n, createdById: ctx.userId, columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ organizationId: ctx.organizationId, name: c.name, isDone: c.isDone, position: i })) } },
    });
    await audit({ action: "kanban.board_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "kanban_board", resourceId: b.id, meta: ctx.meta });
    return b.id;
  } catch (e) {
    return dup(e, "Já existe um quadro com esse nome.");
  }
}

export async function renameBoard(ctx: TenantContext, id: string, name: string) {
  assertCan(ctx, "organization:manage");
  await board(ctx, id);
  try {
    await db.kanbanBoard.update({ where: { id }, data: { name: boardNameSchema.parse(name) } });
  } catch (e) {
    dup(e, "Já existe um quadro com esse nome.");
  }
}

export async function archiveBoard(ctx: TenantContext, id: string) {
  assertCan(ctx, "organization:manage");
  await board(ctx, id);
  await db.kanbanBoard.update({ where: { id }, data: { archivedAt: new Date() } });
  await audit({ action: "kanban.board_archive", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "kanban_board", resourceId: id, meta: ctx.meta });
}

export type BoardFilters = { month?: string; assigneeId?: string; q?: string; includeClosed?: boolean };

export async function getBoard(ctx: TenantContext, id: string, f: BoardFilters = {}) {
  assertCan(ctx, "tasks:read");
  const b = await board(ctx, id);
  const and: Prisma.KanbanCardWhereInput[] = [cardVisibility(ctx)];
  if (f.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.month)) throw new ValidationError("Mês inválido.", { month: ["Use AAAA-MM."] });
    const [y, m] = f.month.split("-").map(Number) as [number, number];
    and.push({ dueDate: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } });
  }
  if (f.assigneeId) and.push({ assigneeId: f.assigneeId });
  if (f.q?.trim()) and.push({ title: { contains: f.q.trim(), mode: "insensitive" } });
  if (!f.includeClosed) and.push({ closedAt: null });
  const [columns, cards] = await Promise.all([
    db.kanbanColumn.findMany({ where: { boardId: id }, orderBy: { position: "asc" } }),
    db.kanbanCard.findMany({
      where: { boardId: id, organizationId: ctx.organizationId, deletedAt: null, AND: and },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take: 500,
      include: { case: { select: { id: true, title: true, number: true } }, client: { select: { id: true, name: true } } },
    }),
  ]);
  const names = await userNames(ctx, cards.map((c) => c.assigneeId));
  return {
    board: { id: b.id, name: b.name },
    columns: columns.map((c) => ({ id: c.id, name: c.name, isDone: c.isDone, position: c.position })),
    cards: cards.map((c) => ({ ...c, assigneeName: c.assigneeId ? (names.get(c.assigneeId) ?? null) : null })),
  };
}

/* ---------- colunas ---------- */
export async function addColumn(ctx: TenantContext, boardId: string, name: string, isDone = false) {
  assertCan(ctx, "organization:manage");
  await board(ctx, boardId);
  const n = columnNameSchema.parse(name);
  const cols = await db.kanbanColumn.findMany({ where: { boardId }, select: { position: true } });
  if (cols.length >= MAX_COLUMNS) throw new ValidationError(`No máximo ${MAX_COLUMNS} colunas por quadro.`, { name: ["Limite de colunas atingido."] });
  await db.kanbanColumn.create({ data: { organizationId: ctx.organizationId, boardId, name: n, isDone, position: Math.max(-1, ...cols.map((c) => c.position)) + 1 } });
}

async function column(ctx: TenantContext, id: string) {
  const c = await db.kanbanColumn.findFirst({ where: { id, organizationId: ctx.organizationId, board: { archivedAt: null } } });
  if (!c) throw new NotFoundError("Coluna não encontrada.");
  return c;
}

export async function renameColumn(ctx: TenantContext, id: string, name: string, isDone?: boolean) {
  assertCan(ctx, "organization:manage");
  await column(ctx, id);
  await db.kanbanColumn.update({ where: { id }, data: { name: columnNameSchema.parse(name), ...(isDone === undefined ? {} : { isDone }) } });
}

export async function shiftColumn(ctx: TenantContext, id: string, dir: -1 | 1) {
  assertCan(ctx, "organization:manage");
  const c = await column(ctx, id);
  const cols = await db.kanbanColumn.findMany({ where: { boardId: c.boardId }, orderBy: { position: "asc" } });
  const i = cols.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= cols.length) return;
  const order = cols.map((x) => x.id);
  [order[i], order[j]] = [order[j]!, order[i]!];
  await db.$transaction(order.map((cid, pos) => db.kanbanColumn.update({ where: { id: cid }, data: { position: pos } })));
}

export async function deleteColumn(ctx: TenantContext, id: string) {
  assertCan(ctx, "organization:manage");
  const c = await column(ctx, id);
  const [total, used] = await Promise.all([db.kanbanColumn.count({ where: { boardId: c.boardId } }), db.kanbanCard.count({ where: { columnId: id, deletedAt: null } })]);
  if (total <= 1) throw new ConflictError("O quadro precisa ter ao menos uma coluna.");
  if (used > 0) throw new ConflictError("Mova os cartões desta coluna antes de excluí-la.");
  await db.kanbanColumn.delete({ where: { id } }).catch(async () => {
    throw new ConflictError("A coluna ainda tem cartões arquivados; não pode ser excluída.");
  });
}

/* ---------- cartões ---------- */
async function validateLinks(ctx: TenantContext, v: { assigneeId: string; caseId: string; clientId: string }) {
  if (v.assigneeId) await assertActiveMember(ctx, v.assigneeId);
  if (v.caseId) await assertCaseVisible(ctx, v.caseId);
  if (v.clientId) {
    assertCan(ctx, "clients:read");
    const c = await db.client.findFirst({ where: { id: v.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
    if (!c) throw new ValidationError("Cliente não encontrado.", { clientId: ["Selecione um cliente válido."] });
  }
}

async function nextPosition(columnId: string) {
  const last = await db.kanbanCard.findFirst({ where: { columnId, deletedAt: null }, orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? -1) + 1;
}

export async function createCard(ctx: TenantContext, boardId: string, raw: CardInput, opts: { runId?: string } = {}) {
  assertCan(ctx, "tasks:write");
  await board(ctx, boardId);
  const v = cardSchema.parse(raw);
  await validateLinks(ctx, v);
  const cols = await db.kanbanColumn.findMany({ where: { boardId }, orderBy: { position: "asc" } });
  const col = v.columnId ? cols.find((c) => c.id === v.columnId) : cols[0];
  if (!col) throw new ValidationError("Coluna inválida.", { columnId: ["Selecione uma coluna do quadro."] });
  const card = await db.$transaction(async (tx) => {
    const c = await tx.kanbanCard.create({
      data: {
        organizationId: ctx.organizationId, boardId, columnId: col.id, title: v.title, description: v.description || null,
        assigneeId: v.assigneeId || null, dueDate: v.dueDate ? new Date(`${v.dueDate}T00:00:00Z`) : null,
        caseId: v.caseId || null, clientId: v.clientId || null, position: await nextPosition(col.id),
        closedAt: col.isDone ? new Date() : null, runId: opts.runId ?? null, createdById: ctx.userId,
      },
    });
    await event(tx, ctx, c.id, "created", `Cartão criado em "${col.name}"`);
    return c;
  });
  await audit({ action: "kanban.card_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "kanban_card", resourceId: card.id, meta: ctx.meta });
  return card;
}

async function card(ctx: TenantContext, id: string) {
  const c = await db.kanbanCard.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null, board: { archivedAt: null }, AND: [cardVisibility(ctx)] }, include: { column: true } });
  if (!c) throw new NotFoundError("Cartão não encontrado.");
  return c;
}

export async function updateCard(ctx: TenantContext, id: string, raw: CardInput) {
  assertCan(ctx, "tasks:write");
  const cur = await card(ctx, id);
  const v = cardSchema.parse(raw);
  await validateLinks(ctx, v);
  await db.$transaction(async (tx) => {
    await tx.kanbanCard.update({
      where: { id },
      data: { title: v.title, description: v.description || null, assigneeId: v.assigneeId || null, dueDate: v.dueDate ? new Date(`${v.dueDate}T00:00:00Z`) : null, caseId: v.caseId || null, clientId: v.clientId || null },
    });
    const changes: string[] = [];
    if (cur.title !== v.title) changes.push("título");
    if ((cur.assigneeId ?? "") !== v.assigneeId) changes.push("responsável");
    if ((cur.dueDate?.toISOString().slice(0, 10) ?? "") !== v.dueDate) changes.push("prazo");
    if ((cur.caseId ?? "") !== v.caseId || (cur.clientId ?? "") !== v.clientId) changes.push("vínculo");
    if ((cur.description ?? "") !== v.description) changes.push("descrição");
    if (changes.length) await event(tx, ctx, id, "updated", `Alterado: ${changes.join(", ")}`);
  });
}

export async function moveCard(ctx: TenantContext, id: string, columnId: string) {
  assertCan(ctx, "tasks:write");
  const cur = await card(ctx, id);
  const col = await db.kanbanColumn.findFirst({ where: { id: columnId, boardId: cur.boardId } });
  if (!col) throw new ValidationError("Coluna inválida.", { columnId: ["Selecione uma coluna do quadro."] });
  if (col.id === cur.columnId) return;
  await db.$transaction(async (tx) => {
    await tx.kanbanCard.update({ where: { id }, data: { columnId: col.id, position: await nextPosition(col.id), closedAt: col.isDone ? new Date() : null } });
    await event(tx, ctx, id, "moved", `Movido de "${cur.column.name}" para "${col.name}"`);
  });
}

export async function deleteCard(ctx: TenantContext, id: string) {
  assertCan(ctx, "tasks:write");
  await card(ctx, id);
  await db.kanbanCard.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "kanban.card_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "kanban_card", resourceId: id, meta: ctx.meta });
}

export async function listCardEvents(ctx: TenantContext, id: string) {
  assertCan(ctx, "tasks:read");
  await card(ctx, id);
  const ev = await db.kanbanCardEvent.findMany({ where: { cardId: id, organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 50 });
  const names = await userNames(ctx, ev.map((e) => e.userId));
  return ev.map((e) => ({ id: e.id, kind: e.kind, text: e.text, createdAt: e.createdAt, userName: e.userId ? (names.get(e.userId) ?? "Usuário removido") : "Sistema" }));
}

