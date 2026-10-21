"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { revokeCertificate } from "@/server/services/certificate.service";
import { requireTenant } from "@/server/session";

export async function revokeCertificateAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await revokeCertificate(ctx, parse(uuidSchema, id));
    revalidatePath("/certificados");
    return undefined;
  });
}
