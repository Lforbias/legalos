import { createCaseSchema } from "@/modules/cases/schemas";
import { createCase } from "./case.service";
import { leadSchema } from "@/modules/crm/schemas";
import { createLead } from "./crm.service";
import { accountSchema, categorySchema, costCenterSchema } from "@/modules/finance/schemas";
import { createAccount, createCategory, createCostCenter } from "./finance.service";
import { timeEntrySchema } from "@/modules/timesheet/schemas";
import { logTime } from "./team.service";
import { createSnippet } from "./snippet.service";
import { createTemplate } from "./template.service";
import { createBoard } from "./kanban.service";
import { setTaskStage, listTaskStages } from "./task-stage.service";
import { db } from "@/lib/db/client";
import { createActivityChecklist, addActivityCollaborator } from "./activity-details.service";
import { repeatActivity } from "./activity-series.service";
import { recurrenceSchema } from "@/lib/activities/recurrence";
import { runPackage, listPackages } from "./workflow-package.service";
import { runSchema } from "@/modules/kanban/package-schemas";
import { z } from "zod";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { isYmd } from "@/lib/dates/ymd";
import type { PermissionKey } from "@/lib/permissions/catalog";
import type { TenantContext } from "@/server/context";
import { clientSchema, type ClientInput } from "@/modules/clients/schemas";
import { eventSchema, EVENT_KINDS, type EventInput } from "@/modules/agenda/schemas";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskInput } from "@/modules/tasks/schemas";
import { assertActiveMember } from "./case.service";
import { createClient, getClient, updateClient } from "./client.service";
import { createEvent, deleteEvent, getEvent, updateEvent, changeEventStatus } from "./agenda.service";
import { addTaskComment, changeTaskStatus, getTask, updateTask } from "./task.service";

const text = (n: number) => z.string().trim().max(n);
const date = z.string().refine(isYmd, "Use AAAA-MM-DD.");
const optionalId = z.uuid().or(z.literal(""));
const version = { expectedUpdatedAt: z.iso.datetime().optional(), targetTitle: text(200).optional() };
export const OPERATION_KINDS = {
  CASE_CREATE: { label: "Cadastrar processo", risk: "HIGH", permission: "cases:write" },
  LEAD_CREATE: { label: "Cadastrar oportunidade", risk: "LOW", permission: "crm:write" },
  FINANCE_ACCOUNT_CREATE: { label: "Cadastrar conta financeira", risk: "HIGH", permission: "finance:manage" },
  FINANCE_CATEGORY_CREATE: { label: "Cadastrar categoria financeira", risk: "LOW", permission: "finance:manage" },
  FINANCE_COST_CENTER_CREATE: { label: "Cadastrar centro de custo", risk: "LOW", permission: "finance:manage" },
  TIME_CREATE: { label: "Registrar minhas horas", risk: "LOW", permission: "tasks:write" },
  SNIPPET_CREATE: { label: "Criar autotexto", risk: "LOW", permission: "templates:manage" },
  TEMPLATE_CREATE: { label: "Criar modelo de documento", risk: "LOW", permission: "templates:manage" },
  BOARD_CREATE: { label: "Criar quadro Kanban", risk: "LOW", permission: "organization:manage" },
  TASK_STAGE: { label: "Alterar etapa da tarefa", risk: "HIGH", permission: "tasks:write" },
  TASK_CHECKLIST: { label: "Criar checklist na tarefa", risk: "LOW", permission: "tasks:write" },
  TASK_COLLABORATOR: { label: "Adicionar colaborador na tarefa", risk: "LOW", permission: "tasks:write" },
  TASK_REPEAT: { label: "Repetir tarefa", risk: "HIGH", permission: "tasks:write" },
  EVENT_STATUS: { label: "Alterar situação do compromisso", risk: "HIGH", permission: "deadlines:write" },
  WORKFLOW_RUN: { label: "Executar pacote de tarefas", risk: "HIGH", permission: "tasks:write" },
  CLIENT_CREATE: { label: "Cadastrar cliente", risk: "LOW", permission: "clients:write" },
  CLIENT_UPDATE: { label: "Atualizar cliente", risk: "LOW", permission: "clients:write" },
  TASK_UPDATE: { label: "Atualizar tarefa", risk: "LOW", permission: "tasks:write" },
  TASK_STATUS: { label: "Alterar situação da tarefa", risk: "HIGH", permission: "tasks:write" },
  TASK_COMMENT: { label: "Comentar tarefa", risk: "LOW", permission: "tasks:write" },
  EVENT_CREATE: { label: "Criar compromisso", risk: "LOW", permission: "deadlines:write" },
  EVENT_UPDATE: { label: "Atualizar compromisso", risk: "LOW", permission: "deadlines:write" },
  EVENT_CANCEL: { label: "Cancelar compromisso", risk: "HIGH", permission: "deadlines:write" },
} as const satisfies Record<string, { label: string; risk: "LOW" | "HIGH"; permission: PermissionKey }>;
export type OperationKind = keyof typeof OPERATION_KINDS;
const changed = (id: string) => (v: Record<string, unknown>) => Object.keys(v).some(k => ![id, "expectedUpdatedAt", "targetTitle"].includes(k) && v[k] !== undefined);
const clientFields = { name: text(160).min(2), status: z.enum(["PROSPECT", "ACTIVE", "INACTIVE"]), tags: text(300), notes: text(4000), addressCity: text(80), addressState: text(2) };
const eventFields = { title: text(200).min(3), kind: z.enum(EVENT_KINDS), date, allDay: z.boolean(), startTime: text(5), endTime: text(5), location: text(200), description: text(2000), caseId: optionalId, clientId: optionalId };
export const OPERATION_SCHEMAS = {
  CASE_CREATE: createCaseSchema,
  LEAD_CREATE: leadSchema,
  FINANCE_ACCOUNT_CREATE: accountSchema,
  FINANCE_CATEGORY_CREATE: categorySchema,
  FINANCE_COST_CENTER_CREATE: costCenterSchema,
  TIME_CREATE: timeEntrySchema,
  SNIPPET_CREATE: z.object({ slug: text(60).min(1), name: text(120).min(3), description: text(300).default(""), body: text(20000).min(1), active: z.boolean().default(true) }),
  TEMPLATE_CREATE: z.object({ name: text(120).min(3), description: text(500).default(""), category: text(60).default(""), body: text(20000).min(1), active: z.boolean().default(true) }),
  BOARD_CREATE: z.object({ name: text(80).min(2) }),
  TASK_STAGE: z.object({ taskId: z.uuid(), stageId: z.uuid(), stageName: text(100).optional(), ...version }),
  TASK_CHECKLIST: z.object({ taskId:z.uuid(), title:text(100).min(2), items:z.array(text(500).min(1)).min(1).max(30), ...version }),
  TASK_COLLABORATOR: z.object({ taskId:z.uuid(), userId:z.uuid(), collaboratorName:text(200).optional(), ...version }),
  TASK_REPEAT: z.object({ taskId:z.uuid(), ...recurrenceSchema.shape, ...version }),
  EVENT_STATUS: z.object({ eventId:z.uuid(), status:z.enum(TASK_STATUSES), ...version }),
  WORKFLOW_RUN: z.object({packageId:z.uuid(),workflowPreview:text(12000).optional(),...runSchema.shape,...version}),
  CLIENT_CREATE: z.object({ ...clientFields, type: z.enum(["PERSON", "COMPANY"]).default("PERSON"), status: clientFields.status.default("ACTIVE"), tags: clientFields.tags.default(""), notes: clientFields.notes.default(""), addressCity: clientFields.addressCity.default(""), addressState: clientFields.addressState.default("") }),
  CLIENT_UPDATE: z.object({ clientId: z.uuid(), ...version, name: clientFields.name.optional(), status: clientFields.status.optional(), tags: clientFields.tags.optional(), notes: clientFields.notes.optional(), addressCity: clientFields.addressCity.optional(), addressState: clientFields.addressState.optional() }).refine(changed("clientId"), "Informe ao menos um campo para alterar."),
  TASK_UPDATE: z.object({ taskId: z.uuid(), ...version, title: text(200).min(3).optional(), description: text(4000).optional(), priority: z.enum(TASK_PRIORITIES).optional(), dueDate: date.or(z.literal("")).optional(), assigneeId: optionalId.optional() }).refine(changed("taskId"), "Informe ao menos um campo para alterar."),
  TASK_STATUS: z.object({ taskId: z.uuid(), status: z.enum(TASK_STATUSES), ...version }),
  TASK_COMMENT: z.object({ taskId: z.uuid(), body: text(2000).min(1), ...version }),
  EVENT_CREATE: z.object({ ...eventFields, kind: eventFields.kind.default("MEETING"), allDay: eventFields.allDay.default(false), startTime: eventFields.startTime.default(""), endTime: eventFields.endTime.default(""), location: eventFields.location.default(""), description: eventFields.description.default(""), caseId: eventFields.caseId.default(""), clientId: eventFields.clientId.default("") }),
  EVENT_UPDATE: z.object({ eventId: z.uuid(), ...version, title: eventFields.title.optional(), kind: eventFields.kind.optional(), date: date.optional(), allDay: eventFields.allDay.optional(), startTime: eventFields.startTime.optional(), endTime: eventFields.endTime.optional(), location: eventFields.location.optional(), description: eventFields.description.optional() }).refine(changed("eventId"), "Informe ao menos um campo para alterar."),
  EVENT_CANCEL: z.object({ eventId: z.uuid(), ...version }),
};

function clientInput(c?: Awaited<ReturnType<typeof getClient>>): ClientInput {
  return { type: c?.type ?? "PERSON", status: c?.status ?? "ACTIVE", name: c?.name ?? "", tradeName: c?.tradeName ?? "", document: c?.document ?? "", email: c?.email ?? "", phone: c?.phone ?? "", birthDate: c?.birthDate?.toISOString().slice(0, 10) ?? "", tags: c?.tags.join(",") ?? "", notes: c?.notes ?? "", addressZip: c?.addressZip ?? "", addressStreet: c?.addressStreet ?? "", addressNumber: c?.addressNumber ?? "", addressComplement: c?.addressComplement ?? "", addressDistrict: c?.addressDistrict ?? "", addressCity: c?.addressCity ?? "", addressState: c?.addressState ?? "" };
}
function eventInput(e: Awaited<ReturnType<typeof getEvent>>): EventInput {
  return { title: e.title, kind: e.kind, date: e.date, allDay: e.allDay, startTime: e.startTime, endTime: e.endTime, location: e.location ?? "", description: e.description ?? "", caseId: e.caseId ?? "", clientId: e.clientId ?? "" };
}
function patch<T extends object>(base: T, p: Record<string, unknown>, fields: string[]): T {
  const changes = Object.fromEntries(fields.filter(k => p[k] !== undefined).map(k => [k, p[k]]));
  return { ...base, ...changes };
}
const clientKeys = Object.keys(clientFields);
const taskKeys = ["title", "description", "priority", "dueDate", "assigneeId"];
const eventKeys = ["title", "kind", "date", "allDay", "startTime", "endTime", "location", "description"];
function checkVersion(p: Record<string, unknown>, date: Date) {
  if (p.expectedUpdatedAt && p.expectedUpdatedAt !== date.toISOString()) throw new ConflictError("O registro foi alterado depois desta proposta. Consulte os dados atuais e crie uma nova proposta.");
}

/** Identifica o alvo e guarda uma versão para evitar aplicar alteração com contexto antigo. Não modifica o cadastro. */
export async function prepareOperation(ctx: TenantContext, kind: OperationKind, p: Record<string, unknown>) {
  if (kind === "CASE_CREATE") return { clientId: p.clientId as string || null };
  if (kind === "LEAD_CREATE") return {};
  if (["FINANCE_ACCOUNT_CREATE", "FINANCE_CATEGORY_CREATE", "FINANCE_COST_CENTER_CREATE", "SNIPPET_CREATE", "TEMPLATE_CREATE", "BOARD_CREATE"].includes(kind)) return {};
  if (kind === "TIME_CREATE") return { caseId: p.caseId as string || null };
  if(kind==="WORKFLOW_RUN") {
    const pack=(await listPackages(ctx)).find(x=>x.id===p.packageId&&x.active);
    if(!pack)throw new ValidationError("Pacote indisponível.");
    p.expectedUpdatedAt=pack.updatedAt.toISOString();p.targetTitle=pack.name;
    p.workflowPreview=pack.steps.map((s,i)=>`${i+1}. ${s.title}: ${s.dueDays} dias ${s.countType=== "BUSINESS"?"úteis":"corridos"}; referência ${s.relativeTo}; ${s.waitForPrevious||s.relativeTo==="PREVIOUS_DONE"?"aguarda etapa anterior":"sem espera"}${s.ask?`; ${s.ask}: ${(p.answers as Record<string,string>|undefined)?.[s.id]??"[resposta pendente]"}`:""}`).join("\n");
    return {caseId:p.caseId as string||null,clientId:p.clientId as string||null};
  }
  if (kind === "CLIENT_CREATE") { clientSchema.parse(patch({ ...clientInput(), type: p.type as ClientInput["type"] }, p, clientKeys)); return {}; }
  if (kind === "CLIENT_UPDATE") {
    const c = await getClient(ctx, p.clientId as string);
    clientSchema.parse(patch(clientInput(c), p, clientKeys));
    p.expectedUpdatedAt = c.updatedAt.toISOString(); p.targetTitle = c.name;
    return { clientId: c.id };
  }
  if (kind.startsWith("TASK_")) {
    const t = await getTask(ctx, p.taskId as string);
    if (kind === "TASK_STAGE") {
      const stage = (await listTaskStages(ctx)).find(s => s.id === p.stageId && s.active);
      if (!stage) throw new ValidationError("Etapa não encontrada ou inativa.");
      p.stageName = stage.name;
    }
    if(kind==="TASK_COLLABORATOR"){
      await assertActiveMember(ctx,p.userId as string);
      p.collaboratorName=(await db.user.findUnique({where:{id:p.userId as string},select:{name:true}}))?.name??"";
    }
    if (p.assigneeId) await assertActiveMember(ctx, p.assigneeId as string);
    p.expectedUpdatedAt = t.updatedAt.toISOString(); p.targetTitle = t.title;
    return { caseId: t.caseId, clientId: t.clientId };
  }
  if (kind === "EVENT_CREATE") { eventSchema.parse(p); return { caseId: p.caseId as string || null, clientId: p.clientId as string || null }; }
  const e = await getEvent(ctx, p.eventId as string);
  if (kind === "EVENT_UPDATE") eventSchema.parse(patch(eventInput(e), p, eventKeys));
  p.expectedUpdatedAt = e.updatedAt.toISOString(); p.targetTitle = e.title;
  return { caseId: e.caseId, clientId: e.clientId };
}

export async function executeOperation(ctx: TenantContext, kind: OperationKind, p: Record<string, unknown>): Promise<{ type: string; id: string }> {
  if (kind === "CASE_CREATE") return { type: "case", id: (await createCase(ctx, createCaseSchema.parse(p))).id };
  if (kind === "LEAD_CREATE") return { type: "lead", id: (await createLead(ctx, p)).id };

  if (kind === "FINANCE_ACCOUNT_CREATE") return { type: "finance_account", id: (await createAccount(ctx, p)).id };
  if (kind === "FINANCE_CATEGORY_CREATE") return { type: "finance_category", id: (await createCategory(ctx, p)).id };
  if (kind === "FINANCE_COST_CENTER_CREATE") return { type: "finance_cost_center", id: (await createCostCenter(ctx, p)).id };
  if (kind === "TIME_CREATE") return { type: "time_entry", id: (await logTime(ctx, timeEntrySchema.parse(p))).id };
  if (kind === "SNIPPET_CREATE") return { type: "snippet", id: (await createSnippet(ctx, OPERATION_SCHEMAS.SNIPPET_CREATE.parse(p))).id };
  if (kind === "TEMPLATE_CREATE") return { type: "template", id: (await createTemplate(ctx, OPERATION_SCHEMAS.TEMPLATE_CREATE.parse(p))).id };
  if (kind === "BOARD_CREATE") return { type: "kanban_board", id: await createBoard(ctx, p.name as string) };

  if(kind==="WORKFLOW_RUN") {
    const pack=(await listPackages(ctx)).find(x=>x.id===p.packageId&&x.active);
    if(!pack)throw new ValidationError("Pacote indisponível.");checkVersion(p,pack.updatedAt);
    await runPackage(ctx,pack.id,runSchema.parse(p));
    return {type:p.caseId?"case_note":"client",id:p.caseId as string||p.clientId as string};
  }
  if (kind === "CLIENT_CREATE") {
    const c = await createClient(ctx, patch({ ...clientInput(), type: p.type as ClientInput["type"] }, p, clientKeys));
    return { type: "client", id: c.id };
  }
  if (kind === "CLIENT_UPDATE") {
    const c = await getClient(ctx, p.clientId as string); checkVersion(p, c.updatedAt);
    await updateClient(ctx, c.id, patch(clientInput(c), p, clientKeys)); return { type: "client", id: c.id };
  }
  if (kind.startsWith("TASK_")) {
    const t = await getTask(ctx, p.taskId as string); checkVersion(p, t.updatedAt);
    if (kind === "TASK_STAGE") await setTaskStage(ctx, t.id, p.stageId as string);
    else if (kind === "TASK_STATUS") await changeTaskStatus(ctx, t.id, p.status as TaskInput["status"]);
    else if (kind === "TASK_COMMENT") await addTaskComment(ctx, t.id, { body: p.body as string });
    else if (kind === "TASK_CHECKLIST") await createActivityChecklist(ctx,"TASK",t.id,p);
    else if (kind === "TASK_COLLABORATOR") await addActivityCollaborator(ctx,"TASK",t.id,p.userId as string);
    else if (kind === "TASK_REPEAT") await repeatActivity(ctx,"TASK",t.id,recurrenceSchema.parse(p));
    else if (kind === "TASK_UPDATE") await updateTask(ctx, t.id, patch<TaskInput>({ title: t.title, description: t.description ?? "", status: t.status, priority: t.priority, dueDate: t.dueDate?.toISOString().slice(0, 10) ?? "", assigneeId: t.assigneeId ?? "", caseId: t.caseId ?? "", clientId: t.clientId ?? "" }, p, taskKeys));
    return { type: "task", id: t.id };
  }
  if (kind === "EVENT_CREATE") { const e = await createEvent(ctx, p as unknown as EventInput); return { type: "agenda_event", id: e.id }; }
  const e = await getEvent(ctx, p.eventId as string); checkVersion(p, e.updatedAt);
  if (kind === "EVENT_STATUS") await changeEventStatus(ctx,e.id,p.status as TaskInput["status"]);
  else if (kind === "EVENT_UPDATE") await updateEvent(ctx, e.id, patch(eventInput(e), p, eventKeys));
  else if (kind === "EVENT_CANCEL") { await deleteEvent(ctx, e.id); return { type: "agenda_event_canceled", id: e.id }; }
  else throw new ValidationError("Operação desconhecida.");
  return { type: "agenda_event", id: e.id };
}
