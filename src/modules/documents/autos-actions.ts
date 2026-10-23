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
