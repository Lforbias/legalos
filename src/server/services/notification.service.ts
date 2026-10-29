import { db, type Tx } from "@/lib/db/client";
import { BOX_AVAILABLE, isBoxPath } from "@/lib/box-retirement";
import { dateToYmd, diffDays, formatYmd, todayYmd } from "@/lib/dates/ymd";
import { NotFoundError } from "@/lib/permissions/check";
import { can, type TenantContext } from "@/server/context";
import { caseVisibility } from "./case.service";

export type NotifyInput = {
  organizationId: string;
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  /** Caminho interno (começa com "/"). */
  link?: string | null;
  /** Evita duplicar o mesmo aviso. */
  dedupeKey?: string | null;
};

/** Cria avisos (idempotente por `dedupeKey`). O destinatário precisa pertencer ao escritório. */
export async function notify(items: NotifyInput | NotifyInput[], client: Tx | typeof db = db): Promise<number> {
  const list = (Array.isArray(items) ? items : [items]).filter((i) => (!i.link || (i.link.startsWith("/") && !i.link.startsWith("//"))) && (BOX_AVAILABLE || !i.link || !isBoxPath(i.link)));
  if (!list.length) return 0;
  const res = await client.notification.createMany({
    data: list.map((i) => ({
      organizationId: i.organizationId,
      userId: i.userId,
      kind: i.kind,
      title: i.title.slice(0, 200),
      body: i.body?.slice(0, 500) ?? null,
      link: i.link ?? null,
      dedupeKey: i.dedupeKey ?? null,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function listNotifications(ctx: TenantContext, opts: { unreadOnly?: boolean; take?: number } = {}) {
  return db.notification.findMany({
    where: { userId: ctx.userId, organizationId: ctx.organizationId, ...activeNotificationLinks(), ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: Math.min(opts.take ?? 50, 200),
  });
}

export async function unreadCount(ctx: TenantContext): Promise<number> {
  return db.notification.count({ where: { userId: ctx.userId, organizationId: ctx.organizationId, readAt: null, ...activeNotificationLinks() } });
}

function activeNotificationLinks() {
  if (BOX_AVAILABLE) return {};
  return { OR: [{ link: null }, { AND: ["/box", "/caixa-de-entrada", "/peticoes", "/certificados", "/monitoramento", "/integracoes/pje"].map(prefix => ({ NOT: { link: { startsWith: prefix } } })) }] };
}

export async function markRead(ctx: TenantContext, id: string) {
  const r = await db.notification.updateMany({
    where: { id, userId: ctx.userId, organizationId: ctx.organizationId, readAt: null },
    data: { readAt: new Date() },
  });
  if (r.count === 0) {
    const exists = await db.notification.findFirst({ where: { id, userId: ctx.userId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!exists) throw new NotFoundError("Notificação não encontrada.");
  }
}

export async function markAllRead(ctx: TenantContext) {
  await db.notification.updateMany({ where: { userId: ctx.userId, organizationId: ctx.organizationId, readAt: null }, data: { readAt: new Date() } });
}

const lastSync = new Map<string, number>();
const SYNC_INTERVAL_MS = 60_000;

/**
 * Gera avisos de prazos e tarefas próximos do vencimento/vencidos para o usuário atual.
 * Chamado sob demanda (ao abrir o painel) e limitado a uma vez por minuto por usuário; idempotente via `dedupeKey`.
 * Não depende de worker externo (a Fase 6 pode mover isso para um job agendado).
 */
export async function syncDueNotifications(ctx: TenantContext, now = new Date(), force = false): Promise<number> {
  const key = `${ctx.organizationId}:${ctx.userId}`;
  const prev = lastSync.get(key) ?? 0;
  if (!force && now.getTime() - prev < SYNC_INTERVAL_MS) return 0;
  lastSync.set(key, now.getTime());

  const today = todayYmd(ctx.timezone, now);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 3);
  const base = { organizationId: ctx.organizationId, userId: ctx.userId };
  const out: NotifyInput[] = [];

  if (can(ctx, "deadlines:read")) {
    const deadlines = await db.deadline.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ["DRAFT", "VALIDATED"] },
        dueDate: { lte: horizon },
        OR: [{ responsibleId: ctx.userId }, { responsibleId: null, createdById: ctx.userId }],
        case: caseVisibility(ctx),
      },
      select: { id: true, title: true, dueDate: true, status: true, case: { select: { title: true } } },
      take: 100,
    });
    for (const d of deadlines) {
      const due = dateToYmd(d.dueDate);
      const left = diffDays(due, today);
      const stage = left < 0 ? "overdue" : left === 0 ? "today" : "soon";
      const when = left < 0 ? `venceu em ${formatYmd(due)}` : left === 0 ? "vence hoje" : `vence em ${formatYmd(due)}`;
      out.push({
        ...base,
        kind: `deadline.${stage}`,
        title: `Prazo ${when}: ${d.title}`,
        body: `${d.case.title}${d.status === "DRAFT" ? " — ainda aguardando validação humana" : ""}`,
        link: `/prazos/${d.id}`,
        dedupeKey: `deadline:${d.id}:${due}:${stage}`,
      });
    }
  }

  if (can(ctx, "tasks:read")) {
    const tasks = await db.task.findMany({
      where: {
        organizationId: ctx.organizationId,
        deletedAt: null,
        assigneeId: ctx.userId,
        status: { in: ["TODO", "IN_PROGRESS", "WAITING"] },
        dueDate: { lte: new Date(`${today}T00:00:00Z`) },
        OR: [{ caseId: null }, { case: caseVisibility(ctx) }],
      },
      select: { id: true, title: true, dueDate: true },
      take: 100,
    });
    for (const t of tasks) {
      const due = dateToYmd(t.dueDate!);
      const overdue = due < today;
      out.push({
        ...base,
        kind: overdue ? "task.overdue" : "task.today",
        title: overdue ? `Tarefa atrasada (${formatYmd(due)}): ${t.title}` : `Tarefa para hoje: ${t.title}`,
        link: `/tarefas/${t.id}`,
        dedupeKey: `task:${t.id}:${due}:${overdue ? "overdue" : "today"}`,
      });
    }
  }
  return notify(out);
}
