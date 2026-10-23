"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@/lib/validation/common";
import { runAction, parse } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { setDocumentBookmark } from "@/server/services/autos.service";
export async function bookmarkAction(id: string, favorite: boolean) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setDocumentBookmark(ctx, parse(uuidSchema, id), parse(z.boolean(), favorite));
    revalidatePath("/processos/[id]/autos", "page");
  });
}

export async function enqueueAutosAction(caseId: string) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const { enqueueAutos } = await import("@/server/services/autos-queue.service");
    return enqueueAutos(ctx, parse(uuidSchema, caseId));
  });
}
export async function autosJobAction(caseId: string) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const { latestAutosJob } = await import("@/server/services/autos-queue.service");
    const job = await latestAutosJob(ctx, parse(uuidSchema, caseId));
    return job ? { ...job, updatedAt: job.updatedAt.toISOString(), nextRunAt: job.nextRunAt.toISOString() } : null;
  });
}
export async function retryAutosAction(caseId: string, id: string) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const { retryAutos } = await import("@/server/services/autos-queue.service");
    await retryAutos(ctx, parse(uuidSchema, caseId), parse(uuidSchema, id));
  });
}
