import { z } from "zod";
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL } from "@/modules/tasks/schemas";

export const WORKFLOW_TRIGGERS = ["CASE_CREATED", "DEADLINE_VALIDATED", "NOTICE_RECEIVED", "LEAD_WON"] as const;
export type WorkflowTriggerKey = (typeof WORKFLOW_TRIGGERS)[number];
export const TRIGGER_LABEL: Record<WorkflowTriggerKey, string> = {
  CASE_CREATED: "Quando um processo for cadastrado",
  DEADLINE_VALIDATED: "Quando um prazo for validado",
  NOTICE_RECEIVED: "Quando uma intimação for registrada",
  LEAD_WON: "Quando um lead virar cliente",
};
export const TRIGGER_HINT: Record<WorkflowTriggerKey, string> = {
  CASE_CREATED: "{{gatilho}} = título do processo; prazo contado a partir da data do cadastro.",
  DEADLINE_VALIDATED: "{{gatilho}} = título do prazo; prazo contado a partir da data fatal do prazo (0 = na própria data).",
  NOTICE_RECEIVED: "{{gatilho}} = título da intimação; prazo contado a partir da data de recebimento.",
  LEAD_WON: "{{gatilho}} = nome do cliente; prazo contado a partir de hoje.",
};
export const WORKFLOW_ASSIGNEES = ["TRIGGER_USER", "CASE_RESPONSIBLE", "FIXED"] as const;
export const ASSIGNEE_LABEL: Record<(typeof WORKFLOW_ASSIGNEES)[number], string> = {
  TRIGGER_USER: "Quem executou a ação",
  CASE_RESPONSIBLE: "Responsável pelo processo (se houver)",
  FIXED: "Um membro específico",
};

export const ruleSchema = z
  .object({
    name: z.string().trim().min(3, "Informe um nome (mín. 3 caracteres).").max(120),
    trigger: z.enum(WORKFLOW_TRIGGERS),
    taskTitle: z.string().trim().min(3, "Informe o título da tarefa.").max(200),
    taskDescription: z.string().trim().max(2000, "Máximo de 2000 caracteres."),
    dueDays: z.string().refine((v) => /^\d{1,3}$/.test(v) && Number(v) <= 365, "Use um número de 0 a 365."),
    priority: z.enum(TASK_PRIORITIES),
    assigneeMode: z.enum(WORKFLOW_ASSIGNEES),
    assigneeId: z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador inválido."),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.assigneeMode === "FIXED" && !v.assigneeId) ctx.addIssue({ code: "custom", path: ["assigneeId"], message: "Escolha o membro." });
    if (v.assigneeMode === "CASE_RESPONSIBLE" && v.trigger === "LEAD_WON") ctx.addIssue({ code: "custom", path: ["assigneeMode"], message: "Lead ganho não tem processo." });
  });
export type RuleInput = z.infer<typeof ruleSchema>;
export const EMPTY_RULE: RuleInput = { name: "", trigger: "CASE_CREATED", taskTitle: "", taskDescription: "", dueDays: "3", priority: "NORMAL", assigneeMode: "TRIGGER_USER", assigneeId: "", active: true };
export { TASK_PRIORITIES, TASK_PRIORITY_LABEL };
