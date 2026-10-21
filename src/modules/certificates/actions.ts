"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { authorizeCertificateUser, revokeCertificate, unauthorizeCertificateUser } from "@/server/services/certificate.service";
import { requireTenant } from "@/server/session";

export async function revokeCertificateAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await revokeCertificate(ctx, parse(uuidSchema, id));
    revalidatePath("/certificados");
    return undefined;
  });
}

export async function authorizeCertificateUserAction(certificateId: string, userId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await authorizeCertificateUser(ctx, parse(uuidSchema, certificateId), parse(uuidSchema, userId));
    revalidatePath("/certificados");
    return undefined;
  });
}

export async function unauthorizeCertificateUserAction(certificateId: string, userId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await unauthorizeCertificateUser(ctx, parse(uuidSchema, certificateId), parse(uuidSchema, userId));
    revalidatePath("/certificados");
    return undefined;
  });
}
