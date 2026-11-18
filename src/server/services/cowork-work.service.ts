import { z } from "zod";
import { db } from "@/lib/db/client";
import { isYmd } from "@/lib/dates/ymd";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, can, type TenantContext } from "@/server/context";
import { appendMessageTx } from "@/server/cowork/core";
import { WORK_PURPOSES, WORK_PURPOSE_LABEL, type WorkPurpose } from "@/modules/cowork/constants";
import { createEvent } from "./agenda.service";
import { audit } from "./audit.service";
import { displayNames } from "./cowork-access.service";
import { loadChannelForMember } from "./cowork-channel.service";
import { createTask } from "./task.service";
import { isUniqueViolation } from "./db-errors";

/**
 * Mensagem → trabalho. Reaproveita os serviços originais (tarefas e agenda): responsável, prazo, situação, processo,
 * cliente e histórico ficam no registro original. O Cowork guarda apenas o vínculo (origem da conversa) e avisa na thread.
 */
export const convertSchema = z
  .object({
    purpose: z.enum(WORK_PURPOSES),
    title: z.string().trim().min(3, "Informe um título (mín. 3 caracteres).").max(200),
    description: z.string().trim().max(4000).optional().default(""),
    assigneeId: z.union([z.uuid(), z.literal("")]).optional().default(""),
    dueDate: z.string().optional().default("").refine((v) => v === "" || isYmd(v), "Data inválida."),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional().default("NORMAL"),
    caseId: z.union([z.uuid(), z.literal("")]).optional().default(""),
    clientId: z.union([z.uuid(), z.literal("")]).optional().default(""),
    /** Só para compromisso: horário. */
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")).optional().default(""),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")).optional().default(""),
    requestKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  })
  .superRefine((v, ctx) => {
    if (v.purpose === "APPOINTMENT" && !v.dueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Informe a data do compromisso." });
  });
export type ConvertInput = z.input<typeof convertSchema>;

const TASK_STATUS_BY_PURPOSE: Record<WorkPurpose, "TODO" | "WAITING"> = { TASK: "TODO", ACTIVITY: "TODO", FORWARD: "TODO", APPOINTMENT: "TODO", REVIEW: "TODO", PENDING: "WAITING" };
const TITLE_PREFIX: Partial<Record<WorkPurpose, string>> = { FORWARD: "Encaminhamento", REVIEW: "Revisão", PENDING: "Pendência" };

type Origin = { kind: "message"; messageId: string } | { kind: "meeting"; meetingId: string };

/** Cria o trabalho no módulo original e registra o vínculo. Idempotente por `requestKey`. */
export async function createWorkFromOrigin(ctx: TenantContext, origin: Origin, raw: ConvertInput, context: { channelId: string | null; department: string | null; originLink: string; originLabel: string; threadRootId: string | null }) {
  const input = convertSchema.parse(raw);
  const dup = await db.coworkWorkItem.findUnique({ where: { organizationId_requestKey: { organizationId: ctx.organizationId, requestKey: input.requestKey } } });
  if (dup) return dup;
  if (input.purpose === "APPOINTMENT") {
    if (!can(ctx, "deadlines:write") && !can(ctx, "tasks:write")) assertCan(ctx, "deadlines:write");
  } else assertCan(ctx, "tasks:write");
  // Reserva a chave ANTES de criar no módulo original: pedidos simultâneos com a mesma chave não geram duas tarefas.
  let claim;
  try {
    claim = await db.coworkWorkItem.create({
      data: { organizationId: ctx.organizationId, purpose: input.purpose, channelId: context.channelId, messageId: origin.kind === "message" ? origin.messageId : null, meetingId: origin.kind === "meeting" ? origin.meetingId : null, department: context.department, createdById: ctx.userId, requestKey: input.requestKey },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await db.coworkWorkItem.findUnique({ where: { organizationId_requestKey: { organizationId: ctx.organizationId, requestKey: input.requestKey } } });
      if (existing) return existing;
    }
    throw err;
  }
  const prefix = TITLE_PREFIX[input.purpose];
  const title = prefix && !input.title.toLowerCase().startsWith(prefix.toLowerCase()) ? `${prefix}: ${input.title}`.slice(0, 200) : input.title;
  const description = [input.description, `Origem: ${context.originLabel} no Cowork (${context.originLink}).`].filter(Boolean).join("\n\n").slice(0, 4000);
  let taskId: string | null = null;
  let agendaEventId: string | null = null;
  try {
  if (input.purpose === "APPOINTMENT") {
    const e = await createEvent(ctx, { title, kind: "OTHER", date: input.dueDate, allDay: !input.startTime, startTime: input.startTime, endTime: input.endTime, location: "", description, caseId: input.caseId, clientId: input.clientId, assigneeId: input.assigneeId });
    agendaEventId = e.id;
  } else {
    const t = await createTask(ctx, { title, description, status: TASK_STATUS_BY_PURPOSE[input.purpose], priority: input.priority, dueDate: input.dueDate, assigneeId: input.assigneeId, caseId: input.caseId, clientId: input.clientId });
    taskId = t.id;
  }
  } catch (err) {
    await db.coworkWorkItem.delete({ where: { id: claim.id } }).catch(() => undefined);
    throw err;
  }
  return db.$transaction(async (tx) => {
    const item = await tx.coworkWorkItem.update({ where: { id: claim.id }, data: { taskId, agendaEventId } });
    await audit({ action: "cowork.work.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: taskId ? "task" : "agenda_event", resourceId: (taskId ?? agendaEventId)!, metadata: { purpose: input.purpose, origin: origin.kind, workItemId: item.id }, meta: ctx.meta }, tx);
    if (context.channelId) {
      const names = await displayNames(ctx.organizationId, [ctx.userId]);
      await appendMessageTx(tx, {
        organizationId: ctx.organizationId,
        channelId: context.channelId,
        authorId: null,
        authorKind: "SYSTEM",
        parentId: context.threadRootId,
        body: `${names.get(ctx.userId) ?? "Alguém"} criou ${WORK_PURPOSE_LABEL[input.purpose].toLowerCase()} a partir ${origin.kind === "message" ? "desta mensagem" : "da reunião"}.`,
        resources: [taskId ? { kind: "TASK" as const, resourceId: taskId } : { kind: "EVENT" as const, resourceId: agendaEventId! }],
      });
    }
    return item;
  });
}

export async function convertMessage(ctx: TenantContext, messageId: string, raw: ConvertInput) {
  if (!z.uuid().safeParse(messageId).success) throw new NotFoundError("Mensagem não encontrada.");
  const m = await db.coworkMessage.findFirst({ where: { id: messageId, organizationId: ctx.organizationId }, select: { id: true, channelId: true, parentId: true, deletedAt: true, authorKind: true } });
  if (!m) throw new NotFoundError("Mensagem não encontrada.");
  const ch = await loadChannelForMember(ctx, m.channelId, { write: true }).catch((err) => {
    if (err instanceof ConflictError) throw err;
    throw new NotFoundError("Mensagem não encontrada.");
  });
  if (m.deletedAt) throw new ValidationError("Mensagem excluída.");
  const where = ch.kind === "DIRECT" ? "conversa direta" : ch.kind === "GROUP" ? `grupo ${ch.name}` : `canal #${ch.name}`;
  return createWorkFromOrigin(ctx, { kind: "message", messageId }, raw, {
    channelId: ch.id,
    department: ch.department,
    originLink: `/cowork?c=${ch.id}&m=${m.id}`,
    originLabel: `mensagem em ${where}`,
    threadRootId: m.parentId ?? m.id,
  });
}
