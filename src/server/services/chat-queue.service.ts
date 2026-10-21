import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { isUniqueViolation } from "./db-errors";
import { notify } from "./notification.service";

/**
 * LegalOS Chat — filas de atendimento e distribuição automática.
 * Uma fila aponta (opcionalmente) para uma EQUIPE já existente no Box e escolhe o atendente por rodízio ou por menor carga.
 * Só recebe quem tem acesso de escrita ao atendimento, não está desativado e marcou "disponível".
 */

export const STRATEGIES = ["ROUND_ROBIN", "LEAST_LOAD", "MANUAL"] as const;
export type Strategy = (typeof STRATEGIES)[number];
export const STRATEGY_LABEL: Record<Strategy, string> = { ROUND_ROBIN: "Rodízio (quem recebeu há mais tempo)", LEAST_LOAD: "Menor carga (menos conversas abertas)", MANUAL: "Manual (fica na fila até alguém pegar)" };

// ---------------- filas ----------------

export async function listQueues(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:read");
  const rows = await db.whatsappQueue.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }], include: { team: { select: { id: true, name: true, _count: { select: { members: true } } } } } });
  const open = await db.whatsappConversation.groupBy({ by: ["queueId"], where: { organizationId: ctx.organizationId, status: "OPEN", queueId: { not: null } }, _count: { _all: true } });
  const waiting = await db.whatsappConversation.groupBy({ by: ["queueId"], where: { organizationId: ctx.organizationId, status: "OPEN", assignedToId: null, queueId: { not: null } }, _count: { _all: true } });
  const o = new Map(open.map((r) => [r.queueId, r._count._all]));
  const w = new Map(waiting.map((r) => [r.queueId, r._count._all]));
  return rows.map((q) => ({ id: q.id, name: q.name, strategy: q.strategy as Strategy, isDefault: q.isDefault, active: q.active, team: q.team ? { id: q.team.id, name: q.team.name, members: q.team._count.members } : null, open: o.get(q.id) ?? 0, waiting: w.get(q.id) ?? 0 }));
}

export async function listTeamsForQueues(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  return db.workTeam.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export type QueueInput = { name: string; teamId?: string | null; strategy: Strategy; isDefault?: boolean; active?: boolean };

export async function saveQueue(ctx: TenantContext, id: string | null, i: QueueInput) {
  assertCan(ctx, "whatsapp:manage");
  const name = i.name.trim();
  if (name.length < 2 || name.length > 60) throw new ValidationError("Informe um nome de 2 a 60 caracteres.", { name: ["Nome da fila: de 2 a 60 caracteres."] });
  if (!(STRATEGIES as readonly string[]).includes(i.strategy)) throw new ValidationError("Forma de distribuição inválida.", { strategy: ["Escolha uma forma de distribuição."] });
  if (i.teamId) {
    const t = await db.workTeam.findFirst({ where: { id: i.teamId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!t) throw new ValidationError("Equipe não encontrada.", { teamId: ["Escolha uma equipe do escritório."] });
  }
  const active = i.active ?? true;
  const isDefault = (i.isDefault ?? false) && active;
  try {
    const q = await db.$transaction(async (tx) => {
      if (id) {
        const cur = await tx.whatsappQueue.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
        if (!cur) throw new NotFoundError("Fila não encontrada.");
      }
      if (isDefault) await tx.whatsappQueue.updateMany({ where: { organizationId: ctx.organizationId, isDefault: true, ...(id ? { id: { not: id } } : {}) }, data: { isDefault: false } });
      const data = { name, teamId: i.teamId || null, strategy: i.strategy, isDefault, active };
      return id ? tx.whatsappQueue.update({ where: { id }, data }) : tx.whatsappQueue.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId } });
    });
    await audit({ action: id ? "whatsapp.queue_update" : "whatsapp.queue_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_queue", resourceId: q.id, metadata: { strategy: q.strategy, teamId: q.teamId }, meta: ctx.meta });
    return { id: q.id };
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("Já existe uma fila com esse nome.", { name: ["Já existe uma fila com esse nome."] });
    throw e;
  }
}

export async function deleteQueue(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappQueue.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Fila não encontrada.");
  await audit({ action: "whatsapp.queue_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_queue", resourceId: id, meta: ctx.meta });
}

// ---------------- atendentes ----------------

export async function myAvailability(ctx: TenantContext): Promise<boolean> {
  assertCan(ctx, "whatsapp:read");
  const a = await db.whatsappAgent.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } }, select: { available: true } });
  return a?.available ?? true;
}

/** "Estou disponível" / "Em pausa". Ao voltar, assume o que estava esperando na fila. */
export async function setMyAvailability(ctx: TenantContext, available: boolean) {
  assertCan(ctx, "whatsapp:write");
  await db.whatsappAgent.upsert({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } }, create: { organizationId: ctx.organizationId, userId: ctx.userId, available }, update: { available } });
  await audit({ action: available ? "whatsapp.agent_available" : "whatsapp.agent_pause", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_agent", resourceId: ctx.userId, meta: ctx.meta });
  if (available) await distributeWaiting(ctx.organizationId).catch((e) => logger.warn("whatsapp.drain_failed", { error: e instanceof Error ? e.message : String(e) }));
}

export type AgentRow = { id: string; name: string; available: boolean; open: number };

export async function listAgents(ctx: TenantContext): Promise<AgentRow[]> {
  assertCan(ctx, "whatsapp:manage");
  const members = await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", user: { disabledAt: null }, role: { permissions: { has: "whatsapp:write" } } }, select: { user: { select: { id: true, name: true } } } });
  const ids = members.map((m) => m.user.id);
  const [av, open] = await Promise.all([
    db.whatsappAgent.findMany({ where: { organizationId: ctx.organizationId, userId: { in: ids } }, select: { userId: true, available: true } }),
    db.whatsappConversation.groupBy({ by: ["assignedToId"], where: { organizationId: ctx.organizationId, status: "OPEN", assignedToId: { in: ids } }, _count: { _all: true } }),
  ]);
  const a = new Map(av.map((r) => [r.userId, r.available]));
  const o = new Map(open.map((r) => [r.assignedToId, r._count._all]));
  return members.map((m) => ({ id: m.user.id, name: m.user.name, available: a.get(m.user.id) ?? true, open: o.get(m.user.id) ?? 0 })).sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
}

// ---------------- distribuição ----------------

type QueueRow = { id: string; name: string; teamId: string | null; strategy: string };

/** Escolhe o atendente da fila (ou null se ninguém puder receber agora). Exportado para testes. */
export async function pickAgent(organizationId: string, queue: QueueRow): Promise<{ id: string; name: string } | null> {
  if (queue.strategy === "MANUAL") return null;
  const teamIds = queue.teamId ? (await db.workTeamMember.findMany({ where: { teamId: queue.teamId, organizationId }, select: { userId: true } })).map((t) => t.userId) : null;
  const members = await db.membership.findMany({
    where: { organizationId, status: "ACTIVE", userId: teamIds ? { in: teamIds } : undefined, user: { disabledAt: null }, role: { permissions: { has: "whatsapp:write" } } },
    select: { user: { select: { id: true, name: true } } },
  });
  const ids = members.map((m) => m.user.id);
  if (ids.length === 0) return null;
  const paused = await db.whatsappAgent.findMany({ where: { organizationId, userId: { in: ids }, available: false }, select: { userId: true } });
  const off = new Set(paused.map((p) => p.userId));
  const cands = members.map((m) => m.user).filter((u) => !off.has(u.id));
  if (cands.length === 0) return null;
  const cid = cands.map((c) => c.id);
  const last = await db.whatsappConversation.groupBy({ by: ["assignedToId"], where: { organizationId, assignedToId: { in: cid } }, _max: { assignedAt: true } });
  const lastAt = new Map(last.map((r) => [r.assignedToId, r._max.assignedAt?.getTime() ?? 0]));
  let load = new Map<string, number>();
  if (queue.strategy === "LEAST_LOAD") {
    const open = await db.whatsappConversation.groupBy({ by: ["assignedToId"], where: { organizationId, status: "OPEN", assignedToId: { in: cid } }, _count: { _all: true } });
    load = new Map(open.map((r) => [r.assignedToId as string, r._count._all]));
  }
  cands.sort((a, b) => (queue.strategy === "LEAST_LOAD" ? (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) : 0) || (lastAt.get(a.id) ?? 0) - (lastAt.get(b.id) ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
  return cands[0]!;
}

async function queueFor(organizationId: string, queueId: string | null): Promise<QueueRow | null> {
  if (queueId) {
    const q = await db.whatsappQueue.findFirst({ where: { id: queueId, organizationId, active: true }, select: { id: true, name: true, teamId: true, strategy: true } });
    if (q) return q;
  }
  return db.whatsappQueue.findFirst({ where: { organizationId, isDefault: true, active: true }, select: { id: true, name: true, teamId: true, strategy: true } });
}

/**
 * Distribui UMA conversa. Sem `force`, mantém quem já está atendendo se ele estiver disponível.
 * Devolve o atendente escolhido (ou null: sem fila, fila manual ou ninguém disponível — a conversa espera na fila).
 */
export async function autoAssign(organizationId: string, conversationId: string, opts: { force?: boolean } = {}): Promise<{ id: string; name: string } | null> {
  const conv = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId }, select: { id: true, queueId: true, assignedToId: true, status: true } });
  if (!conv) return null;
  if (conv.assignedToId && !opts.force) {
    const cur = await db.whatsappAgent.findUnique({ where: { organizationId_userId: { organizationId, userId: conv.assignedToId } }, select: { available: true } });
    const stillThere = await db.membership.findFirst({ where: { organizationId, userId: conv.assignedToId, status: "ACTIVE", user: { disabledAt: null } }, select: { id: true } });
    if (stillThere && (cur?.available ?? true)) return null;
  }
  const queue = await queueFor(organizationId, conv.queueId);
  if (!queue) return null;
  const agent = await pickAgent(organizationId, queue);
  const now = new Date();
  // Condicional: se alguém atribuiu manualmente enquanto isso, não sobrescreve.
  const claimed = await db.whatsappConversation.updateMany({
    where: { id: conv.id, organizationId, assignedToId: conv.assignedToId },
    data: { queueId: queue.id, ...(agent ? { assignedToId: agent.id, assignedAt: now } : conv.assignedToId && !opts.force ? {} : { assignedToId: null }) },
  });
  if (claimed.count !== 1 || !agent) return null;
  await db.whatsappMessage.create({ data: { organizationId, conversationId: conv.id, direction: "NOTE", type: "text", body: `Distribuída automaticamente para ${agent.name} (fila ${queue.name}).`, status: "NOTE" } });
  await notify({ organizationId, userId: agent.id, kind: "chat.assigned", title: "Nova conversa para você", body: `Fila ${queue.name}.`, link: `/atendimento?c=${conv.id}`, dedupeKey: `chat.assigned:${conv.id}:${agent.id}:${now.getTime()}` }).catch(() => 0);
  return agent;
}

/** Distribui o que está esperando (abertas e sem responsável), da mais antiga para a mais nova. */
export async function distributeWaiting(organizationId: string, limit = 50): Promise<number> {
  const waiting = await db.whatsappConversation.findMany({ where: { organizationId, status: "OPEN", assignedToId: null, lastInboundAt: { not: null } }, orderBy: { lastInboundAt: "asc" }, take: limit, select: { id: true } });
  let n = 0;
  for (const c of waiting) if (await autoAssign(organizationId, c.id)) n++;
  return n;
}

export async function distributePending(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  const n = await distributeWaiting(ctx.organizationId);
  await audit({ action: "whatsapp.queue_distribute", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_queue", metadata: { assigned: n }, meta: ctx.meta });
  return { assigned: n };
}

/** Transfere a conversa para outra fila (e redistribui conforme a regra da fila) ou a tira de qualquer fila. */
export async function transferToQueue(ctx: TenantContext, conversationId: string, queueId: string | null) {
  assertCan(ctx, "whatsapp:write");
  const conv = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!conv) throw new NotFoundError("Conversa não encontrada.");
  if (!queueId) {
    await db.whatsappConversation.update({ where: { id: conversationId }, data: { queueId: null } });
    return { agent: null as string | null };
  }
  const q = await db.whatsappQueue.findFirst({ where: { id: queueId, organizationId: ctx.organizationId }, select: { id: true, name: true, active: true } });
  if (!q) throw new NotFoundError("Fila não encontrada.");
  if (!q.active) throw new ConflictError("Essa fila está desativada.");
  await db.whatsappConversation.update({ where: { id: conversationId }, data: { queueId: q.id, assignedToId: null, assignedAt: null } });
  await audit({ action: "whatsapp.transfer_queue", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, metadata: { queueId: q.id }, meta: ctx.meta });
  await db.whatsappMessage.create({ data: { organizationId: ctx.organizationId, conversationId, direction: "NOTE", type: "text", body: `Transferida para a fila ${q.name}.`, status: "NOTE", authorId: ctx.userId } });
  const agent = await autoAssign(ctx.organizationId, conversationId, { force: true });
  return { agent: agent?.name ?? null };
}
