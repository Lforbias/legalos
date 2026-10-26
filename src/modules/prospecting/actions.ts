"use server";
import { revalidatePath } from "next/cache";
import { requirePlatform } from "@/server/platform";
import { runAction } from "@/server/action-helpers";
import { updateCommercialProspect } from "@/server/services/prospecting.service";

export async function saveProspectAction(input: unknown) {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await updateCommercialProspect(pc, input);
    revalidatePath("/admin/comercial/prospeccao");
    return undefined;
  });
}
