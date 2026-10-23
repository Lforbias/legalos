"use server";
import { revalidatePath } from "next/cache";
import { runAction, parse } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { uuidSchema } from "@/lib/validation/common";
import { saveTaskStage, setTaskStage } from "@/server/services/task-stage.service";
export async function saveStageAction(id: string | null, input: unknown) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveTaskStage(ctx, id ? parse(uuidSchema, id) : null, input);
    revalidatePath("/tarefas", "layout");
  });
}
export async function selectStageAction(taskId: string, stageId: string) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setTaskStage(ctx, parse(uuidSchema, taskId), parse(uuidSchema, stageId));
    revalidatePath("/tarefas", "layout");
    revalidatePath("/");
    revalidatePath("/processos/[id]", "page");
  });
}
