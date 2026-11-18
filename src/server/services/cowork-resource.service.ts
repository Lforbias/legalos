import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { formatYmd } from "@/lib/dates/ymd";
import { utcToZoned } from "@/lib/dates/zoned";
import { ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { can, type TenantContext } from "@/server/context";
import { CASE_NATURE_LABEL } from "@/modules/cases/schemas";
import { RESOURCE_KIND_LABEL, RESOURCE_KINDS, type ResourceKind } from "@/modules/cowork/constants";
import { caseVisibility } from "./case.service";
import { documentVisibilityWhere } from "./document.service";
import { taskVisibility } from "./task.service";

/**
 * Cartões de recursos compartilhados no Cowork.
 *
 * O banco guarda só (tipo, id). Na leitura, cada cartão é resolvido com a permissão de QUEM ESTÁ LENDO, usando as
 * mesmas regras de visibilidade dos módulos originais (sigilo de processo, permissões de clientes, documentos,
 * tarefas e agenda). Sem acesso, o cartão vira "conteúdo restrito" sem título, número, nome ou data.
 */
export type ResourceCard =
  | { kind: ResourceKind; id: string; accessible: true; label: string; title: string; subtitle: string | null; href: string }
  | { kind: ResourceKind; id: string; accessible: false; label: string };

const TASK_STATUS: Record<string, string> = { TODO: "A fazer", IN_PROGRESS: "Em andamento", WAITING: "Aguardando", DONE: "Concluída", CANCELED: "Cancelada" };

const caseWhere = (ctx: TenantContext): Prisma.CaseWhereInput => ({ AND: [{ organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] });

/** Resolve um lote de cartões. Ordem e quantidade de saída = entrada. */
export async function resolveCards(ctx: TenantContext, refs: { kind: ResourceKind; resourceId: string }[]): Promise<ResourceCard[]> {
  const by = (k: ResourceKind) => [...new Set(refs.filter((r) => r.kind === k).map((r) => r.resourceId))];
  const org = ctx.organizationId;
  const found = new Map<string, Omit<Extract<ResourceCard, { accessible: true }>, "kind" | "id" | "accessible" | "label">>();
  const key = (k: ResourceKind, id: string) => `${k}:${id}`;

  const clientIds = [...new Set([...by("CLIENT"), ...by("FOLDER")])];
  if (clientIds.length && can(ctx, "clients:read")) {
    const rows = await db.client.findMany({ where: { id: { in: clientIds }, organizationId: org, deletedAt: null }, select: { id: true, name: true, type: true } });
    for (const r of rows) {
      found.set(key("CLIENT", r.id), { title: r.name, subtitle: r.type === "COMPANY" ? "Pessoa jurídica" : "Pessoa física", href: `/clientes/${r.id}` });
      found.set(key("FOLDER", r.id), { title: `Pasta de ${r.name}`, subtitle: "Área de Trabalho", href: `/area-de-trabalho/${r.id}` });
    }
  }
  const caseIds = by("CASE");
  if (caseIds.length && can(ctx, "cases:read")) {
    const rows = await db.case.findMany({ where: { AND: [caseWhere(ctx), { id: { in: caseIds } }] }, select: { id: true, title: true, number: true, nature: true } });
    for (const r of rows) found.set(key("CASE", r.id), { title: r.title, subtitle: [CASE_NATURE_LABEL[r.nature as keyof typeof CASE_NATURE_LABEL] ?? "Processo", r.number].filter(Boolean).join(" · "), href: `/processos/${r.id}` });
  }
  const docIds = by("DOCUMENT");
  if (docIds.length && can(ctx, "documents:read")) {
    const base = documentVisibilityWhere(ctx);
    if (base) {
      const rows = await db.document.findMany({ where: { AND: [base, { id: { in: docIds } }] }, select: { id: true, name: true, category: true } });
      for (const r of rows) found.set(key("DOCUMENT", r.id), { title: r.name, subtitle: r.category, href: `/documentos/${r.id}` });
    }
  }
  const taskIds = by("TASK");
  if (taskIds.length && can(ctx, "tasks:read")) {
    const rows = await db.task.findMany({ where: { AND: [{ id: { in: taskIds }, organizationId: org, deletedAt: null }, taskVisibility(ctx)] }, select: { id: true, title: true, status: true, dueDate: true } });
    for (const r of rows) found.set(key("TASK", r.id), { title: r.title, subtitle: [TASK_STATUS[r.status], r.dueDate ? `prazo ${formatYmd(r.dueDate.toISOString().slice(0, 10))}` : null].filter(Boolean).join(" · "), href: `/tarefas/${r.id}` });
  }
  const deadlineIds = by("DEADLINE");
  if (deadlineIds.length && can(ctx, "deadlines:read")) {
    const rows = await db.deadline.findMany({ where: { id: { in: deadlineIds }, organizationId: org, case: caseWhere(ctx) }, select: { id: true, title: true, dueDate: true } });
    for (const r of rows) found.set(key("DEADLINE", r.id), { title: r.title, subtitle: `vence ${formatYmd(r.dueDate.toISOString().slice(0, 10))}`, href: `/prazos/${r.id}` });
  }
  const eventIds = by("EVENT");
  if (eventIds.length && (can(ctx, "deadlines:read") || can(ctx, "tasks:read"))) {
    const rows = await db.agendaEvent.findMany({ where: { AND: [{ id: { in: eventIds }, organizationId: org, deletedAt: null }, { OR: [{ caseId: null }, { case: caseWhere(ctx) }] }] }, select: { id: true, title: true, startsAt: true, allDay: true } });
    for (const r of rows) {
      const z = utcToZoned(r.startsAt, ctx.timezone);
      found.set(key("EVENT", r.id), { title: r.title, subtitle: `${formatYmd(z.ymd)}${r.allDay ? "" : ` às ${z.hhmm}`}`, href: `/agenda/${r.id}` });
    }
  }
  const meetingIds = by("MEETING");
  if (meetingIds.length && can(ctx, "cowork:read")) {
    const rows = await db.coworkMeeting.findMany({
      where: { id: { in: meetingIds }, organizationId: org, OR: [{ participants: { some: { userId: ctx.userId } } }, { channel: { members: { some: { userId: ctx.userId } } } }] },
      select: { id: true, title: true, startsAt: true, caseId: true },
    });
    for (const r of rows) {
      if (r.caseId && !(await db.case.count({ where: { AND: [caseWhere(ctx), { id: r.caseId }] } }))) continue;
      const z = utcToZoned(r.startsAt, ctx.timezone);
      found.set(key("MEETING", r.id), { title: r.title, subtitle: `${formatYmd(z.ymd)} às ${z.hhmm}`, href: `/cowork/reunioes/${r.id}` });
    }
  }
  return refs.map((r) => {
    const f = found.get(key(r.kind, r.resourceId));
    return f ? { kind: r.kind, id: r.resourceId, accessible: true as const, label: RESOURCE_KIND_LABEL[r.kind], ...f } : { kind: r.kind, id: r.resourceId, accessible: false as const, label: RESOURCE_KIND_LABEL[r.kind] };
  });
}

/** Quem compartilha precisa ter acesso ao recurso: não se compartilha o que não se vê. */
export async function assertCanShare(ctx: TenantContext, refs: { kind: ResourceKind; resourceId: string }[]): Promise<void> {
  if (!refs.length) return;
  if (!can(ctx, "cowork:share")) throw new ForbiddenError("Você não tem permissão para compartilhar recursos no Cowork.");
  if (refs.length > 10) throw new ValidationError("Compartilhe no máximo 10 itens por mensagem.");
  for (const r of refs) if (!(RESOURCE_KINDS as readonly string[]).includes(r.kind)) throw new ValidationError("Tipo de recurso inválido.");
  const cards = await resolveCards(ctx, refs);
  if (cards.some((c) => !c.accessible)) throw new ValidationError("Um dos itens não foi encontrado ou você não tem acesso a ele.");
}

export type ResourceSearchHit = { kind: ResourceKind; id: string; title: string; subtitle: string | null };

/** Busca de recursos para compartilhar — só devolve o que a pessoa pode ver. */
export async function searchShareable(ctx: TenantContext, kind: ResourceKind, q: string): Promise<ResourceSearchHit[]> {
  if (!can(ctx, "cowork:share")) return [];
  const term = q.trim().slice(0, 80);
  const contains = term ? { contains: term, mode: "insensitive" as const } : undefined;
  const org = ctx.organizationId;
  switch (kind) {
    case "CLIENT":
    case "FOLDER": {
      if (!can(ctx, "clients:read")) return [];
      const rows = await db.client.findMany({ where: { organizationId: org, deletedAt: null, ...(contains ? { name: contains } : {}) }, orderBy: { name: "asc" }, take: 8, select: { id: true, name: true } });
      return rows.map((r) => ({ kind, id: r.id, title: kind === "FOLDER" ? `Pasta de ${r.name}` : r.name, subtitle: null }));
    }
    case "CASE": {
      if (!can(ctx, "cases:read")) return [];
      const rows = await db.case.findMany({ where: { AND: [caseWhere(ctx), ...(contains ? [{ OR: [{ title: contains }, { number: contains }] }] : [])] }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, title: true, number: true } });
      return rows.map((r) => ({ kind, id: r.id, title: r.title, subtitle: r.number }));
    }
    case "DOCUMENT": {
      const base = can(ctx, "documents:read") ? documentVisibilityWhere(ctx) : null;
      if (!base) return [];
      const rows = await db.document.findMany({ where: { AND: [base, ...(contains ? [{ name: contains }] : [])] }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, name: true, category: true } });
      return rows.map((r) => ({ kind, id: r.id, title: r.name, subtitle: r.category }));
    }
    case "TASK": {
      if (!can(ctx, "tasks:read")) return [];
      const rows = await db.task.findMany({ where: { AND: [{ organizationId: org, deletedAt: null }, taskVisibility(ctx), ...(contains ? [{ title: contains }] : [])] }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, title: true, status: true } });
      return rows.map((r) => ({ kind, id: r.id, title: r.title, subtitle: TASK_STATUS[r.status] ?? null }));
    }
    case "DEADLINE": {
      if (!can(ctx, "deadlines:read")) return [];
      const rows = await db.deadline.findMany({ where: { organizationId: org, case: caseWhere(ctx), status: { in: ["DRAFT", "VALIDATED"] }, ...(contains ? { title: contains } : {}) }, orderBy: { dueDate: "asc" }, take: 8, select: { id: true, title: true, dueDate: true } });
      return rows.map((r) => ({ kind, id: r.id, title: r.title, subtitle: formatYmd(r.dueDate.toISOString().slice(0, 10)) }));
    }
    case "EVENT": {
      if (!can(ctx, "deadlines:read") && !can(ctx, "tasks:read")) return [];
      const rows = await db.agendaEvent.findMany({ where: { AND: [{ organizationId: org, deletedAt: null }, { OR: [{ caseId: null }, { case: caseWhere(ctx) }] }, ...(contains ? [{ title: contains }] : [])] }, orderBy: { startsAt: "desc" }, take: 8, select: { id: true, title: true, startsAt: true } });
      return rows.map((r) => ({ kind, id: r.id, title: r.title, subtitle: formatYmd(utcToZoned(r.startsAt, ctx.timezone).ymd) }));
    }
    case "MEETING": {
      const rows = await db.coworkMeeting.findMany({ where: { organizationId: org, participants: { some: { userId: ctx.userId } }, ...(contains ? { title: contains } : {}) }, orderBy: { startsAt: "desc" }, take: 8, select: { id: true, title: true, startsAt: true } });
      return rows.map((r) => ({ kind, id: r.id, title: r.title, subtitle: formatYmd(utcToZoned(r.startsAt, ctx.timezone).ymd) }));
    }
  }
}
