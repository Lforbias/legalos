import { z } from "zod";
import type { ToolDef } from "./rute-tools.service";
import { OPERATION_KINDS, OPERATION_SCHEMAS, prepareOperation, executeOperation, type OperationKind } from "./rute-operations.service";
import { createTask } from "./task.service";
import { taskSchema } from "@/modules/tasks/schemas";
import { audit } from "./audit.service";

/** Explicit allowlist: no external send, protocol, payment, deletion or access grant. */
const operations = [
  ["criar_cliente", "CLIENT_CREATE"],
  ["atualizar_cliente", "CLIENT_UPDATE"],
  ["criar_processo", "CASE_CREATE"],
  ["criar_oportunidade", "LEAD_CREATE"],
  ["atualizar_tarefa", "TASK_UPDATE"],
  ["alterar_situacao_tarefa", "TASK_STATUS"],
  ["comentar_tarefa", "TASK_COMMENT"],
  ["criar_checklist_tarefa", "TASK_CHECKLIST"],
  ["alterar_etapa_tarefa", "TASK_STAGE"],
  ["criar_compromisso", "EVENT_CREATE"],
  ["atualizar_compromisso", "EVENT_UPDATE"],
  ["alterar_situacao_compromisso", "EVENT_STATUS"],
  ["criar_modelo_documento", "TEMPLATE_CREATE"],
  ["criar_autotexto", "SNIPPET_CREATE"],
  ["registrar_horas", "TIME_CREATE"],
  ["criar_categoria_financeira", "FINANCE_CATEGORY_CREATE"],
  ["criar_centro_custo", "FINANCE_COST_CENTER_CREATE"],
  ["criar_quadro_kanban", "BOARD_CREATE"],
] as const satisfies ReadonlyArray<readonly [string, OperationKind]>;

const internal = ["stageName", "targetTitle", "collaboratorName", "workflowPreview"];
export const ACTION_TOOLS: ToolDef[] = operations.map(([name, kind]) => {
  const schema = OPERATION_SCHEMAS[kind] as z.ZodType<Record<string, unknown>>;
  const input = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as ToolDef["input"];
  for (const field of internal) delete input.properties[field];
  return {
    name, title: OPERATION_KINDS[kind].label, scope: "execute", permission: OPERATION_KINDS[kind].permission,
    description: `${OPERATION_KINDS[kind].label} DIRETAMENTE no LegalOS, sem proposta ou aprovação posterior. Use somente quando a execução estiver autorizada. Resolva nomes para IDs antes. Campos omitidos em atualizações são preservados. Não repita uma criação após falha de conexão sem consultar se ela ocorreu.`,
    schema, input,
    run: async (ctx, args, origin) => {
      // Preserve caller's concurrency precondition: preparation captures the current version.
      const expected = args.expectedUpdatedAt;
      await prepareOperation(ctx, kind, args);
      if (expected !== undefined) args.expectedUpdatedAt = expected;
      const result = await executeOperation(ctx, kind, args);
      await audit({ action: "rute.action_execute", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: result.type, resourceId: result.id, metadata: { tool: name, kind, via: origin.via, connection: origin.connection }, meta: ctx.meta });
      return { executed: true, operation: name, ...result };
    },
  };
});

const createTaskInput = taskSchema.extend({
  description: taskSchema.shape.description.default(""), status: taskSchema.shape.status.default("TODO"),
  priority: taskSchema.shape.priority.default("NORMAL"), dueDate: taskSchema.shape.dueDate.default(""),
  assigneeId: taskSchema.shape.assigneeId.default(""), caseId: taskSchema.shape.caseId.default(""), clientId: taskSchema.shape.clientId.default(""),
});
ACTION_TOOLS.push({
  name: "criar_tarefa", title: "Criar tarefa diretamente", scope: "execute", permission: "tasks:write",
  description: "Cria tarefa DIRETAMENTE no LegalOS, sem proposta. Use IDs reais de cliente, processo e responsável. Sem responsável informado, a tarefa fica sem responsável. Não repita a criação após falha de conexão sem verificar o resultado.",
  schema: createTaskInput,
  input: z.toJSONSchema(createTaskInput, { io: "input", unrepresentable: "any" }) as ToolDef["input"],
  run: async (ctx, args, origin) => {
    const task = await createTask(ctx, createTaskInput.parse(args));
    await audit({ action: "rute.action_execute", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task", resourceId: task.id, metadata: { tool: "criar_tarefa", via: origin.via, connection: origin.connection }, meta: ctx.meta });
    return { executed: true, operation: "criar_tarefa", type: "task", id: task.id, href: `/tarefas/${task.id}` };
  },
});
