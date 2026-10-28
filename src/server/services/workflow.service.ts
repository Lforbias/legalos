import { matchesConditions, EMPTY_CONDITIONS } from "@/modules/workflows/conditions";
import { bulkUpdateNotices } from "./notice-bulk.service";
import { normalizeTags } from "./inbox-flow.service";
import { getNotice } from "./notice.service";
import { db, type Tx } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { addDays, ymdToDate } from "@/lib/dates/ymd";
import { ruleSchema, type WorkflowTriggerKey } from "@/modules/workflows/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, logCaseEvent } from "./case.service";
import { notify } from "./notification.service";

export type WorkflowSource = {
  type: string;
  id: string;
  /** Quem executou a ação que disparou a regra. */
  userId: string;
  /** Texto substituído em {{gatilho}}. */
  label: string;
  /** Data (YYYY-MM-DD) a partir da qual o prazo da tarefa é contado. */
  baseDate: string;
  caseId?: string | null;
  clientId?: string | null;
  noticeId?: string | null;
};

/**
 * Executa as regras ativas do gatilho. É "melhor esforço": NUNCA lança erro e nunca desfaz a ação original.
 * Idempotente: (regra, origem) é único — repetir o gatilho não duplica tarefas. A tarefa é criada como o sistema
 * (sem exigir `tasks:write` de quem disparou) e registrada em `workflow_runs` (criada, ignorada ou falha).
 */
export async function runWorkflows(ctx: TenantContext, trigger: WorkflowTriggerKey, src: WorkflowSource): Promise<number> {
  let created = 0;
  try {
    if (src.userId !== ctx.userId) throw new ValidationError("Origem da automação inválida.");
    if (src.caseId) await assertCaseVisible(ctx, src.caseId);
    if (src.clientId && !await db.client.findFirst({ where: { id: src.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } })) throw new NotFoundError("Cliente não encontrado.");
    const rules = await db.workflowRule.findMany({ where: { organizationId: ctx.organizationId, trigger, active: true, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 20 });
    for (const rule of rules) {
      try {
        const result = await db.$transaction(async tx => {
          const claim = await tx.workflowRun.createMany({
            data: [{ organizationId: ctx.organizationId, ruleId: rule.id, sourceType: src.type, sourceId: src.id, status: "SKIPPED" as const, message: "Em execução" }],
            skipDuplicates: true,
          });
          if (claim.count === 0) {
            const retry = await tx.workflowRun.updateMany({ where: { organizationId: ctx.organizationId, ruleId: rule.id, sourceType: src.type, sourceId: src.id, status: "FAILED" }, data: { status: "SKIPPED", message: "Em execução" } });
            if (retry.count === 0) return null;
          }
          const result = await executeRule(ctx, rule, src, tx);
          await tx.workflowRun.updateMany({
            where: { organizationId: ctx.organizationId, ruleId: rule.id, sourceType: src.type, sourceId: src.id },
            data: { status: result.taskId ? "CREATED" : "SKIPPED", taskId: result.taskId, message: result.message },
          });
          return result;
        }, { timeout: 15000 });
        if (result?.taskId) created++;
        // A falha de notificação nunca transforma uma tarefa já confirmada em execução falha.
        if (result?.notification) await notify(result.notification).catch(err => logger.error("workflow.notification_failed", { ruleId: rule.id, error: err instanceof Error ? err.message : String(err) }));
      } catch (err) {
        logger.error("workflow.rule_failed", { ruleId: rule.id, error: err instanceof Error ? err.message : String(err) });
        // O rollback remove também a reserva. Uma próxima chamada pode tentar novamente.
        await db.workflowRun.createMany({ data: [{ organizationId: ctx.organizationId, ruleId: rule.id, sourceType: src.type, sourceId: src.id, status: "FAILED", message: "Falha ao criar a tarefa. Uma nova execução pode tentar novamente." }], skipDuplicates: true }).catch(() => undefined);
      }
    }
  } catch (err) {
    logger.error("workflow.run_failed", { trigger, error: err instanceof Error ? err.message : String(err) });
  }
  return created;
}

async function executeRule(ctx: TenantContext, rule: Awaited<ReturnType<typeof db.workflowRule.findMany>>[number], src: WorkflowSource, tx: Tx): Promise<{ taskId: string | null; message: string; notification?: Parameters<typeof notify>[0] }> {
  const notice = src.noticeId ? await getNotice(ctx, src.noticeId) : null;
  const caseData = src.caseId ? await tx.case.findFirst({ where: { id: src.caseId, organizationId: ctx.organizationId, deletedAt: null }, select: { area: true, court: true } }) : null;
  if (!matchesConditions(rule.conditions, { label: src.label, content: notice?.content, court: notice?.court ?? caseData?.court, kind: notice?.kind, source: notice ? notice.externalKey?.startsWith("djen:") ? "DJEN" : notice.externalKey?.startsWith("mni:") ? "MNI" : notice.source : null, tag: notice?.tags, area: caseData?.area })) return { taskId: null, message: "Condições não atendidas." };
  let assigneeId: string | null = null;
  if (rule.assigneeMode === "TRIGGER_USER") assigneeId = src.userId;
  else if (rule.assigneeMode === "FIXED") assigneeId = rule.assigneeId;
  else if (rule.assigneeMode === "CASE_RESPONSIBLE" && src.caseId) {
    const r = await tx.caseMember.findFirst({ where: { organizationId: ctx.organizationId, caseId: src.caseId, role: "RESPONSIBLE" }, select: { userId: true } });
    assigneeId = r?.userId ?? src.userId; // sem responsável: quem executou a ação
  } else assigneeId = src.userId;

  if (assigneeId) {
    const active = await tx.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: assigneeId, status: "ACTIVE", user: { disabledAt: null } }, select: { id: true, role: { select: { permissions: true } } } });
    if (!active || !active.role.permissions.includes("tasks:read") || (rule.trigger === "DOCUMENT_UPLOADED" && !active.role.permissions.includes("documents:read"))) assigneeId = null;
    else if (src.caseId) {
      // processo sigiloso: o responsável precisa ter acesso, senão a tarefa fica sem responsável
      const c = await tx.case.findFirst({ where: { id: src.caseId, organizationId: ctx.organizationId }, select: { confidential: true, members: { where: { userId: assigneeId }, select: { id: true } } } });
      if (c?.confidential && c.members.length === 0 && !active.role.permissions.includes("organization:manage")) assigneeId = null;
    }
  }

  const title = rule.taskTitle.replaceAll("{{gatilho}}", src.label).slice(0, 200);
  const description = rule.taskDescription ? rule.taskDescription.replaceAll("{{gatilho}}", src.label).slice(0, 4000) : null;
  // Distribuição passa pelas mesmas verificações de acesso/sigilo e versão usadas na caixa.
  if (notice && rule.trigger === "NOTICE_RECEIVED") {
    if (rule.noticeAssigneeId) await bulkUpdateNotices(ctx, { action: "ASSIGN_USER", userId: rule.noticeAssigneeId, selection: [{ id: notice.id, updatedAt: notice.updatedAt.toISOString() }] }, tx);
    if (rule.noticeTags.length) {
      const current = await tx.courtNotice.findFirstOrThrow({ where: { id: notice.id, organizationId: ctx.organizationId, deletedAt: null }, select: { updatedAt: true } });
      await bulkUpdateNotices(ctx, { action: "ADD_TAGS", tags: rule.noticeTags, selection: [{ id: notice.id, updatedAt: current.updatedAt.toISOString() }] }, tx);
    }
  }

  const task = await tx.task.create({
    data: {
      organizationId: ctx.organizationId,
      title,
      description: [description, `Criada automaticamente pela regra "${rule.name}".`].filter(Boolean).join("\n\n"),
      priority: rule.priority,
      dueDate: ymdToDate(addDays(src.baseDate, rule.dueDays)),
      assigneeId,
      caseId: src.caseId ?? null,
      clientId: src.clientId ?? null,
      createdById: src.userId,
      sourceNoticeId: src.noticeId ?? null,
    },
  });
  if (task.caseId) await logCaseEvent(tx, ctx, task.caseId, { kind: "TASK_CREATED", title: `Tarefa criada por automação: ${task.title}`, description: `Regra: ${rule.name}` });
  await audit({ action: "workflow.task_created", organizationId: ctx.organizationId, userId: src.userId, resourceType: "task", resourceId: task.id, metadata: { ruleId: rule.id }, meta: ctx.meta }, tx);
  return { taskId: task.id, message: assigneeId ? "Tarefa criada." : "Tarefa criada sem responsável (acesso ou vínculo indisponível).", notification: assigneeId && assigneeId !== src.userId ? { organizationId: ctx.organizationId, userId: assigneeId, kind: "task.assigned", title: "Nova tarefa automática", body: task.title, link: `/tarefas/${task.id}`, dedupeKey: `task.assigned:${task.id}` } : undefined };
}

// ---------- gestão das regras ----------

export async function listRules(ctx: TenantContext) {
  assertCan(ctx, "workflows:manage");
  return db.workflowRule.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null }, orderBy: [{ trigger: "asc" }, { name: "asc" }], take: 200 });
}

export async function getRule(ctx: TenantContext, id: string) {
  assertCan(ctx, "workflows:manage");
  const r = await db.workflowRule.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null } });
  if (!r) throw new NotFoundError("Regra não encontrada.");
  return r;
}

async function ruleData(ctx: TenantContext, raw: unknown) {
  const v = ruleSchema.parse(raw);
  if (v.assigneeMode === "FIXED") {
    const m = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: v.assigneeId, status: "ACTIVE" }, select: { id: true } });
    if (!m) throw new ValidationError("Responsável inválido.", { assigneeId: ["Escolha um membro ativo do escritório."] });
  }
  if (v.noticeAssigneeId) {
    assertCan(ctx, "inbox:write");
    const m = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: v.noticeAssigneeId, status: "ACTIVE", user: { disabledAt: null }, role: { permissions: { has: "inbox:read" } } }, select: { id: true } });
    if (!m) throw new ValidationError("Destinatário da intimação inválido.");
  }
  if (v.noticeTags) assertCan(ctx, "inbox:write");
  return {
    conditions: v.conditions ?? EMPTY_CONDITIONS,
    noticeAssigneeId: v.noticeAssigneeId || null,
    noticeTags: normalizeTags((v.noticeTags ?? "").split(",")),
    name: v.name,
    trigger: v.trigger,
    taskTitle: v.taskTitle,
    taskDescription: v.taskDescription || null,
    dueDays: Number(v.dueDays),
    priority: v.priority,
    assigneeMode: v.assigneeMode,
    assigneeId: v.assigneeMode === "FIXED" ? v.assigneeId : null,
    active: v.active,
  };
}

export async function createRule(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "workflows:manage");
  const data = await ruleData(ctx, raw);
  return db.$transaction(async (tx) => {
    const r = await tx.workflowRule.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId } });
    await audit({ action: "workflow.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "workflow_rule", resourceId: r.id, meta: ctx.meta }, tx);
    return r;
  });
}

export async function updateRule(ctx: TenantContext, id: string, raw: unknown) {
  assertCan(ctx, "workflows:manage");
  const data = await ruleData(ctx, raw);
  const res = await db.workflowRule.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data });
  if (res.count === 0) throw new NotFoundError("Regra não encontrada.");
  await audit({ action: "workflow.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "workflow_rule", resourceId: id, meta: ctx.meta });
}

export async function setRuleActive(ctx: TenantContext, id: string, active: boolean) {
  assertCan(ctx, "workflows:manage");
  const res = await db.workflowRule.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { active } });
  if (res.count === 0) throw new NotFoundError("Regra não encontrada.");
  await audit({ action: active ? "workflow.enable" : "workflow.disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "workflow_rule", resourceId: id, meta: ctx.meta });
}

export async function deleteRule(ctx: TenantContext, id: string) {
  assertCan(ctx, "workflows:manage");
  const res = await db.workflowRule.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { deletedAt: new Date(), active: false } });
  if (res.count === 0) throw new NotFoundError("Regra não encontrada.");
  await audit({ action: "workflow.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "workflow_rule", resourceId: id, meta: ctx.meta });
}

export async function listRecentRuns(ctx: TenantContext) {
  assertCan(ctx, "workflows:manage");
  return db.workflowRun.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 50, include: { rule: { select: { name: true } } } });
}

