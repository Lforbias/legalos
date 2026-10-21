"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { ValidationError } from "@/lib/permissions/check";
import { requireTenant } from "@/server/session";
import { addTaskAttachment, deleteTaskAttachment, deleteTaskLabel, deleteTaskType, saveTaskLabel, saveTaskType, setTaskClassification } from "@/server/services/task-extras.service";
import { classificationSchema, TASK_ATTACHMENT_MAX_BYTES, taskLabelSchema, taskTypeSchema } from "./extras-schemas";

const touch = (taskId?: string) => {
  revalidatePath("/configuracoes/tarefas");
  revalidatePath("/tarefas");
  if (taskId) revalidatePath(`/tarefas/${taskId}`);
};

export async function saveTaskTypeAction(id: string | null, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveTaskType(ctx, id ? parse(uuidSchema, id) : null, parse(taskTypeSchema, input));
    touch();
    return undefined;
  });
}
export async function deleteTaskTypeAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteTaskType(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}
export async function saveTaskLabelAction(id: string | null, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveTaskLabel(ctx, id ? parse(uuidSchema, id) : null, parse(taskLabelSchema, input));
    touch();
    return undefined;
  });
}
export async function deleteTaskLabelAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteTaskLabel(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}
export async function setTaskClassificationAction(taskId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setTaskClassification(ctx, parse(uuidSchema, taskId), parse(classificationSchema, input));
    touch(taskId);
    return undefined;
  });
}
export async function addTaskAttachmentAction(taskId: string, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Escolha um arquivo.", { file: ["Escolha um arquivo."] });
    if (file.size > TASK_ATTACHMENT_MAX_BYTES) throw new ValidationError("Arquivo muito grande.", { file: ["O tamanho máximo é 8 MB."] });
    await addTaskAttachment(ctx, parse(uuidSchema, taskId), { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
    touch(taskId);
    return undefined;
  });
}
export async function deleteTaskAttachmentAction(taskId: string, id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteTaskAttachment(ctx, parse(uuidSchema, id));
    touch(taskId);
    return undefined;
  });
}
