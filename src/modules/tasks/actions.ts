"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { addTaskComment, changeTaskStatus, createTask, deleteTask, updateTask } from "@/server/services/task.service";
import { commentSchema, TASK_STATUSES, taskSchema } from "./schemas";

const touch = (id?: string, caseId?: string) => {
  revalidatePath("/tarefas");
  revalidatePath("/");
  if (id) revalidatePath(`/tarefas/${id}`);
  if (caseId) revalidatePath(`/processos/${caseId}`);
};

export async function createTaskAction(input: unknown, noticeId?: string): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const t = await createTask(ctx, parse(taskSchema, input), { sourceNoticeId: noticeId ? parse(uuidSchema, noticeId) : undefined });
    touch(undefined, t.caseId ?? undefined);
    return { id: t.id };
  });
}

export async function updateTaskAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateTask(ctx, parse(uuidSchema, id), parse(taskSchema, input));
    touch(id);
    return undefined;
  });
}

export async function changeTaskStatusAction(id: string, status: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await changeTaskStatus(ctx, parse(uuidSchema, id), parse(z.enum(TASK_STATUSES), status));
    touch(id);
    return undefined;
  });
}

export async function deleteTaskAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteTask(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}

export async function addTaskCommentAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addTaskComment(ctx, parse(uuidSchema, id), parse(commentSchema, input));
    touch(id);
    return undefined;
  });
}
