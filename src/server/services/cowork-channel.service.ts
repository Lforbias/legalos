import { Prisma, type CoworkChannel, type CoworkChannelMember } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, can, type TenantContext } from "@/server/context";
import { appendMessageTx, directKeyOf } from "@/server/cowork/core";
import { publishInTx } from "@/server/cowork/realtime";
import { COWORK_DEPARTMENT_LABEL, isCoworkDepartment, type CoworkDepartment } from "@/modules/cowork/constants";
import { audit } from "./audit.service";
import { assertCoworkAccess, assertCoworkUsers, displayNames, getCoworkSettings } from "./cowork-access.service";
import { assertCoworkCaseVisible } from "./cowork-access.service";
import { isUniqueViolation } from "./db-errors";
import { resolveTenantContext } from "./tenant.service";

export const GENERAL_SLUG = "geral";

/**
 * Cria (idempotente) o espaço do escritório: canal Geral + canais departamentais configurados, e coloca a pessoa
 * no Geral e no canal do próprio departamento. Chamado ao abrir o Cowork; seguro sob concorrência (chaves únicas).
 */
export async function ensureWorkspace(ctx: TenantContext): Promise<void> {
  await assertCoworkAccess(ctx);
  const settings = await getCoworkSettings(ctx.organizationId);
  const wanted: { slug: string; name: string; department: CoworkDepartment | null; autoJoin: boolean; topic: string }[] = [
    { slug: GENERAL_SLUG, name: "Geral", department: null, autoJoin: true, topic: "Avisos e conversas de todo o escritório." },
    ...settings.defaultChannels.filter(isCoworkDepartment).map((d) => ({ slug: d, name: COWORK_DEPARTMENT_LABEL[d], department: d, autoJoin: false, topic: `Canal do departamento ${COWORK_DEPARTMENT_LABEL[d]}.` })),
  ];
  const existing = await db.coworkChannel.findMany({ where: { organizationId: ctx.organizationId, slug: { in: wanted.map((w) => w.slug) } }, select: { id: true, slug: true, autoJoin: true, department: true, archivedAt: true } });
  const missing = wanted.filter((w) => !existing.some((e) => e.slug === w.slug));
  if (missing.length) {
    await db.coworkChannel.createMany({
      data: missing.map((w) => ({ organizationId: ctx.organizationId, kind: "CHANNEL" as const, visibility: "PUBLIC" as const, name: w.name, slug: w.slug, department: w.department, autoJoin: w.autoJoin, topic: w.topic })),
      skipDuplicates: true,
    });
  }
  const channels = missing.length ? await db.coworkChannel.findMany({ where: { organizationId: ctx.organizationId, slug: { in: wanted.map((w) => w.slug) } }, select: { id: true, slug: true, autoJoin: true, department: true, archivedAt: true } }) : existing;
  const profile = await db.coworkMemberProfile.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } }, select: { department: true } });
  // Primeira visita sem departamento definido: entra em todos os canais padrão (pode sair depois).
  const firstVisit = !profile?.department && !(await db.coworkChannelMember.count({ where: { organizationId: ctx.organizationId, userId: ctx.userId } }));
  const join = channels.filter((c) => !c.archivedAt && (c.autoJoin || firstVisit || (profile?.department && c.department === profile.department)));
  if (join.length) {
    const already = await db.coworkChannelMember.findMany({ where: { userId: ctx.userId, channelId: { in: join.map((c) => c.id) } }, select: { channelId: true } });
    const toJoin = join.filter((c) => !already.some((a) => a.channelId === c.id));
    if (toJoin.length) {
      await db.coworkChannelMember.createMany({ data: toJoin.map((c) => ({ channelId: c.id, organizationId: ctx.organizationId, userId: ctx.userId })), skipDuplicates: true });
    }
  }
}

type ChannelWithMember = CoworkChannel & { member: CoworkChannelMember };

/**
 * Carrega um canal do qual a pessoa participa. Fora do escritório, sem participação ou (em salas de processo) sem
 * acesso ao processo, o resultado é sempre "não encontrado" — nunca revela que o canal existe.
 */
export async function loadChannelForMember(ctx: TenantContext, channelId: string, opts: { write?: boolean } = {}): Promise<ChannelWithMember> {
  await assertCoworkAccess(ctx);
  if (!z.uuid().safeParse(channelId).success) throw new NotFoundError("Conversa não encontrada.");
  const channel = await db.coworkChannel.findFirst({
    where: { id: channelId, organizationId: ctx.organizationId },
    include: { members: { where: { userId: ctx.userId }, take: 1 } },
  });
  const member = channel?.members[0];
  if (!channel || !member) throw new NotFoundError("Conversa não encontrada.");
  if (channel.caseId) {
    try {
      await assertCoworkCaseVisible(ctx, channel.caseId);
    } catch {
      throw new NotFoundError("Conversa não encontrada.");
    }
  }
  if (opts.write) {
    assertCan(ctx, "cowork:write");
    if (channel.archivedAt) throw new ConflictError("Esta conversa está arquivada: o histórico fica disponível só para leitura.");
  }
  const { members: _members, ...rest } = channel;
  void _members;
  return { ...rest, member };
}

/** Quem pode administrar participantes/arquivar um canal. Conversas diretas não têm administração. */
function canManageChannel(ctx: TenantContext, channel: CoworkChannel, member: CoworkChannelMember | null): boolean {
  if (channel.kind === "DIRECT") return false;
  if (member && (member.role === "OWNER" || member.role === "ADMIN")) return true;
  // Administradores do Cowork só gerenciam canais PÚBLICOS: canais privados e grupos não ficam abertos a eles por padrão.
  return channel.kind === "CHANNEL" && channel.visibility === "PUBLIC" && can(ctx, "cowork:members");
}

export type ChannelSummary = {
  id: string;
  kind: "CHANNEL" | "DIRECT" | "GROUP";
  visibility: "PUBLIC" | "PRIVATE";
  name: string;
  topic: string | null;
  department: string | null;
  caseId: string | null;
  isGeneral: boolean;
  archived: boolean;
  muted: boolean;
  lastSeq: number;
  lastReadSeq: number;
  lastMessageAt: string | null;
  unread: number;
  mentions: number;
  role: "OWNER" | "ADMIN" | "MEMBER";
  canManage: boolean;
  /** Conversa direta: a outra pessoa. */
  peerId: string | null;
  memberCount: number;
};

/** Conversas da pessoa (canais, diretas e grupos), com não lidas e menções calculadas no banco. */
export async function listMyChannels(ctx: TenantContext, opts: { includeArchived?: boolean } = {}): Promise<ChannelSummary[]> {
  await assertCoworkAccess(ctx);
  const rows = await db.coworkChannel.findMany({
    where: { organizationId: ctx.organizationId, members: { some: { userId: ctx.userId } }, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    include: { members: { select: { userId: true, role: true, lastReadSeq: true, mutedAt: true, channelId: true, organizationId: true, joinedAt: true } }, case: { select: { id: true } } },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: 500,
  });
  // Salas de processo: some da lista quem perdeu acesso ao processo (ex.: processo passou a sigiloso).
  const caseIds = [...new Set(rows.map((r) => r.caseId).filter((x): x is string => !!x))];
  const visibleCases = new Set<string>();
  for (const id of caseIds) {
    try {
      await assertCoworkCaseVisible(ctx, id);
      visibleCases.add(id);
    } catch {
      /* invisível */
    }
  }
  const channels = rows.filter((r) => !r.caseId || visibleCases.has(r.caseId));
  const ids = channels.map((c) => c.id);
  const counts = ids.length
    ? await db.$queryRaw<{ channel_id: string; unread: bigint; mentions: bigint }[]>`
        SELECT m.channel_id, count(*)::bigint AS unread,
               count(*) FILTER (WHERE ${ctx.userId}::uuid = ANY(m.mentioned_ids))::bigint AS mentions
          FROM cowork_messages m
          JOIN cowork_channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = ${ctx.userId}::uuid
         WHERE m.organization_id = ${ctx.organizationId}::uuid
           AND m.channel_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
           AND m.seq > cm.last_read_seq
           AND m.deleted_at IS NULL
           AND m.parent_id IS NULL
           AND (m.author_id IS DISTINCT FROM ${ctx.userId}::uuid)
         GROUP BY m.channel_id`
    : [];
  const countMap = new Map(counts.map((c) => [c.channel_id, c]));
  const peerIds = channels.filter((c) => c.kind === "DIRECT").map((c) => c.members.find((m) => m.userId !== ctx.userId)?.userId);
  const names = await displayNames(ctx.organizationId, [...peerIds, ...channels.filter((c) => c.kind === "GROUP" && !c.name).flatMap((c) => c.members.map((m) => m.userId))]);
  return channels.map((c) => {
    const me = c.members.find((m) => m.userId === ctx.userId)!;
    const peerId = c.kind === "DIRECT" ? (c.members.find((m) => m.userId !== ctx.userId)?.userId ?? null) : null;
    const cnt = countMap.get(c.id);
    const name = c.kind === "DIRECT" ? (peerId ? (names.get(peerId) ?? "Pessoa removida") : "Somente você") : c.name;
    return {
      id: c.id,
      kind: c.kind,
      visibility: c.visibility,
      name,
      topic: c.topic,
      department: c.department,
      caseId: c.caseId,
      isGeneral: c.slug === GENERAL_SLUG,
      archived: Boolean(c.archivedAt),
      muted: Boolean(me.mutedAt),
      lastSeq: c.lastSeq,
      lastReadSeq: me.lastReadSeq,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      unread: Number(cnt?.unread ?? 0),
      mentions: Number(cnt?.mentions ?? 0),
      role: me.role,
      canManage: canManageChannel(ctx, c, me as CoworkChannelMember),
      peerId,
      memberCount: c.members.length,
    };
  });
}

/** Total de não lidas (para o selo do menu). Barato: um único agregado. */
export async function coworkUnreadTotal(ctx: TenantContext): Promise<number> {
  if (!can(ctx, "cowork:read")) return 0;
  const [row] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n
      FROM cowork_messages m
      JOIN cowork_channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = ${ctx.userId}::uuid
      JOIN cowork_channels c ON c.id = m.channel_id AND c.archived_at IS NULL AND c.case_id IS NULL
     WHERE m.organization_id = ${ctx.organizationId}::uuid AND m.seq > cm.last_read_seq AND m.deleted_at IS NULL
       AND m.parent_id IS NULL AND cm.muted_at IS NULL AND (m.author_id IS DISTINCT FROM ${ctx.userId}::uuid)`;
  return Number(row?.n ?? 0);
}

/** Canais públicos do escritório em que a pessoa ainda não entrou (para "Explorar canais"). */
export async function listJoinableChannels(ctx: TenantContext) {
  await assertCoworkAccess(ctx);
  const rows = await db.coworkChannel.findMany({
    where: { organizationId: ctx.organizationId, kind: "CHANNEL", visibility: "PUBLIC", archivedAt: null, members: { none: { userId: ctx.userId } } },
    select: { id: true, name: true, topic: true, department: true, caseId: true, _count: { select: { members: true } } },
    orderBy: { name: "asc" },
    take: 200,
  });
  const out = [];
  for (const r of rows) {
    if (r.caseId) {
      try {
        await assertCoworkCaseVisible(ctx, r.caseId);
      } catch {
        continue;
      }
    }
    out.push({ id: r.id, name: r.name, topic: r.topic, department: r.department, caseId: r.caseId, memberCount: r._count.members });
  }
  return out;
}

export const createChannelSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome (mín. 2 caracteres).").max(60),
  topic: z.string().trim().max(200).optional().default(""),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  department: z.string().optional().nullable(),
  caseId: z.union([z.uuid(), z.literal("")]).optional().nullable(),
  memberIds: z.array(z.uuid()).max(200).optional().default([]),
});

/** Pessoas que podem ver um processo (sala de processo só admite quem enxerga o processo). */
async function assertUsersSeeCase(ctx: TenantContext, caseId: string, userIds: string[]) {
  for (const uid of userIds) {
    const other = uid === ctx.userId ? ctx : await resolveTenantContext(uid, ctx.organizationId);
    if (!other) throw new ValidationError("Participante inválido.");
    try {
      await assertCoworkCaseVisible(other, caseId);
    } catch {
      throw new ValidationError("Há participantes sem acesso a este processo (sigilo). Inclua apenas quem integra a equipe do processo.");
    }
  }
}

export async function createChannel(ctx: TenantContext, raw: z.input<typeof createChannelSchema>) {
  await assertCoworkAccess(ctx);
  assertCan(ctx, "cowork:channels");
  const input = createChannelSchema.parse(raw);
  const department = isCoworkDepartment(input.department) ? input.department : null;
  const caseId = input.caseId || null;
  const memberIds = [...new Set([ctx.userId, ...input.memberIds])];
  await assertCoworkUsers(ctx, memberIds);
  if (caseId) {
    assertCan(ctx, "cases:read");
    await assertCoworkCaseVisible(ctx, caseId);
    await assertUsersSeeCase(ctx, caseId, memberIds);
  }
  return db.$transaction(async (tx) => {
    const ch = await tx.coworkChannel.create({
      data: { organizationId: ctx.organizationId, kind: "CHANNEL", visibility: caseId ? "PRIVATE" : input.visibility, name: input.name, topic: input.topic || null, department, caseId, createdById: ctx.userId },
    });
    await tx.coworkChannelMember.createMany({ data: memberIds.map((uid) => ({ channelId: ch.id, organizationId: ctx.organizationId, userId: uid, role: uid === ctx.userId ? ("OWNER" as const) : ("MEMBER" as const) })) });
    await audit({ action: "cowork.channel.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_channel", resourceId: ch.id, metadata: { visibility: ch.visibility, department, caseLinked: Boolean(caseId), members: memberIds.length }, meta: ctx.meta }, tx);
    await publishInTx(tx, { o: ctx.organizationId, t: "membership", c: ch.id, u: memberIds });
    return ch;
  });
}

/** Abre (ou reaproveita) a conversa direta com outra pessoa. Nunca cria duas DMs entre as mesmas pessoas. */
export async function openDirect(ctx: TenantContext, otherUserId: string) {
  await assertCoworkAccess(ctx);
  assertCan(ctx, "cowork:write");
  const settings = await getCoworkSettings(ctx.organizationId);
  if (!settings.allowDirect) throw new ForbiddenError("As conversas diretas estão desativadas neste escritório.");
  if (!z.uuid().safeParse(otherUserId).success) throw new ValidationError("Pessoa inválida.");
  await assertCoworkUsers(ctx, [otherUserId]);
  const key = directKeyOf(ctx.userId, otherUserId);
  const found = await db.coworkChannel.findFirst({ where: { organizationId: ctx.organizationId, directKey: key }, select: { id: true } });
  if (found) return found;
  try {
    return await db.$transaction(async (tx) => {
      const ch = await tx.coworkChannel.create({ data: { organizationId: ctx.organizationId, kind: "DIRECT", visibility: "PRIVATE", name: "Conversa direta", directKey: key, createdById: ctx.userId } });
      const ids = [...new Set([ctx.userId, otherUserId])];
      await tx.coworkChannelMember.createMany({ data: ids.map((uid) => ({ channelId: ch.id, organizationId: ctx.organizationId, userId: uid, role: "MEMBER" as const })) });
      await publishInTx(tx, { o: ctx.organizationId, t: "membership", c: ch.id, u: ids });
      return { id: ch.id };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const again = await db.coworkChannel.findFirst({ where: { organizationId: ctx.organizationId, directKey: key }, select: { id: true } });
      if (again) return again;
    }
    throw err;
  }
}

export const createGroupSchema = z.object({ name: z.string().trim().max(60).optional().default(""), memberIds: z.array(z.uuid()).min(2, "Escolha pelo menos duas pessoas.").max(30) });

/** Grupo privado (conversa entre várias pessoas, sem ser um canal do escritório). */
export async function createGroup(ctx: TenantContext, raw: z.input<typeof createGroupSchema>) {
  await assertCoworkAccess(ctx);
  assertCan(ctx, "cowork:write");
  const input = createGroupSchema.parse(raw);
  const memberIds = [...new Set([ctx.userId, ...input.memberIds])];
  await assertCoworkUsers(ctx, memberIds);
  const names = await displayNames(ctx.organizationId, memberIds);
  const name = input.name || memberIds.filter((i) => i !== ctx.userId).map((i) => names.get(i)?.split(" ")[0] ?? "").join(", ").slice(0, 60);
  return db.$transaction(async (tx) => {
    const ch = await tx.coworkChannel.create({ data: { organizationId: ctx.organizationId, kind: "GROUP", visibility: "PRIVATE", name, createdById: ctx.userId } });
    await tx.coworkChannelMember.createMany({ data: memberIds.map((uid) => ({ channelId: ch.id, organizationId: ctx.organizationId, userId: uid, role: uid === ctx.userId ? ("OWNER" as const) : ("MEMBER" as const) })) });
    await audit({ action: "cowork.group.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_channel", resourceId: ch.id, metadata: { members: memberIds.length }, meta: ctx.meta }, tx);
    await publishInTx(tx, { o: ctx.organizationId, t: "membership", c: ch.id, u: memberIds });
    return ch;
  });
}

export async function joinChannel(ctx: TenantContext, channelId: string) {
  await assertCoworkAccess(ctx);
  assertCan(ctx, "cowork:write");
  const ch = await db.coworkChannel.findFirst({ where: { id: channelId, organizationId: ctx.organizationId, kind: "CHANNEL", visibility: "PUBLIC", archivedAt: null } });
  if (!ch) throw new NotFoundError("Canal não encontrado.");
  if (ch.caseId) await assertCoworkCaseVisible(ctx, ch.caseId);
  await db.$transaction(async (tx) => {
    const res = await tx.coworkChannelMember.createMany({ data: [{ channelId, organizationId: ctx.organizationId, userId: ctx.userId, lastReadSeq: Math.max(0, ch.lastSeq - 20) }], skipDuplicates: true });
    if (res.count) {
      const names = await displayNames(ctx.organizationId, [ctx.userId]);
      await appendMessageTx(tx, { organizationId: ctx.organizationId, channelId, authorId: null, authorKind: "SYSTEM", body: `${names.get(ctx.userId) ?? "Uma pessoa"} entrou no canal.` });
      await publishInTx(tx, { o: ctx.organizationId, t: "membership", c: channelId, u: [ctx.userId] });
    }
  });
}

export async function leaveChannel(ctx: TenantContext, channelId: string) {
  const ch = await loadChannelForMember(ctx, channelId);
  if (ch.kind === "DIRECT") throw new ValidationError("Conversas diretas não podem ser abandonadas; silencie se preferir.");
  if (ch.autoJoin) throw new ValidationError("Todas as pessoas participam do canal Geral; silencie se preferir.");
  await db.$transaction(async (tx) => {
    if (ch.member.role === "OWNER") {
      const others = await tx.coworkChannelMember.count({ where: { channelId, userId: { not: ctx.userId }, role: { in: ["OWNER", "ADMIN"] } } });
      if (!others && ch.visibility === "PRIVATE") {
        const next = await tx.coworkChannelMember.findFirst({ where: { channelId, userId: { not: ctx.userId } }, orderBy: { joinedAt: "asc" } });
        if (next) await tx.coworkChannelMember.update({ where: { channelId_userId: { channelId, userId: next.userId } }, data: { role: "OWNER" } });
      }
    }
    await tx.coworkChannelMember.delete({ where: { channelId_userId: { channelId, userId: ctx.userId } } });
    const names = await displayNames(ctx.organizationId, [ctx.userId]);
    await appendMessageTx(tx, { organizationId: ctx.organizationId, channelId, authorId: null, authorKind: "SYSTEM", body: `${names.get(ctx.userId) ?? "Uma pessoa"} saiu da conversa.` });
    await publishInTx(tx, { o: ctx.organizationId, t: "membership", c: channelId, u: [ctx.userId] });
  });
}

async function loadForManage(ctx: TenantContext, channelId: string) {
  await assertCoworkAccess(ctx);
  const ch = await db.coworkChannel.findFirst({ where: { id: channelId, organizationId: ctx.organizationId }, include: { members: { where: { userId: ctx.userId } } } });
  if (!ch) throw new NotFoundError("Conversa não encontrada.");
  const member = ch.members[0] ?? null;
  // Sem participação, só administradores do Cowork veem canais públicos; o restante é "não encontrado".
  if (!member && !(ch.kind === "CHANNEL" && ch.visibility === "PUBLIC" && can(ctx, "cowork:members"))) throw new NotFoundError("Conversa não encontrada.");
  if (ch.caseId) await assertCoworkCaseVisible(ctx, ch.caseId).catch(() => { throw new NotFoundError("Conversa não encontrada."); });
  if (!canManageChannel(ctx, ch, member)) throw new ForbiddenError("Você não administra esta conversa.");
  return ch;
}

export async function addChannelMembers(ctx: TenantContext, channelId: string, userIds: string[]) {
  const ch = await loadForManage(ctx, channelId);
  if (ch.archivedAt) throw new ConflictError("Conversa arquivada.");
  const ids = [...new Set(userIds)].filter((x) => z.uuid().safeParse(x).success);
  if (!ids.length) return;
  await assertCoworkUsers(ctx, ids);
  if (ch.caseId) await assertUsersSeeCase(ctx, ch.caseId, ids);
  await db.$transaction(async (tx) => {
    const res = await tx.coworkChannelMember.createMany({ data: ids.map((uid) => ({ channelId, organizationId: ctx.organizationId, userId: uid })), skipDuplicates: true });
    if (res.count) {
      const names = await displayNames(ctx.organizationId, [ctx.userId, ...ids]);
      await appendMessageTx(tx, { organizationId: ctx.organizationId, channelId, authorId: null, authorKind: "SYSTEM", body: `${names.get(ctx.userId) ?? "Alguém"} adicionou ${ids.map((i) => names.get(i) ?? "uma pessoa").join(", ")}.` });
    }
    await audit({ action: "cowork.channel.members.add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_channel", resourceId: channelId, metadata: { added: ids.length }, meta: ctx.meta }, tx);
    await publishInTx(tx, { o: ctx.organizationId, t: "membership", c: channelId, u: ids });
  });
}

export async function removeChannelMember(ctx: TenantContext, channelId: string, userId: string) {
  const ch = await loadForManage(ctx, channelId);
  if (ch.autoJoin) throw new ValidationError("Todas as pessoas participam do canal Geral.");
  await db.$transaction(async (tx) => {
    const res = await tx.coworkChannelMember.deleteMany({ where: { channelId, userId, organizationId: ctx.organizationId } });
    if (!res.count) throw new NotFoundError("Participante não encontrado.");
    const names = await displayNames(ctx.organizationId, [ctx.userId, userId]);
    await appendMessageTx(tx, { organizationId: ctx.organizationId, channelId, authorId: null, authorKind: "SYSTEM", body: `${names.get(ctx.userId) ?? "Alguém"} removeu ${names.get(userId) ?? "uma pessoa"}.` });
    await audit({ action: "cowork.channel.members.remove", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_channel", resourceId: channelId, metadata: { removedUserId: userId }, meta: ctx.meta }, tx);
    await publishInTx(tx, { o: ctx.organizationId, t: "membership", c: channelId, u: [userId] });
  });
}

export async function setChannelArchived(ctx: TenantContext, channelId: string, archived: boolean) {
  const ch = await loadForManage(ctx, channelId);
  if (ch.slug === GENERAL_SLUG) throw new ValidationError("O canal Geral não pode ser arquivado.");
  await db.$transaction(async (tx) => {
    await tx.coworkChannel.update({ where: { id: channelId }, data: archived ? { archivedAt: new Date(), archivedById: ctx.userId } : { archivedAt: null, archivedById: null } });
    await audit({ action: archived ? "cowork.channel.archive" : "cowork.channel.unarchive", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_channel", resourceId: channelId, meta: ctx.meta }, tx);
    await publishInTx(tx, { o: ctx.organizationId, t: "channel", c: channelId });
  });
}

export async function updateChannel(ctx: TenantContext, channelId: string, raw: { name?: string; topic?: string }) {
  const ch = await loadForManage(ctx, channelId);
  const name = raw.name?.trim();
  if (name !== undefined && (name.length < 2 || name.length > 60)) throw new ValidationError("Nome entre 2 e 60 caracteres.");
  await db.$transaction(async (tx) => {
    await tx.coworkChannel.update({ where: { id: channelId }, data: { ...(name && ch.slug === null ? { name } : {}), ...(raw.topic !== undefined ? { topic: raw.topic.trim().slice(0, 200) || null } : {}) } });
    await publishInTx(tx, { o: ctx.organizationId, t: "channel", c: channelId });
  });
}

export async function setMuted(ctx: TenantContext, channelId: string, muted: boolean) {
  await loadChannelForMember(ctx, channelId);
  await db.coworkChannelMember.update({ where: { channelId_userId: { channelId, userId: ctx.userId } }, data: { mutedAt: muted ? new Date() : null } });
}

/** Marca como lido até `seq` (nunca retrocede). */
export async function markRead(ctx: TenantContext, channelId: string, seq: number) {
  const ch = await loadChannelForMember(ctx, channelId);
  const target = Math.min(Math.max(0, Math.floor(seq)), ch.lastSeq);
  if (target <= ch.member.lastReadSeq) return;
  await db.$transaction(async (tx) => {
    await tx.coworkChannelMember.updateMany({ where: { channelId, userId: ctx.userId, lastReadSeq: { lt: target } }, data: { lastReadSeq: target } });
    await publishInTx(tx, { o: ctx.organizationId, t: "read", c: channelId, u: [ctx.userId] });
  });
}

/** Participantes de uma conversa (só para quem participa dela). */
export async function listChannelMembers(ctx: TenantContext, channelId: string) {
  await loadChannelForMember(ctx, channelId);
  const rows = await db.coworkChannelMember.findMany({ where: { channelId, organizationId: ctx.organizationId }, select: { userId: true, role: true, joinedAt: true } });
  const names = await displayNames(ctx.organizationId, rows.map((r) => r.userId));
  return rows.map((r) => ({ userId: r.userId, role: r.role, name: names.get(r.userId) ?? "Pessoa removida" })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Canal ligado a processo: devolve o existente se já houver um para o processo e a pessoa participar. */
export async function findCaseChannels(ctx: TenantContext, caseId: string) {
  await assertCoworkAccess(ctx);
  await assertCoworkCaseVisible(ctx, caseId);
  return db.coworkChannel.findMany({ where: { organizationId: ctx.organizationId, caseId, archivedAt: null, members: { some: { userId: ctx.userId } } }, select: { id: true, name: true } });
}

export function isChannelManager(ctx: TenantContext, channel: CoworkChannel, member: CoworkChannelMember | null) {
  return canManageChannel(ctx, channel, member);
}

export type { Tx };
